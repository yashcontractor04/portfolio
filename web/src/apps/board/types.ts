export type Template = "blank" | "uni" | "jobs";
export type FieldType = "text" | "number" | "date" | "select" | "url";

export type BoardMeta = { id: string; name: string; template: Template };
export type Column = { id: string; board_id: string; name: string; color: string | null; wip_limit: number | null; position: string };
export type Field = { id: string; board_id: string; name: string; type: FieldType; position: string };
export type Card = {
  id: string;
  board_id: string;
  column_id: string;
  title: string;
  description: string | null;
  position: string;
  field_values: Record<string, string>; // { "<field id>": value }
};
export type BoardData = { board: BoardMeta; columns: Column[]; fields: Field[]; cards: Card[] };

/** Data source for the Board. Implemented by demo.ts (guests) and supabase.ts (logged in). */
export interface BoardStore {
  listBoards(): Promise<BoardMeta[]>;
  createBoard(name: string, template: Template, position: string): Promise<BoardMeta>;
  deleteBoard(id: string): Promise<void>;
  load(boardId: string): Promise<BoardData | null>;
  addColumn(boardId: string, name: string, position: string, color?: string): Promise<Column>;
  updateColumn(id: string, patch: Partial<Pick<Column, "name" | "color" | "wip_limit" | "position">>): Promise<void>;
  deleteColumn(id: string): Promise<void>;
  addField(boardId: string, name: string, type: FieldType, position: string): Promise<Field>;
  deleteField(id: string): Promise<void>;
  addCard(boardId: string, columnId: string, title: string, position: string): Promise<Card>;
  updateCard(id: string, patch: Partial<Pick<Card, "title" | "description" | "column_id" | "position" | "field_values">>): Promise<void>;
  deleteCard(id: string): Promise<void>;
  /** Calls onChange when another tab or device changes this board. Returns an unsubscribe function. */
  subscribe(boardId: string, onChange: () => void): () => void;
}

export const COLORS = ["blue", "indigo", "violet", "pink", "orange", "amber", "teal", "cyan"] as const;

/** Compare fractional-index positions exactly like Postgres does with COLLATE "C". */
export const byPosition = <T extends { position: string }>(a: T, b: T) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0);
