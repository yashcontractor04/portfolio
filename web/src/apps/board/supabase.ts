import type { SupabaseClient } from "@supabase/supabase-js";
import type { BoardData, BoardMeta, BoardStore, Card, Column, Field } from "./types";

const COLUMN = "id, board_id, name, color, wip_limit, position";
const FIELD = "id, board_id, name, type, position";
const CARD = "id, board_id, column_id, title, description, position, field_values";

/**
 * Board backed by the `boards` / `board_*` tables. Row-level security limits
 * every query to the logged-in user's rows; `user_id` defaults to auth.uid().
 */
export function createSupabaseBoard(supabase: SupabaseClient): BoardStore {
  const check = <T>(result: { data: T; error: unknown }): T => {
    if (result.error) throw result.error;
    return result.data;
  };
  return {
    async listBoards() {
      return check(await supabase.from("boards").select("id, name, template").order("position")) as BoardMeta[];
    },
    async createBoard(name, template, position) {
      return check(await supabase.from("boards").insert({ name, template, position }).select("id, name, template").single()) as BoardMeta;
    },
    async deleteBoard(id) {
      check(await supabase.from("boards").delete().eq("id", id));
    },
    async load(boardId) {
      const [board, columns, fields, cards] = await Promise.all([
        supabase.from("boards").select("id, name, template").eq("id", boardId).maybeSingle(),
        supabase.from("board_columns").select(COLUMN).eq("board_id", boardId),
        supabase.from("board_fields").select(FIELD).eq("board_id", boardId),
        supabase.from("board_cards").select(CARD).eq("board_id", boardId).is("archived_at", null),
      ]);
      const meta = check(board) as BoardMeta | null;
      if (!meta) return null;
      return { board: meta, columns: check(columns), fields: check(fields), cards: check(cards) } as BoardData;
    },
    async addColumn(boardId, name, position, color) {
      return check(
        await supabase.from("board_columns").insert({ board_id: boardId, name, position, color: color ?? null }).select(COLUMN).single(),
      ) as Column;
    },
    async updateColumn(id, patch) {
      check(await supabase.from("board_columns").update(patch).eq("id", id));
    },
    async deleteColumn(id) {
      check(await supabase.from("board_columns").delete().eq("id", id));
    },
    async addField(boardId, name, type, position) {
      return check(await supabase.from("board_fields").insert({ board_id: boardId, name, type, position }).select(FIELD).single()) as Field;
    },
    async deleteField(id) {
      check(await supabase.from("board_fields").delete().eq("id", id));
    },
    async addCard(boardId, columnId, title, position) {
      return check(
        await supabase.from("board_cards").insert({ board_id: boardId, column_id: columnId, title, position }).select(CARD).single(),
      ) as Card;
    },
    async updateCard(id, patch) {
      check(await supabase.from("board_cards").update(patch).eq("id", id));
    },
    async deleteCard(id) {
      check(await supabase.from("board_cards").delete().eq("id", id));
    },
    subscribe(boardId, onChange) {
      // Supabase Realtime streams row changes over a WebSocket. RLS applies there
      // too, so a user only ever receives changes to their own rows.
      const channel = supabase.channel(`board-${boardId}`);
      for (const table of ["board_columns", "board_cards", "board_fields"]) {
        channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `board_id=eq.${boardId}` }, onChange);
      }
      channel.subscribe();
      return () => {
        void supabase.removeChannel(channel);
      };
    },
  };
}
