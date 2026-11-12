-- =============================================================================
-- 0002 private apps: Workspace, Board, Focus, Habits, Stash
-- =============================================================================
-- Rules every table here follows (see docs/CONVENTIONS.md):
--   1. `user_id uuid not null default auth.uid()` referencing auth.users, cascade.
--   2. RLS on, one policy: user_id = auth.uid() for all operations.
--   3. Children carry their own user_id AND a composite foreign key
--      (parent_id, user_id) -> parent (id, user_id). The database itself then
--      guarantees a child can never point at another user's parent.
--   4. Ordering uses fractional-index strings (`position text collate "C"`), so a
--      drag-and-drop writes one row instead of renumbering a whole list.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- Workspace (notes)
-- One opaque document per page. That is what makes end-to-end encryption
-- possible later: `content` (JSON) can be swapped for `content_cipher` (bytes
-- encrypted in the browser) without changing the table shape.
-- ----------------------------------------------------------------------------
create table public.workspace_pages (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  parent_id      uuid,
  title          text not null default '' check (char_length(title) <= 300),
  icon           text check (char_length(icon) <= 16),
  position       text collate "C" not null default 'a0',
  encryption     smallint not null default 0 check (encryption in (0, 1)), -- 0 plain, 1 E2EE v1
  content        jsonb,        -- BlockNote document (encryption = 0)
  content_cipher bytea,        -- AES-GCM ciphertext (encryption = 1)
  title_cipher   bytea,
  archived_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, user_id),
  foreign key (parent_id, user_id) references public.workspace_pages (id, user_id) on delete cascade,
  check (parent_id is distinct from id),
  check (
    (encryption = 0 and content_cipher is null and title_cipher is null)
    or (encryption = 1 and content is null and content_cipher is not null)
  ),
  check (content is null or pg_column_size(content) <= 1048576),
  check (content_cipher is null or octet_length(content_cipher) <= 1572864)
);
create index workspace_pages_tree_idx on public.workspace_pages (user_id, parent_id, position);

-- Password-wrapped master key for E2EE (Phase 4). Empty until a user opts in.
create table public.workspace_keys (
  user_id     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  wrapped_key bytea not null check (octet_length(wrapped_key) <= 512),
  kdf_salt    bytea not null check (octet_length(kdf_salt) between 16 and 64),
  kdf_params  jsonb not null,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Board (kanban)
-- ----------------------------------------------------------------------------
create table public.boards (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 120),
  template   text not null default 'blank' check (template in ('blank', 'uni', 'jobs')),
  position   text collate "C" not null default 'a0',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index boards_user_idx on public.boards (user_id, position);

create table public.board_columns (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  board_id   uuid not null,
  name       text not null check (char_length(name) between 1 and 80),
  color      text check (color ~ '^[a-z]{2,16}$'),          -- a design-token name, not a hex value
  wip_limit  int check (wip_limit between 1 and 999),
  position   text collate "C" not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, board_id, user_id),
  foreign key (board_id, user_id) references public.boards (id, user_id) on delete cascade
);
create index board_columns_board_idx on public.board_columns (board_id, position);

create table public.board_labels (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  board_id   uuid not null,
  name       text not null check (char_length(name) between 1 and 40),
  color      text check (color ~ '^[a-z]{2,16}$'),
  created_at timestamptz not null default now(),
  unique (id, board_id, user_id),
  foreign key (board_id, user_id) references public.boards (id, user_id) on delete cascade
);
create index board_labels_board_idx on public.board_labels (board_id);

-- Custom fields per board (due date, course, priority, link ...).
-- Values live in board_cards.field_values as { "<field id>": value }.
create table public.board_fields (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  board_id   uuid not null,
  name       text not null check (char_length(name) between 1 and 40),
  type       text not null check (type in ('text', 'number', 'date', 'select', 'url')),
  options    jsonb not null default '[]' check (pg_column_size(options) <= 4096),
  position   text collate "C" not null,
  created_at timestamptz not null default now(),
  foreign key (board_id, user_id) references public.boards (id, user_id) on delete cascade
);
create index board_fields_board_idx on public.board_fields (board_id, position);

create table public.board_cards (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  board_id     uuid not null,
  column_id    uuid not null,
  title        text not null check (char_length(title) between 1 and 300),
  description  text check (char_length(description) <= 10000),
  position     text collate "C" not null,
  field_values jsonb not null default '{}' check (pg_column_size(field_values) <= 8192),
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, user_id),
  unique (id, board_id, user_id),
  foreign key (board_id, user_id) references public.boards (id, user_id) on delete cascade,
  -- no action (not cascade): deleting a column that still has cards is refused,
  -- but deleting the whole board removes both in one statement.
  foreign key (column_id, board_id, user_id)
    references public.board_columns (id, board_id, user_id)
);
create index board_cards_column_idx on public.board_cards (column_id, position);
create index board_cards_user_idx   on public.board_cards (user_id);

create table public.board_card_labels (
  card_id  uuid not null,
  label_id uuid not null,
  board_id uuid not null,
  user_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  primary key (card_id, label_id),
  foreign key (card_id, board_id, user_id)
    references public.board_cards (id, board_id, user_id) on delete cascade,
  foreign key (label_id, board_id, user_id)
    references public.board_labels (id, board_id, user_id) on delete cascade
);
create index board_card_labels_label_idx on public.board_card_labels (label_id);

-- ----------------------------------------------------------------------------
-- Focus (pomodoro)
-- ----------------------------------------------------------------------------
create table public.focus_settings (
  user_id            uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  work_minutes       int not null default 25 check (work_minutes between 1 and 180),
  short_break_minutes int not null default 5 check (short_break_minutes between 1 and 60),
  long_break_minutes int not null default 15 check (long_break_minutes between 1 and 120),
  cycles_before_long int not null default 4 check (cycles_before_long between 1 and 12),
  updated_at         timestamptz not null default now()
);

create table public.focus_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind            text not null default 'work' check (kind in ('work', 'short_break', 'long_break')),
  started_at      timestamptz not null,
  ended_at        timestamptz,
  planned_seconds int not null check (planned_seconds between 60 and 10800),
  actual_seconds  int check (actual_seconds between 0 and 10800),
  completed       boolean not null default false,
  local_day       date not null,          -- the user's calendar day, for per-day stats
  card_id         uuid,                   -- optional link to a Board card
  created_at      timestamptz not null default now(),
  foreign key (card_id, user_id) references public.board_cards (id, user_id)
    on delete set null (card_id)
);
create index focus_sessions_day_idx on public.focus_sessions (user_id, local_day);

-- ----------------------------------------------------------------------------
-- Habits
-- ----------------------------------------------------------------------------
create table public.habits (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  color       text check (color ~ '^[a-z]{2,16}$'),
  icon        text check (char_length(icon) <= 16),
  position    text collate "C" not null default 'a0',
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, user_id)
);
create index habits_user_idx on public.habits (user_id, position);

-- One row per habit per day; the primary key makes a double check-in impossible.
create table public.habit_checkins (
  habit_id   uuid not null,
  day        date not null,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (habit_id, day),
  foreign key (habit_id, user_id) references public.habits (id, user_id) on delete cascade
);
create index habit_checkins_user_day_idx on public.habit_checkins (user_id, day);

-- ----------------------------------------------------------------------------
-- Stash (bookmarks)
-- ----------------------------------------------------------------------------
create table public.stash_bookmarks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  url         text not null check (url ~ '^https?://' and char_length(url) <= 2048),
  title       text check (char_length(title) <= 300),
  description text check (char_length(description) <= 1000),
  favicon_url text check (favicon_url ~ '^https://' and char_length(favicon_url) <= 2048),
  tags        text[] not null default '{}' check (cardinality(tags) <= 20),
  search      tsvector generated always as (
                to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || url)
              ) stored,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, url)
);
create index stash_bookmarks_search_idx on public.stash_bookmarks using gin (search);
create index stash_bookmarks_tags_idx   on public.stash_bookmarks using gin (tags);

-- ----------------------------------------------------------------------------
-- RLS + grants + triggers, applied uniformly to every table above
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
  owner_tables text[] := array[
    'workspace_pages', 'workspace_keys',
    'boards', 'board_columns', 'board_labels', 'board_fields', 'board_cards', 'board_card_labels',
    'focus_settings', 'focus_sessions',
    'habits', 'habit_checkins',
    'stash_bookmarks'
  ];
begin
  foreach t in array owner_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t || '_owner', t);
  end loop;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'workspace_pages', 'boards', 'board_columns', 'board_cards',
    'focus_settings', 'habits', 'stash_bookmarks'
  ] loop
    execute format(
      'create trigger %I before update on public.%I
         for each row execute function private.set_updated_at()', t || '_updated_at', t);
  end loop;
end $$;

-- Per-user row caps (abuse guard for the 500 MB free database)
create trigger workspace_pages_cap before insert on public.workspace_pages
  for each row execute function private.enforce_row_cap('2000');
create trigger boards_cap before insert on public.boards
  for each row execute function private.enforce_row_cap('50');
create trigger board_columns_cap before insert on public.board_columns
  for each row execute function private.enforce_row_cap('1000');
create trigger board_cards_cap before insert on public.board_cards
  for each row execute function private.enforce_row_cap('5000');
create trigger habits_cap before insert on public.habits
  for each row execute function private.enforce_row_cap('100');
create trigger stash_bookmarks_cap before insert on public.stash_bookmarks
  for each row execute function private.enforce_row_cap('5000');
create trigger focus_sessions_cap before insert on public.focus_sessions
  for each row execute function private.enforce_row_cap('20000');

-- Live sync across tabs (Supabase Realtime respects RLS). Guarded so the file
-- also runs on a plain Postgres in tests.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.boards, public.board_columns, public.board_labels, public.board_fields,
      public.board_cards, public.board_card_labels;
  end if;
end $$;
