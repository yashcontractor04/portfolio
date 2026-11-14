"use client";

import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { generateKeyBetween } from "fractional-indexing";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { DemoBanner } from "@/components/DemoBanner";
import { getSupabase } from "@/lib/supabase";
import { useStore } from "../useStore";
import { createDemoBoard } from "./demo";
import { createSupabaseBoard } from "./supabase";
import { applyTemplate } from "./templates";
import { byPosition, COLORS, type BoardData, type BoardMeta, type Card, type Column, type Field, type FieldType, type Template } from "./types";

// Close the <details> dropdown a form lives in once it is submitted.
const closeMenu = (event: React.FormEvent<HTMLFormElement>) => event.currentTarget.closest("details")?.removeAttribute("open");

const input = "h-10 rounded-sm border border-line bg-bg px-3 text-sm text-text placeholder:text-mute";
const button = "h-10 rounded-sm border border-line px-3 text-sm text-mute hover:text-text disabled:cursor-not-allowed disabled:opacity-50";

export function Board() {
  const t = useTranslations("board");
  const { store, demo } = useStore(createDemoBoard, createSupabaseBoard);
  const [boards, setBoards] = useState<BoardMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [data, setData] = useState<BoardData | null>(null);
  const [dragging, setDragging] = useState<Card | null>(null);
  const [editing, setEditing] = useState<Card | null>(null);
  const [error, setError] = useState<string | null>(null);
  const draggingRef = useRef(false);

  const sensors = useSensors(
    // A small movement threshold so a plain click still opens the card.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const reload = useCallback(async () => {
    if (!store || !activeId) return;
    try {
      setData(await store.load(activeId));
    } catch {
      setError(t("loadError"));
    }
  }, [store, activeId, t]);

  // Optimistic update: change the screen first, then tell the database.
  // If the write fails, show an error and reload the true state.
  const mutate = useCallback(
    async (optimistic: ((d: BoardData) => BoardData) | null, write: () => Promise<unknown>, refresh = false) => {
      setError(null);
      if (optimistic) setData((d) => (d ? optimistic(d) : d));
      try {
        await write();
        if (refresh) await reload();
      } catch {
        setError(t("saveError"));
        await reload();
      }
    },
    [reload, t],
  );

  // Load the list of boards once the store is known.
  useEffect(() => {
    if (!store) return;
    let cancelled = false;
    // The store changes when someone logs in or out. Forget everything from the
    // previous store first: its ids (e.g. demo ids) mean nothing to the new one.
    /* eslint-disable react-hooks/set-state-in-effect -- reset on store change */
    setActiveId(null);
    setData(null);
    setBoards([]);
    setEditing(null);
    setError(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    store
      .listBoards()
      .then((list) => {
        if (cancelled) return;
        setBoards(list);
        setActiveId(list[0]?.id ?? null);
        if (list.length === 0) setData(null);
      })
      .catch(() => !cancelled && setError(t("loadError")));
    return () => {
      cancelled = true;
    };
  }, [store, t]);

  // Load the active board and keep it in sync with other tabs (Realtime).
  useEffect(() => {
    if (!store || !activeId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-change
    void reload();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = store.subscribe(activeId, () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => !draggingRef.current && void reload(), 250);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [store, activeId, reload]);

  if (!store) return <p className="p-8 text-mute">{t("loading")}</p>;

  const columns = data ? [...data.columns].sort(byPosition) : [];
  const fields = data ? [...data.fields].sort(byPosition) : [];
  const cardsIn = (columnId: string) => (data?.cards ?? []).filter((c) => c.column_id === columnId).sort(byPosition);

  async function createBoard(form: FormData) {
    if (!store) return;
    const name = String(form.get("name") ?? "").trim().slice(0, 120);
    const template = String(form.get("template") ?? "blank") as Template;
    if (!name) return;
    setError(null);
    try {
      const board = await store.createBoard(name, template, generateKeyBetween(null, null) + Date.now().toString(36));
      await applyTemplate(store, board.id, template);
      setBoards((list) => [...list, board]);
      setActiveId(board.id);
    } catch {
      setError(t("saveError"));
    }
  }

  async function deleteBoard() {
    if (!store || !data || !window.confirm(t("confirmDeleteBoard", { name: data.board.name }))) return;
    try {
      await store.deleteBoard(data.board.id);
      const list = boards.filter((b) => b.id !== data.board.id);
      setBoards(list);
      setActiveId(list[0]?.id ?? null);
      if (list.length === 0) setData(null);
    } catch {
      setError(t("saveError"));
    }
  }

  function onDragEnd(event: DragEndEvent) {
    draggingRef.current = false;
    setDragging(null);
    const { active, over } = event;
    if (!data || !over || !store) return;
    const card = data.cards.find((c) => c.id === active.id);
    if (!card) return;
    // `over` is either a column (dropped on empty space) or another card.
    const overCard = data.cards.find((c) => c.id === over.id);
    const targetColumn = overCard ? overCard.column_id : String(over.id);
    if (!data.columns.some((c) => c.id === targetColumn)) return;
    const siblings = cardsIn(targetColumn).filter((c) => c.id !== card.id);
    let index = siblings.length;
    if (overCard && overCard.id !== card.id) {
      index = siblings.findIndex((c) => c.id === overCard.id);
      // Moving down inside the same column: land after the card we dropped on.
      if (card.column_id === targetColumn && card.position < overCard.position) index += 1;
    } else if (overCard) {
      return; // dropped on itself
    }
    // A fractional index between the two neighbours: only this one row changes.
    const position = generateKeyBetween(siblings[index - 1]?.position ?? null, siblings[index]?.position ?? null);
    void mutate(
      (d) => ({ ...d, cards: d.cards.map((c) => (c.id === card.id ? { ...c, column_id: targetColumn, position } : c)) }),
      () => store.updateCard(card.id, { column_id: targetColumn, position }),
    );
  }

  function addColumn() {
    if (!data || !store) return;
    const position = generateKeyBetween(columns.at(-1)?.position ?? null, null);
    void mutate(null, () => store.addColumn(data.board.id, t("newColumn"), position), true);
  }

  function moveColumn(column: Column, direction: -1 | 1) {
    if (!store) return;
    const index = columns.findIndex((c) => c.id === column.id);
    const others = columns.filter((c) => c.id !== column.id);
    const at = index + direction;
    if (at < 0 || at > others.length) return;
    const position = generateKeyBetween(others[at - 1]?.position ?? null, others[at]?.position ?? null);
    void mutate(
      (d) => ({ ...d, columns: d.columns.map((c) => (c.id === column.id ? { ...c, position } : c)) }),
      () => store.updateColumn(column.id, { position }),
    );
  }

  function patchColumn(column: Column, patch: Partial<Pick<Column, "name" | "color" | "wip_limit">>) {
    if (!store) return;
    void mutate(
      (d) => ({ ...d, columns: d.columns.map((c) => (c.id === column.id ? { ...c, ...patch } : c)) }),
      () => store.updateColumn(column.id, patch),
    );
  }

  function addCard(column: Column, title: string) {
    if (!data || !store) return;
    const position = generateKeyBetween(cardsIn(column.id).at(-1)?.position ?? null, null);
    void mutate(null, () => store.addCard(data.board.id, column.id, title.slice(0, 300), position), true);
  }

  function saveCard(card: Card, patch: Pick<Card, "title" | "description" | "field_values">) {
    if (!store) return;
    setEditing(null);
    void mutate(
      (d) => ({ ...d, cards: d.cards.map((c) => (c.id === card.id ? { ...c, ...patch } : c)) }),
      () => store.updateCard(card.id, patch),
    );
  }

  function deleteCard(card: Card) {
    if (!store) return;
    setEditing(null);
    void mutate((d) => ({ ...d, cards: d.cards.filter((c) => c.id !== card.id) }), () => store.deleteCard(card.id));
  }

  function addField(form: FormData) {
    if (!data || !store) return;
    const name = String(form.get("name") ?? "").trim().slice(0, 40);
    if (!name) return;
    const position = generateKeyBetween(fields.at(-1)?.position ?? null, null);
    void mutate(null, () => store.addField(data.board.id, name, String(form.get("type")) as FieldType, position), true);
  }

  return (
    <div className="flex flex-col">
      {demo ? <DemoBanner canLogin={getSupabase() !== null} /> : null}

      {/* Toolbar: choose board, create board, custom fields */}
      <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
        {boards.length > 0 ? (
          <label className="flex items-center gap-2 text-sm text-mute">
            {t("board")}
            <select value={activeId ?? ""} onChange={(event) => setActiveId(event.target.value)} className={input}>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </label>
        ) : null}
        <details className="relative">
          <summary className={`${button} flex cursor-pointer list-none items-center`}>+ {t("newBoard")}</summary>
          <form action={createBoard} onSubmit={closeMenu} className="absolute left-0 z-10 mt-2 flex w-72 flex-col gap-2 rounded-md border border-line bg-panel p-3">
            <input name="name" required maxLength={120} placeholder={t("boardName")} aria-label={t("boardName")} className={input} />
            <select name="template" aria-label={t("template")} className={input} defaultValue="uni">
              <option value="uni">{t("templates.uni")}</option>
              <option value="jobs">{t("templates.jobs")}</option>
              <option value="blank">{t("templates.blank")}</option>
            </select>
            <button type="submit" className="h-10 rounded-sm bg-text text-sm font-semibold text-bg">{t("create")}</button>
          </form>
        </details>
        {data ? (
          <>
            <details className="relative">
              <summary className={`${button} flex cursor-pointer list-none items-center`}>{t("fields")} ({fields.length})</summary>
              <div className="absolute left-0 z-10 mt-2 flex w-80 flex-col gap-2 rounded-md border border-line bg-panel p-3">
                {fields.map((f) => (
                  <div key={f.id} className="flex items-center justify-between gap-2 text-sm">
                    <span>{f.name} <span className="font-mono text-xs text-mute">{t(`fieldTypes.${f.type}`)}</span></span>
                    <button type="button" className="h-9 px-2 text-mute hover:text-negative" onClick={() => store && mutate(null, () => store.deleteField(f.id), true)}>
                      {t("remove")}
                    </button>
                  </div>
                ))}
                <form action={addField} className="flex gap-2 border-t border-line pt-2">
                  <input name="name" required maxLength={40} placeholder={t("fieldName")} aria-label={t("fieldName")} className={`${input} min-w-0 flex-1`} />
                  <select name="type" aria-label={t("fieldType")} className={input} defaultValue="text">
                    {(["text", "number", "date", "url"] as const).map((type) => (
                      <option key={type} value={type}>{t(`fieldTypes.${type}`)}</option>
                    ))}
                  </select>
                  <button type="submit" className={button}>+</button>
                </form>
              </div>
            </details>
            <button type="button" onClick={deleteBoard} className={`${button} ml-auto hover:text-negative`}>{t("deleteBoard")}</button>
          </>
        ) : null}
      </div>

      {error ? <p role="alert" className="px-4 pt-3 text-sm text-negative">{error}</p> : null}
      {!data && boards.length === 0 ? <p className="p-8 text-mute">{t("empty")}</p> : null}

      {data ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={(event) => {
            draggingRef.current = true;
            setDragging(data.cards.find((c) => c.id === event.active.id) ?? null);
          }}
          onDragCancel={() => {
            draggingRef.current = false;
            setDragging(null);
          }}
          onDragEnd={onDragEnd}
        >
          <div className="flex items-start gap-4 overflow-x-auto p-4">
            {columns.map((column, index) => (
              <ColumnView
                key={column.id}
                column={column}
                cards={cardsIn(column.id)}
                fields={fields}
                isFirst={index === 0}
                isLast={index === columns.length - 1}
                onPatch={(patch) => patchColumn(column, patch)}
                onMove={(direction) => moveColumn(column, direction)}
                onDelete={() => store && mutate(null, () => store.deleteColumn(column.id), true)}
                onAddCard={(title) => addCard(column, title)}
                onOpen={setEditing}
              />
            ))}
            <button type="button" onClick={addColumn} className={`${button} w-64 shrink-0`}>+ {t("addColumn")}</button>
          </div>
          <DragOverlay>{dragging ? <CardFace card={dragging} fields={fields} /> : null}</DragOverlay>
        </DndContext>
      ) : null}

      {editing ? (
        <CardDialog card={editing} fields={fields} onClose={() => setEditing(null)} onSave={(patch) => saveCard(editing, patch)} onDelete={() => deleteCard(editing)} />
      ) : null}
    </div>
  );
}

function ColumnView(props: {
  column: Column;
  cards: Card[];
  fields: Field[];
  isFirst: boolean;
  isLast: boolean;
  onPatch: (patch: Partial<Pick<Column, "name" | "color" | "wip_limit">>) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
  onAddCard: (title: string) => void;
  onOpen: (card: Card) => void;
}) {
  const { column, cards } = props;
  const t = useTranslations("board");
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const over = column.wip_limit !== null && cards.length > column.wip_limit;

  return (
    <section
      aria-label={column.name}
      className={`flex w-72 shrink-0 flex-col gap-3 rounded-md border bg-tile p-3 ${isOver ? "border-line-strong" : "border-line"}`}
      style={{ "--accent": `var(--hue-${column.color ?? "blue"})` } as React.CSSProperties}
    >
      <div className="flex items-center gap-2">
        <span className="size-2.5 shrink-0 rounded-full" style={{ background: "var(--accent)" }} />
        <input
          defaultValue={column.name}
          key={column.name}
          aria-label={t("columnName")}
          maxLength={80}
          onBlur={(event) => {
            const name = event.target.value.trim();
            if (name && name !== column.name) props.onPatch({ name });
            else event.target.value = column.name;
          }}
          onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
          className="h-9 min-w-0 flex-1 rounded-sm bg-transparent px-1 font-semibold"
        />
        <span className="shrink-0 font-mono text-xs" style={{ color: over ? "var(--hue-amber)" : "var(--mute)" }} title={over ? t("overLimit") : undefined}>
          {cards.length}{column.wip_limit !== null ? `/${column.wip_limit}` : ""}{over ? " !" : ""}
        </span>
        <details className="relative shrink-0">
          <summary aria-label={t("columnMenu", { name: column.name })} className="flex size-9 cursor-pointer list-none items-center justify-center rounded-sm text-mute hover:text-text">⋯</summary>
          <div className="absolute right-0 z-10 mt-1 flex w-56 flex-col gap-3 rounded-md border border-line bg-panel p-3 text-sm">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("color")}>
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={color}
                  aria-pressed={column.color === color}
                  onClick={() => props.onPatch({ color })}
                  className={`size-7 rounded-full border-2 ${column.color === color ? "border-text" : "border-transparent"}`}
                  style={{ background: `var(--hue-${color})` }}
                />
              ))}
            </div>
            <label className="flex items-center justify-between gap-2 text-mute">
              {t("wipLimit")}
              <input
                type="number"
                min={1}
                max={999}
                defaultValue={column.wip_limit ?? ""}
                onBlur={(event) => {
                  const n = Number.parseInt(event.target.value, 10);
                  props.onPatch({ wip_limit: Number.isInteger(n) && n >= 1 && n <= 999 ? n : null });
                }}
                className={`${input} w-20`}
              />
            </label>
            <div className="flex gap-2">
              <button type="button" className={`${button} flex-1`} disabled={props.isFirst} onClick={() => props.onMove(-1)}>← {t("left")}</button>
              <button type="button" className={`${button} flex-1`} disabled={props.isLast} onClick={() => props.onMove(1)}>{t("right")} →</button>
            </div>
            <button type="button" className={`${button} hover:text-negative`} disabled={cards.length > 0} onClick={props.onDelete}>
              {t("deleteColumn")}
            </button>
            {cards.length > 0 ? <p className="text-xs text-mute">{t("columnNotEmpty")}</p> : null}
          </div>
        </details>
      </div>

      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className="flex min-h-12 flex-col gap-2">
          {cards.map((card) => (
            <SortableCard key={card.id} card={card} fields={props.fields} onOpen={() => props.onOpen(card)} />
          ))}
        </ul>
      </SortableContext>

      <form
        action={(form) => {
          const title = String(form.get("title") ?? "").trim();
          if (title) props.onAddCard(title);
        }}
      >
        <input name="title" maxLength={300} placeholder={`+ ${t("addCard")}`} title={t("addCardHint")} aria-label={t("addCardTo", { name: column.name })} className={`${input} w-full`} />
      </form>
    </section>
  );
}

function SortableCard({ card, fields, onOpen }: { card: Card; fields: Field[]; onOpen: () => void }) {
  const t = useTranslations("board");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }} className="relative">
      {/* The whole card is the drag handle (mouse, touch, or Space + arrow keys). */}
      <div {...attributes} {...listeners} onClick={onOpen} className="cursor-grab touch-none">
        <CardFace card={card} fields={fields} />
      </div>
      <button type="button" onClick={onOpen} aria-label={t("editCard", { title: card.title })} className="absolute right-1 top-1 flex size-8 items-center justify-center rounded-sm text-mute hover:text-text">
        ✎
      </button>
    </li>
  );
}

function CardFace({ card, fields }: { card: Card; fields: Field[] }) {
  const chips = fields.filter((f) => card.field_values[f.id]);
  return (
    <div className="flex flex-col gap-2 rounded-sm border border-line bg-panel p-3 pr-9">
      <span className="text-sm leading-snug">{card.title}</span>
      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((f) => (
            <span key={f.id} className="max-w-full truncate rounded-full border border-line px-2 py-0.5 font-mono text-[11px] text-mute">
              {f.type === "url" ? f.name : card.field_values[f.id]}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CardDialog(props: {
  card: Card;
  fields: Field[];
  onClose: () => void;
  onSave: (patch: Pick<Card, "title" | "description" | "field_values">) => void;
  onDelete: () => void;
}) {
  const t = useTranslations("board");
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal(); // native <dialog>: focus trap and Escape for free
  }, []);

  function submit(form: FormData) {
    const title = String(form.get("title") ?? "").trim().slice(0, 300);
    if (!title) return;
    const values: Record<string, string> = {};
    for (const f of props.fields) {
      const value = String(form.get(`field-${f.id}`) ?? "").trim().slice(0, 500);
      // Only http(s) links are stored, so a card can never carry a javascript: URL.
      if (value && (f.type !== "url" || /^https?:\/\//i.test(value))) values[f.id] = value;
    }
    props.onSave({ title, description: String(form.get("description") ?? "").slice(0, 10000) || null, field_values: values });
  }

  return (
    <dialog ref={ref} onClose={props.onClose} className="m-auto w-[min(92vw,32rem)] rounded-lg border border-line bg-panel p-0 text-text backdrop:bg-black/70">
      <form action={submit} className="flex flex-col gap-4 p-6">
        <label className="flex flex-col gap-1.5 text-sm text-mute">
          {t("cardTitle")}
          <input name="title" required maxLength={300} defaultValue={props.card.title} className={input} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-mute">
          {t("description")}
          <textarea name="description" maxLength={10000} rows={4} defaultValue={props.card.description ?? ""} className={`${input} h-auto py-2`} />
        </label>
        {props.fields.map((f) => (
          <label key={f.id} className="flex flex-col gap-1.5 text-sm text-mute">
            {f.name}
            <input
              name={`field-${f.id}`}
              type={f.type === "select" ? "text" : f.type}
              defaultValue={props.card.field_values[f.id] ?? ""}
              placeholder={f.type === "url" ? "https://" : undefined}
              className={input}
            />
          </label>
        ))}
        <div className="flex flex-wrap gap-3 pt-2">
          <button type="submit" className="h-11 rounded-sm bg-text px-5 text-sm font-semibold text-bg">{t("save")}</button>
          <button type="button" onClick={props.onClose} className={`${button} h-11`}>{t("cancel")}</button>
          <button type="button" onClick={props.onDelete} className={`${button} ml-auto h-11 hover:text-negative`}>{t("deleteCard")}</button>
        </div>
      </form>
    </dialog>
  );
}
