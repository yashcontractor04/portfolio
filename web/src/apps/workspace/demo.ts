import type { Page, WorkspaceStore } from "./types";

const text = (value: string) => [{ type: "text", text: value, styles: {} }];

/** In-memory sample data for guests. Changes are lost on reload, by design. */
export function createDemoWorkspace(): WorkspaceStore {
  const pages: Page[] = [
    {
      id: "demo-1", parent_id: null, title: "Welcome", position: "a0",
      content: [
        { type: "heading", props: { level: 2 }, content: text("This is a demo") },
        { type: "paragraph", content: text("You are looking at sample data. Edit anything: nothing is saved, and a reload brings it back.") },
        { type: "checkListItem", props: { checked: true }, content: text("Type / to insert headings, lists and code blocks") },
        { type: "checkListItem", props: { checked: false }, content: text("Add a nested page from the sidebar") },
      ],
    },
    {
      id: "demo-2", parent_id: null, title: "Uni", position: "a1",
      content: [{ type: "paragraph", content: text("Lecture notes live under this page.") }],
    },
    {
      id: "demo-3", parent_id: "demo-2", title: "Rechnernetze", position: "a0",
      content: [
        { type: "heading", props: { level: 3 }, content: text("TCP vs UDP") },
        { type: "bulletListItem", content: text("TCP: connection, ordering, retransmission") },
        { type: "bulletListItem", content: text("UDP: no connection, no guarantees, low overhead") },
        { type: "codeBlock", props: { language: "python" }, content: text("import socket\ns = socket.socket(socket.AF_INET, socket.SOCK_STREAM)") },
      ],
    },
  ];
  let counter = 100;
  return {
    async list() {
      return pages.map(({ id, parent_id, title, position }) => ({ id, parent_id, title, position }));
    },
    async get(id) {
      return pages.find((p) => p.id === id) ?? null;
    },
    async create(parentId, position) {
      const page: Page = { id: `demo-${counter++}`, parent_id: parentId, title: "", position, content: null };
      pages.push(page);
      return page;
    },
    async update(id, patch) {
      const page = pages.find((p) => p.id === id);
      if (page) Object.assign(page, patch);
    },
    async remove(id) {
      // remove the page and everything nested under it (the database does this with ON DELETE CASCADE)
      const doomed = new Set([id]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const p of pages) {
          if (p.parent_id && doomed.has(p.parent_id) && !doomed.has(p.id)) {
            doomed.add(p.id);
            grew = true;
          }
        }
      }
      for (let i = pages.length - 1; i >= 0; i--) if (doomed.has(pages[i].id)) pages.splice(i, 1);
    },
  };
}
