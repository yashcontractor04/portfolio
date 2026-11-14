"use client";

import { generateKeyBetween } from "fractional-indexing";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { DemoBanner } from "@/components/DemoBanner";
import { getSupabase } from "@/lib/supabase";
import { useStore } from "../useStore";
import { createDemoWorkspace } from "./demo";
import { createSupabaseWorkspace } from "./supabase";
import { MAX_CONTENT_BYTES, type Page, type PageMeta } from "./types";

const Editor = dynamic(() => import("./Editor"), { ssr: false });

type SaveState = "idle" | "saving" | "saved" | "error" | "tooLarge";
const byPosition = (a: PageMeta, b: PageMeta) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0);

export function Workspace() {
  const t = useTranslations("workspace");
  const { store, demo } = useStore(createDemoWorkspace, createSupabaseWorkspace);
  const [pages, setPages] = useState<PageMeta[]>([]);
  const [current, setCurrent] = useState<Page | null>(null);
  const [save, setSave] = useState<SaveState>("idle");
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ id: string; patch: { title?: string; content?: unknown[] } } | null>(null);

  // Write the pending change now (used by the debounce timer and before switching pages).
  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const job = pending.current;
    pending.current = null;
    if (!job || !store) return;
    setSave("saving");
    try {
      await store.update(job.id, job.patch);
      setSave("saved");
    } catch {
      setSave("error");
    }
  }, [store]);

  // Autosave: wait until typing pauses for 800 ms, then save once.
  const queue = useCallback(
    (id: string, patch: { title?: string; content?: unknown[] }) => {
      if (patch.content && JSON.stringify(patch.content).length > MAX_CONTENT_BYTES) return setSave("tooLarge");
      pending.current = { id, patch: { ...(pending.current?.id === id ? pending.current.patch : {}), ...patch } };
      setSave("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 800);
    },
    [flush],
  );

  const open = useCallback(
    async (id: string) => {
      if (!store) return;
      await flush();
      try {
        setCurrent(await store.get(id));
        setSave("idle");
      } catch {
        setFailed(true);
      }
    },
    [store, flush],
  );

  useEffect(() => {
    if (!store) return;
    let cancelled = false;
    // The store changes on login/logout: drop the previous store's pages and any
    // unsaved change, because their ids do not exist in the new store.
    if (timer.current) clearTimeout(timer.current);
    pending.current = null;
    /* eslint-disable react-hooks/set-state-in-effect -- reset on store change */
    setPages([]);
    setCurrent(null);
    setFailed(false);
    setSave("idle");
    /* eslint-enable react-hooks/set-state-in-effect */
    (async () => {
      try {
        const list = (await store.list()).sort(byPosition);
        if (cancelled) return;
        setPages(list);
        const first = list.find((p) => p.parent_id === null) ?? list[0];
        setCurrent(first ? await store.get(first.id) : null);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store]);

  // Save on tab close / navigation away.
  useEffect(() => {
    const onHide = () => void flush();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      void flush();
    };
  }, [flush]);

  async function addPage(parentId: string | null) {
    if (!store) return;
    const siblings = pages.filter((p) => p.parent_id === parentId).sort(byPosition);
    const position = generateKeyBetween(siblings.at(-1)?.position ?? null, null);
    try {
      const page = await store.create(parentId, position);
      setPages((list) => [...list, page]);
      await open(page.id);
    } catch {
      setSave("error");
    }
  }

  async function removePage(id: string) {
    if (!store || !window.confirm(t("confirmDelete"))) return;
    pending.current = null;
    try {
      await store.remove(id);
      const list = (await store.list()).sort(byPosition);
      setPages(list);
      setCurrent(list[0] ? await store.get(list[0].id) : null);
    } catch {
      setSave("error");
    }
  }

  function renameCurrent(title: string) {
    if (!current) return;
    setCurrent({ ...current, title });
    setPages((list) => list.map((p) => (p.id === current.id ? { ...p, title } : p)));
    queue(current.id, { title });
  }

  // Sidebar tree, rendered recursively (pages can be nested to any depth).
  const tree = (parentId: string | null, depth: number): React.ReactNode =>
    pages
      .filter((p) => p.parent_id === parentId)
      .sort(byPosition)
      .map((p) => (
        <li key={p.id}>
          <div className="group flex items-center" style={{ paddingLeft: depth * 14 }}>
            <button
              type="button"
              onClick={() => open(p.id)}
              aria-current={current?.id === p.id ? "page" : undefined}
              className={`h-10 min-w-0 flex-1 truncate rounded-sm px-2 text-left text-sm ${
                current?.id === p.id ? "bg-tile text-text" : "text-mute hover:text-text"
              }`}
            >
              {p.title || t("untitled")}
            </button>
            <button type="button" onClick={() => addPage(p.id)} aria-label={t("addSubpage", { title: p.title || t("untitled") })} className="size-10 shrink-0 text-mute hover:text-text">
              +
            </button>
          </div>
          <ul>{tree(p.id, depth + 1)}</ul>
        </li>
      ));

  if (!store) return <p className="p-8 text-mute">{t("loading")}</p>;
  if (failed) return <p role="alert" className="p-8 text-negative">{t("loadError")}</p>;

  return (
    <div className="flex flex-col">
      {demo ? <DemoBanner canLogin={getSupabase() !== null} /> : null}
      <div className="flex flex-col md:flex-row">
        <nav aria-label={t("pages")} className="flex shrink-0 flex-col gap-2 border-line p-4 md:w-64 md:border-r">
          <ul>{tree(null, 0)}</ul>
          <button type="button" onClick={() => addPage(null)} className="h-10 rounded-sm border border-line text-sm text-mute hover:text-text">
            + {t("newPage")}
          </button>
        </nav>
        <div className="min-w-0 flex-1 p-4 sm:p-8">
          {current ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <input
                  value={current.title}
                  onChange={(event) => renameCurrent(event.target.value)}
                  placeholder={t("untitled")}
                  aria-label={t("title")}
                  maxLength={300}
                  className="min-w-0 flex-1 bg-transparent text-4xl font-semibold tracking-tight placeholder:text-mute"
                />
                <span role="status" className="shrink-0 font-mono text-xs text-mute">{save === "idle" ? "" : t(`save.${save}`)}</span>
                <button type="button" onClick={() => removePage(current.id)} className="h-10 shrink-0 rounded-sm border border-line px-3 text-sm text-mute hover:text-negative">
                  {t("delete")}
                </button>
              </div>
              <div className="workspace-editor min-h-[50vh]">
                <Editor key={current.id} initial={current.content} onChange={(doc) => queue(current.id, { content: doc })} />
              </div>
            </div>
          ) : (
            <p className="text-mute">{t("empty")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
