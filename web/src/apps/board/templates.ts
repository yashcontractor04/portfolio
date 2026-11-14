import { generateNKeysBetween } from "fractional-indexing";
import type { BoardStore, FieldType, Template } from "./types";

type Spec = { columns: { name: string; color: string }[]; fields: { name: string; type: FieldType }[] };

// Column and field names are data the user can rename, so they are not translated UI strings.
const TEMPLATES: Record<Template, Spec> = {
  blank: { columns: [{ name: "To do", color: "blue" }, { name: "Done", color: "teal" }], fields: [] },
  uni: {
    columns: [
      { name: "To do", color: "blue" },
      { name: "In progress", color: "amber" },
      { name: "Submitted", color: "violet" },
      { name: "Graded", color: "teal" },
    ],
    fields: [{ name: "Course", type: "text" }, { name: "Deadline", type: "date" }],
  },
  jobs: {
    columns: [
      { name: "Wishlist", color: "blue" },
      { name: "Applied", color: "amber" },
      { name: "Interview", color: "violet" },
      { name: "Offer", color: "teal" },
      { name: "Rejected", color: "pink" },
    ],
    fields: [{ name: "Company", type: "text" }, { name: "Link", type: "url" }, { name: "Deadline", type: "date" }],
  },
};

/** Fills a freshly created board with the template's columns and custom fields. */
export async function applyTemplate(store: BoardStore, boardId: string, template: Template) {
  const spec = TEMPLATES[template];
  const columnKeys = generateNKeysBetween(null, null, spec.columns.length);
  const fieldKeys = generateNKeysBetween(null, null, spec.fields.length);
  for (const [i, column] of spec.columns.entries()) await store.addColumn(boardId, column.name, columnKeys[i], column.color);
  for (const [i, field] of spec.fields.entries()) await store.addField(boardId, field.name, field.type, fieldKeys[i]);
}
