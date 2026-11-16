"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import type { Snapshot } from "@/lib/sim/schema";
import { FanChart, ValueChart } from "./Charts";

/**
 * Public dashboard of the stock simulator: the three model portfolios (low /
 * medium / high risk) from the daily snapshot. Pick one at the top; below it
 * are its performance against the benchmark, its allocation and a range of
 * possible outcomes. Everything here is read-only and comes in as one prop.
 */
export function SimDashboard({ snapshot, sample }: { snapshot: Snapshot; sample: boolean }) {
  const t = useTranslations("sim");
  const locale = useLocale();
  const [active, setActive] = useState(1); // medium
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();

  const money0 = new Intl.NumberFormat(locale, { style: "currency", currency: snapshot.currency, maximumFractionDigits: 0 });
  const money2 = new Intl.NumberFormat(locale, { style: "currency", currency: snapshot.currency, minimumFractionDigits: 2 });
  const percent = new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: "exceptZero" });
  const share = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 });
  const plain = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const dates = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" });
  const date = (iso: string) => dates.format(new Date(`${iso}T00:00:00Z`));
  const tone = (n: number) => (n > 0 ? "text-positive" : n < 0 ? "text-negative" : "text-mute");

  const p = snapshot.portfolios[active];
  const bench = snapshot.benchmark.ticker;
  const last = p.outlook.months.length - 1;

  // Arrow keys move between the three portfolios, like radio buttons.
  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const step = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = (index + step + snapshot.portfolios.length) % snapshot.portfolios.length;
    setActive(next);
    buttons.current[next]?.focus();
  };

  const heading = "font-mono text-xs uppercase tracking-wider text-mute";
  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-3">
        {sample ? (
          <p className="w-fit rounded-md border border-line-strong px-3 py-2 font-mono text-xs">{t("sample")}</p>
        ) : null}
        <p className="max-w-3xl text-sm leading-relaxed text-mute">
          {t("intro", { start: date(snapshot.started_on), amount: money0.format(snapshot.start_value), benchmark: bench })}
        </p>
      </div>

      <div role="radiogroup" aria-label={t("choose")} className="grid gap-3 sm:grid-cols-3">
        {snapshot.portfolios.map((portfolio, index) => (
          <button
            key={portfolio.risk_level}
            ref={(element) => void (buttons.current[index] = element)}
            type="button"
            role="radio"
            aria-checked={active === index}
            tabIndex={active === index ? 0 : -1}
            onClick={() => setActive(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`flex flex-col gap-2 rounded-md border bg-tile px-5 py-4 text-left ${
              active === index ? "border-accent" : "border-line hover:border-line-strong"
            }`}
          >
            <span className="text-sm text-mute">{t(`risk.${portfolio.risk_level}`)}</span>
            <span className="font-mono text-3xl font-medium leading-none tracking-tight">{money0.format(portfolio.value)}</span>
            <span className="flex flex-wrap gap-x-3 font-mono text-xs">
              <span className={tone(portfolio.total_return)}>{percent.format(portfolio.total_return)}</span>
              <span className="text-mute">
                {bench} {percent.format(portfolio.benchmark_return)}
              </span>
            </span>
          </button>
        ))}
      </div>

      <section aria-labelledby={`${id}-performance`} className="flex flex-col gap-4">
        <h2 id={`${id}-performance`} className={heading}>
          {t("performance")}
        </h2>
        <ValueChart
          series={p.series}
          labels={{ portfolio: t(`risk.${p.risk_level}`), benchmark: bench }}
          money={(n) => money0.format(n)}
          date={date}
          summary={t("performanceSummary", {
            value: money0.format(p.value),
            change: percent.format(p.total_return),
            benchmark: bench,
            benchmarkChange: percent.format(p.benchmark_return),
          })}
        />
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 font-mono text-sm sm:grid-cols-4">
          {[
            { label: t("stats.day"), value: percent.format(p.day_change), className: tone(p.day_change) },
            { label: t("stats.volatility"), value: p.volatility === null ? "–" : share.format(p.volatility) },
            { label: t("stats.drawdown"), value: percent.format(p.max_drawdown), className: tone(p.max_drawdown) },
            { label: t("stats.sharpe"), value: p.sharpe === null ? "–" : plain.format(p.sharpe) },
          ].map((stat) => (
            <div key={stat.label} className="flex flex-col gap-1">
              <dt className="font-sans text-xs text-mute">{stat.label}</dt>
              <dd className={`text-xl ${stat.className ?? ""}`}>{stat.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby={`${id}-allocation`} className="flex flex-col gap-4">
        <h2 id={`${id}-allocation`} className={heading}>
          {t("allocation")}
        </h2>
        <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
          {p.allocation.map((a) => (
            <span
              key={a.ticker}
              style={{
                width: `${a.weight * 100}%`,
                background: a.role === "core" ? "var(--accent)" : "color-mix(in srgb, var(--accent) 45%, transparent)",
              }}
            />
          ))}
        </div>
        <table className="w-full border-collapse text-sm">
          <thead className="sr-only">
            <tr>
              <th scope="col">{t("columns.ticker")}</th>
              <th scope="col">{t("columns.name")}</th>
              <th scope="col">{t("columns.sector")}</th>
              <th scope="col">{t("columns.weight")}</th>
            </tr>
          </thead>
          <tbody>
            {p.allocation.map((a) => (
              <tr key={a.ticker} className="border-b border-line">
                <th scope="row" className="w-20 py-2.5 text-left font-mono font-medium">
                  {a.ticker}
                </th>
                <td className="w-1/2 max-w-0 truncate py-2.5 pr-4 text-mute">{a.name}</td>
                <td className="hidden py-2.5 pr-4 text-mute sm:table-cell">
                  {a.sector} · {t(`role.${a.role}`)}
                </td>
                <td className="w-16 py-2.5 text-right font-mono">{share.format(a.weight)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {p.warnings.length > 0 ? (
          <ul className="flex flex-col gap-1 text-sm text-mute">
            {p.warnings.map((w) => (
              <li key={w.code}>
                <span className="font-mono text-xs uppercase">{t(`severity.${w.severity}`)}</span> {w.message}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section aria-labelledby={`${id}-outlook`} className="flex flex-col gap-4">
        <h2 id={`${id}-outlook`} className={heading}>
          {t("outlook", { years: p.outlook.horizon_years })}
        </h2>
        <FanChart
          outlook={p.outlook}
          labels={{
            median: t("fan.median"),
            middle: t("fan.middle"),
            wide: t("fan.wide"),
            start: t("fan.today"),
            end: t("fan.years", { years: p.outlook.horizon_years }),
          }}
          money={(n) => money0.format(n)}
          summary={t("outlookSummary", {
            years: p.outlook.horizon_years,
            low: money0.format(p.outlook.p5[last]),
            mid: money0.format(p.outlook.p50[last]),
            high: money0.format(p.outlook.p95[last]),
          })}
        />
        <dl className="grid gap-x-6 gap-y-4 font-mono text-sm sm:grid-cols-3">
          {[
            { label: t("fan.low"), value: p.outlook.p5[last] },
            { label: t("fan.mid"), value: p.outlook.p50[last] },
            { label: t("fan.high"), value: p.outlook.p95[last] },
          ].map((stat) => (
            <div key={stat.label} className="flex flex-col gap-1">
              <dt className="font-sans text-xs text-mute">{stat.label}</dt>
              <dd className="text-xl">{money0.format(stat.value)}</dd>
            </div>
          ))}
        </dl>
        <p className="max-w-3xl text-sm leading-relaxed text-mute">{t("outlookNote", { paths: plain.format(p.outlook.paths) })}</p>
      </section>

      <footer className="flex flex-col gap-3 border-t border-line pt-6">
        <p className="font-mono text-xs text-mute">
          {t("updated", { date: date(snapshot.as_of), value: money2.format(p.value) })}
        </p>
        <p className="rounded-md border border-line bg-tile p-4 text-sm text-mute">{t("disclaimer")}</p>
      </footer>
    </div>
  );
}
