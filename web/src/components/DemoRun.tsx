"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { LineChart, type ChartSeries } from "./LineChart";
import { StatTile } from "./StatTile";

type Table = { title: string; columns: string[]; rows: (string | number | null)[][] };
export type DemoResult = { summary: Record<string, string | number>; series: ChartSeries[]; tables: Table[] };
type Phase = "idle" | "queued" | "running" | "succeeded" | "failed" | "rate_limited" | "busy" | "unavailable" | "slow";

const POLL_MS = 1500;
const MAX_POLLS = 60; // about 90 seconds

/**
 * "Run demo" for a runner project. Starts a job through /api/demo and polls
 * until the worker has finished it. The result is shown here and nowhere else:
 * the server deletes demo runs within the hour.
 *
 * With `mock`, no job is started: the given sample result is shown after a short
 * pause. Used while a runner's backend is still being built (see lib/sim).
 */
export function DemoRun({ slug, mock }: { slug: string; mock?: DemoResult }) {
  const t = useTranslations("demoRun");
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<DemoResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  async function start() {
    if (timer.current) clearTimeout(timer.current);
    setResult(null);
    setError(null);
    setPhase("queued");
    if (mock) {
      timer.current = setTimeout(() => {
        setPhase("running");
        timer.current = setTimeout(() => {
          setResult(mock);
          setPhase("succeeded");
        }, 900);
      }, 500);
      return;
    }
    try {
      const response = await fetch("/api/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const body = await response.json();
      if (!response.ok) return setPhase(body.error === "rate_limited" ? "rate_limited" : body.error === "busy" ? "busy" : "unavailable");
      poll(body.id, body.token, 0);
    } catch {
      setPhase("unavailable");
    }
  }

  function poll(id: string, token: string, attempt: number) {
    timer.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/demo?id=${id}&token=${token}`, { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) return setPhase("unavailable");
        if (body.status === "succeeded") {
          setResult({ summary: body.summary ?? {}, series: body.series ?? [], tables: body.tables ?? [] });
          return setPhase("succeeded");
        }
        if (["failed", "timed_out", "cancelled"].includes(body.status)) {
          setError(body.error ?? null);
          return setPhase("failed");
        }
        // Still queued after a long wait usually means the worker is offline.
        if (attempt >= MAX_POLLS) return setPhase("slow");
        setPhase(body.status === "running" ? "running" : "queued");
        poll(id, token, attempt + 1);
      } catch {
        setPhase("unavailable");
      }
    }, POLL_MS);
  }

  const busy = phase === "queued" || phase === "running";
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-4">
        <button type="button" onClick={start} disabled={busy} className="h-11 rounded-md bg-text px-5 font-semibold text-bg disabled:opacity-60">
          {phase === "idle" ? t("run") : t("again")}
        </button>
        <span role="status" className="font-mono text-xs text-mute">
          {busy ? <span className="mr-2 inline-block size-2 animate-pulse rounded-full motion-reduce:animate-none" style={{ background: "var(--accent)" }} /> : null}
          {t(`phase.${phase}`)}
          {phase === "failed" && error ? `: ${error}` : ""}
        </span>
      </div>
      <p className="max-w-3xl text-sm text-mute">{t(mock ? "mockHint" : "hint")}</p>

      {result ? (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Object.entries(result.summary).map(([key, value]) => (
              <StatTile key={key} value={typeof value === "number" ? value.toLocaleString("en", { maximumFractionDigits: 6 }) : String(value)} label={key} />
            ))}
          </div>
          {result.series.length > 0 ? <LineChart series={result.series} label={t("chart")} /> : null}
          {result.tables.map((table) => (
            <div key={table.title} className="overflow-x-auto">
              <table className="w-full min-w-96 border-collapse font-mono text-sm">
                <caption className="pb-2 text-left font-sans text-sm text-mute">{table.title}</caption>
                <thead>
                  <tr>
                    {table.columns.map((c) => (
                      <th key={c} scope="col" className="border-b border-line px-3 py-2 text-right font-medium text-mute first:text-left">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td key={j} className="border-b border-line px-3 py-2 text-right first:text-left">
                          {typeof cell === "number" ? cell.toLocaleString("en", { maximumFractionDigits: 6 }) : (cell ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
