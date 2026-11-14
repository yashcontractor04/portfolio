"use client";

import "@blocknote/mantine/style.css";
import type { PartialBlock } from "@blocknote/core";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";

/**
 * The block editor (BlockNote). Loaded only in the browser and only on the
 * Workspace page, because it is a large library. The parent gives it a `key`
 * per page, so switching pages creates a fresh editor with that page's content.
 */
export default function Editor({ initial, onChange }: { initial: unknown[] | null; onChange: (doc: unknown[]) => void }) {
  const editor = useCreateBlockNote({
    initialContent: initial && initial.length > 0 ? (initial as PartialBlock[]) : undefined,
  });
  return <BlockNoteView editor={editor} theme="dark" onChange={() => onChange(editor.document)} />;
}
