"use client";

import "@xterm/xterm/css/xterm.css";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

type State = "idle" | "loading" | "running" | "waiting" | "done" | "error" | "unsupported";

const SHARED_BYTES = 8 + 4096; // 8 bytes of control ints + room for one typed line

/**
 * Terminal that runs a Python program in the browser.
 * - xterm.js draws the terminal.
 * - public/py-worker.mjs runs Python (Pyodide) on a separate thread.
 * - Nothing is downloaded until the visitor presses Run (the runtime is ~13 MB).
 */
export function PyTerminal({ slug, files, entry }: { slug: string; files: string[]; entry: string }) {
  const t = useTranslations("run");
  const host = useRef<HTMLDivElement>(null);
  const term = useRef<import("@xterm/xterm").Terminal | null>(null);
  const worker = useRef<Worker | null>(null);
  const shared = useRef<SharedArrayBuffer | null>(null);
  const line = useRef(""); // what the visitor has typed on the current line
  const waiting = useRef(false); // is Python blocked in input()?
  const [state, setState] = useState<State>("idle");

  // Hand the typed line to the sleeping worker and wake it up.
  const submit = useCallback((text: string) => {
    if (!shared.current) return;
    const encoded = new TextEncoder().encode(text).slice(0, 4096);
    new Uint8Array(shared.current, 8).set(encoded);
    const control = new Int32Array(shared.current, 0, 2);
    Atomics.store(control, 1, encoded.length);
    Atomics.store(control, 0, 1);
    Atomics.notify(control, 0);
    waiting.current = false;
    setState("running");
  }, []);

  // Create the terminal once, on the client only (xterm needs the DOM).
  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]);
      if (disposed || !host.current) return;
      const css = getComputedStyle(document.documentElement);
      const terminal = new Terminal({
        convertEol: true, // Python prints "\n"; terminals want "\r\n"
        cursorBlink: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        fontFamily: css.getPropertyValue("--font-mono"),
        fontSize: 14,
        theme: {
          background: css.getPropertyValue("--bg").trim(),
          foreground: css.getPropertyValue("--text").trim(),
          cursor: css.getPropertyValue("--text").trim(),
        },
      });
      const fit = new FitAddon();
      terminal.loadAddon(fit);
      terminal.open(host.current);
      fit.fit();
      const onResize = () => fit.fit();
      window.addEventListener("resize", onResize);

      // Minimal line editor: echo printable characters, handle Backspace and Enter.
      terminal.onData((data) => {
        if (!waiting.current) return;
        for (const ch of data) {
          if (ch === "\r") {
            terminal.write("\r\n");
            submit(line.current + "\n");
            line.current = "";
          } else if (ch === "\u007f") {
            if (line.current.length > 0) {
              line.current = line.current.slice(0, -1);
              terminal.write("\b \b");
            }
          } else if (ch >= " " && line.current.length < 1000) {
            line.current += ch;
            terminal.write(ch);
          }
        }
      });
      term.current = terminal;
      cleanup = () => {
        window.removeEventListener("resize", onResize);
        terminal.dispose();
      };
    })();
    return () => {
      disposed = true;
      cleanup();
      worker.current?.terminate();
    };
  }, [submit]);

  const stop = useCallback(() => {
    worker.current?.terminate(); // kills the Python thread immediately, even in an endless loop
    worker.current = null;
    waiting.current = false;
    line.current = "";
  }, []);

  const run = useCallback(async () => {
    // SharedArrayBuffer only exists when the page is "cross-origin isolated" (see next.config.ts).
    if (typeof SharedArrayBuffer === "undefined" || !window.crossOriginIsolated) {
      setState("unsupported");
      return;
    }
    stop();
    term.current?.reset();
    setState("loading");
    try {
      const sources = await Promise.all(
        files.map(async (name) => {
          const response = await fetch(`/py/${slug}/${name}`);
          if (!response.ok) throw new Error(`could not load ${name}`);
          return { name, text: await response.text() };
        }),
      );
      shared.current = new SharedArrayBuffer(SHARED_BYTES);
      const w = new Worker("/py-worker.mjs", { type: "module" });
      worker.current = w;
      w.onmessage = (event: MessageEvent<{ type: string; text?: string; message?: string }>) => {
        const message = event.data;
        if (message.type === "ready") setState("running");
        else if (message.type === "out") term.current?.write(message.text ?? "");
        else if (message.type === "input") {
          waiting.current = true;
          setState("waiting");
          term.current?.focus();
        } else if (message.type === "done") {
          setState("done");
          stop();
        } else if (message.type === "error") {
          term.current?.write(`\r\n${message.message ?? ""}\r\n`);
          setState("error");
          stop();
        }
      };
      w.onerror = () => {
        setState("error");
        stop();
      };
      w.postMessage({ type: "run", files: sources, entry, shared: shared.current });
    } catch {
      setState("error");
    }
  }, [entry, files, slug, stop]);

  const busy = state === "loading" || state === "running" || state === "waiting";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={run} className="h-11 rounded-md bg-text px-5 font-semibold text-bg">
          {state === "idle" ? t("run") : t("restart")}
        </button>
        <button
          type="button"
          disabled={!busy}
          onClick={() => {
            stop();
            setState("done");
          }}
          className="h-11 rounded-md border border-line px-5 disabled:cursor-not-allowed disabled:text-mute"
        >
          {t("stop")}
        </button>
        <span role="status" className="font-mono text-xs text-mute">
          {t(`state.${state}`)}
        </span>
      </div>
      <div className="rounded-md border border-line bg-bg p-3">
        <div ref={host} className="h-[420px]" aria-label={t("terminal")} />
      </div>
    </div>
  );
}
