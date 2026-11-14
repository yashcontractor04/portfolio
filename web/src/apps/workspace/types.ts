/** A notes page. `content` is the BlockNote document (an array of blocks). */
export type PageMeta = { id: string; parent_id: string | null; title: string; position: string };
export type Page = PageMeta & { content: unknown[] | null };

/**
 * Everything the Workspace UI needs from a data source. Two implementations:
 * demo.ts (sample data in memory, for guests) and supabase.ts (the real database).
 * The UI never knows which one it is talking to.
 */
export interface WorkspaceStore {
  list(): Promise<PageMeta[]>;
  get(id: string): Promise<Page | null>;
  create(parentId: string | null, position: string): Promise<PageMeta>;
  update(id: string, patch: { title?: string; content?: unknown[] }): Promise<void>;
  remove(id: string): Promise<void>;
}

export const MAX_CONTENT_BYTES = 900_000; // the database refuses documents over 1 MB
