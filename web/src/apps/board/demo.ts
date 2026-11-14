import type { BoardMeta, BoardStore, Card, Column, Field } from "./types";

/** In-memory sample board for guests. Changes are lost on reload, by design. */
export function createDemoBoard(): BoardStore {
  let counter = 100;
  const id = () => `demo-${counter++}`;
  const boards: BoardMeta[] = [{ id: "b1", name: "Uni assignments", template: "uni" }];
  const columns: Column[] = [
    { id: "c1", board_id: "b1", name: "To do", color: "blue", wip_limit: null, position: "a0" },
    { id: "c2", board_id: "b1", name: "In progress", color: "amber", wip_limit: 2, position: "a1" },
    { id: "c3", board_id: "b1", name: "Submitted", color: "violet", wip_limit: null, position: "a2" },
    { id: "c4", board_id: "b1", name: "Graded", color: "teal", wip_limit: null, position: "a3" },
  ];
  const fields: Field[] = [
    { id: "f1", board_id: "b1", name: "Course", type: "text", position: "a0" },
    { id: "f2", board_id: "b1", name: "Deadline", type: "date", position: "a1" },
  ];
  const cards: Card[] = [
    { id: "k1", board_id: "b1", column_id: "c1", title: "Stochastik: problem set 5", description: null, position: "a0", field_values: { f1: "Stochastik", f2: "2026-11-24" } },
    { id: "k2", board_id: "b1", column_id: "c1", title: "Rechnernetze: lab report", description: "Wireshark traces for the TCP handshake.", position: "a1", field_values: { f1: "Rechnernetze", f2: "2026-11-27" } },
    { id: "k3", board_id: "b1", column_id: "c2", title: "Algorithmentheorie: homework 4", description: null, position: "a0", field_values: { f1: "Algorithmentheorie", f2: "2026-11-19" } },
    { id: "k4", board_id: "b1", column_id: "c3", title: "Betriebssystempraktikum: milestone 1", description: null, position: "a0", field_values: { f1: "BS-Praktikum" } },
    { id: "k5", board_id: "b1", column_id: "c4", title: "KI: search algorithms quiz", description: null, position: "a0", field_values: { f1: "Einführung in die KI" } },
  ];
  const drop = <T extends { id: string }>(list: T[], keep: (item: T) => boolean) => {
    for (let i = list.length - 1; i >= 0; i--) if (!keep(list[i])) list.splice(i, 1);
  };
  return {
    async listBoards() {
      return [...boards];
    },
    async createBoard(name, template) {
      const board = { id: id(), name, template };
      boards.push(board);
      return board;
    },
    async deleteBoard(boardId) {
      drop(boards, (b) => b.id !== boardId);
      drop(columns, (c) => c.board_id !== boardId);
      drop(fields, (f) => f.board_id !== boardId);
      drop(cards, (k) => k.board_id !== boardId);
    },
    async load(boardId) {
      const board = boards.find((b) => b.id === boardId);
      if (!board) return null;
      const mine = <T extends { board_id: string }>(list: T[]) => list.filter((x) => x.board_id === boardId).map((x) => ({ ...x }));
      return { board, columns: mine(columns), fields: mine(fields), cards: mine(cards) };
    },
    async addColumn(boardId, name, position, color) {
      const column = { id: id(), board_id: boardId, name, color: color ?? null, wip_limit: null, position };
      columns.push(column);
      return column;
    },
    async updateColumn(columnId, patch) {
      Object.assign(columns.find((c) => c.id === columnId) ?? {}, patch);
    },
    async deleteColumn(columnId) {
      if (cards.some((k) => k.column_id === columnId)) throw new Error("column_not_empty");
      drop(columns, (c) => c.id !== columnId);
    },
    async addField(boardId, name, type, position) {
      const field = { id: id(), board_id: boardId, name, type, position };
      fields.push(field);
      return field;
    },
    async deleteField(fieldId) {
      drop(fields, (f) => f.id !== fieldId);
    },
    async addCard(boardId, columnId, title, position) {
      const card = { id: id(), board_id: boardId, column_id: columnId, title, description: null, position, field_values: {} };
      cards.push(card);
      return card;
    },
    async updateCard(cardId, patch) {
      Object.assign(cards.find((k) => k.id === cardId) ?? {}, patch);
    },
    async deleteCard(cardId) {
      drop(cards, (k) => k.id !== cardId);
    },
    subscribe() {
      return () => {}; // nothing to sync in a single-tab demo
    },
  };
}
