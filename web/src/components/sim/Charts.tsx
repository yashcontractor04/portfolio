import type { SnapshotPortfolio } from "@/lib/sim/schema";

const W = 1000;
const H = 300;

/** Maps data to the SVG box, with a little air above and below. */
function scales(xs: number[], ys: number[]) {
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const pad = (Math.max(...ys) - Math.min(...ys)) * 0.08 || 1;
  const [y0, y1] = [Math.min(...ys) - pad, Math.max(...ys) + pad];
  return {
    sx: (x: number) => ((x - x0) / (x1 - x0 || 1)) * W,
    sy: (y: number) => H - ((y - y0) / (y1 - y0)) * H,
  };
}
const path = (points: [number, number][]) => points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

function Legend({ items }: { items: { label: string; muted?: boolean }[] }) {
  return (
    <span className="flex flex-wrap justify-end gap-x-4 gap-y-1">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5">
          <span className="h-0.5 w-4" style={{ background: item.muted ? "var(--mute)" : "var(--accent)" }} />
          {item.label}
        </span>
      ))}
    </span>
  );
}

/**
 * Portfolio value against the benchmark. Same look as LineChart (thin lines, no
 * grid), but with dates on the x-axis. `summary` is read out by screen readers
 * instead of the drawing.
 */
export function ValueChart({
  series,
  labels,
  money,
  date,
  summary,
}: {
  series: SnapshotPortfolio["series"];
  labels: { portfolio: string; benchmark: string };
  money: (n: number) => string;
  date: (iso: string) => string;
  summary: string;
}) {
  const xs = series.dates.map((_, i) => i);
  const all = [...series.portfolio, ...series.benchmark];
  const { sx, sy } = scales(xs, all);
  const line = (values: number[]) => path(values.map((v, i) => [sx(i), sy(v)]));
  return (
    <figure className="flex flex-col gap-2">
      <div className="flex justify-between gap-4 font-mono text-xs text-mute">
        <span>{money(Math.max(...all))}</span>
        <Legend items={[{ label: labels.portfolio }, { label: labels.benchmark, muted: true }]} />
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={summary} className="h-64 w-full">
        <polyline fill="none" vectorEffect="non-scaling-stroke" strokeWidth={1.5} strokeDasharray="4 4" stroke="var(--mute)" points={line(series.benchmark)} />
        <polyline fill="none" vectorEffect="non-scaling-stroke" strokeWidth={1.5} stroke="var(--accent)" points={line(series.portfolio)} />
      </svg>
      <div className="flex justify-between font-mono text-xs text-mute">
        <span>{money(Math.min(...all))}</span>
        <span>
          {date(series.dates[0])} → {date(series.dates.at(-1) ?? series.dates[0])}
        </span>
      </div>
    </figure>
  );
}

/**
 * Range of possible outcomes ("fan chart"). The wide band holds 90 of 100
 * simulated paths (5th to 95th percentile), the narrow band the middle 50, and
 * the line is the median path.
 */
export function FanChart({
  outlook,
  labels,
  money,
  summary,
}: {
  outlook: SnapshotPortfolio["outlook"];
  labels: { median: string; middle: string; wide: string; start: string; end: string };
  money: (n: number) => string;
  summary: string;
}) {
  const { sx, sy } = scales(outlook.months, [...outlook.p5, ...outlook.p95]);
  const band = (low: number[], high: number[]) =>
    path([
      ...outlook.months.map((m, i): [number, number] => [sx(m), sy(high[i])]),
      ...outlook.months.map((m, i): [number, number] => [sx(m), sy(low[i])]).reverse(),
    ]);
  const swatch = (share: number) => `color-mix(in srgb, var(--accent) ${share}%, transparent)`;
  return (
    <figure className="flex flex-col gap-2">
      <div className="flex justify-between gap-4 font-mono text-xs text-mute">
        <span>{money(Math.max(...outlook.p95))}</span>
        <span className="flex flex-wrap justify-end gap-x-4 gap-y-1">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4" style={{ background: "var(--accent)" }} />
            {labels.median}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-sm" style={{ background: swatch(36) }} />
            {labels.middle}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-sm" style={{ background: swatch(16) }} />
            {labels.wide}
          </span>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={summary} className="h-64 w-full">
        <polygon fill={swatch(16)} points={band(outlook.p5, outlook.p95)} />
        <polygon fill={swatch(24)} points={band(outlook.p25, outlook.p75)} />
        <polyline fill="none" vectorEffect="non-scaling-stroke" strokeWidth={1.5} stroke="var(--accent)" points={path(outlook.months.map((m, i) => [sx(m), sy(outlook.p50[i])]))} />
      </svg>
      <div className="flex justify-between font-mono text-xs text-mute">
        <span>{money(Math.min(...outlook.p5))}</span>
        <span>
          {labels.start} → {labels.end}
        </span>
      </div>
    </figure>
  );
}
