import type { SupabaseClient } from "@supabase/supabase-js";
import type { Page, PageMeta, WorkspaceStore } from "./types";

const META = "id, parent_id, title, position";

/**
 * Workspace backed by the `workspace_pages` table. There is no user filter in
 * these queries on purpose: row-level security already limits every query to
 * the logged-in user's rows, and `user_id` defaults to auth.uid() on insert.
 */
export function createSupabaseWorkspace(supabase: SupabaseClient): WorkspaceStore {
  return {
    async list() {
      const { data, error } = await supabase.from("workspace_pages").select(META).is("archived_at", null);
      if (error) throw error;
      return data as PageMeta[];
    },
    async get(id) {
      const { data, error } = await supabase.from("workspace_pages").select(`${META}, content`).eq("id", id).maybeSingle();
      if (error) throw error;
      return data as Page | null;
    },
    async create(parentId, position) {
      const { data, error } = await supabase
        .from("workspace_pages")
        .insert({ parent_id: parentId, position, title: "" })
        .select(META)
        .single();
      if (error) throw error;
      return data as PageMeta;
    },
    async update(id, patch) {
      const { error } = await supabase.from("workspace_pages").update(patch).eq("id", id);
      if (error) throw error;
    },
    async remove(id) {
      const { error } = await supabase.from("workspace_pages").delete().eq("id", id);
      if (error) throw error;
    },
  };
}
