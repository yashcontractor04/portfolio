export type ChartSeries = { name: string; points: [number, number][] };

/**
 * Thin line chart drawn as plain SVG (no chart library). Trade Republic style:
 * no grid, just the lines, with min/max labels. Series colours come from the
 * accent tokens; the last series is drawn muted (used for reference lines).
 */
export function LineChart({ series, label }: { series: ChartSeries[]; label: string }) {
  const all = series.flatMap((s) => s.points);
  if (all.length < 2) return null;
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const pad = (Math.max(...ys) - Math.min(...ys)) * 0.08 || 1;
  const [y0, y1] = [Math.min(...ys) - pad, Math.max(...ys) + pad];
  const W = 1000;
  const H = 300;
  const sx = (x: number) => ((x - x0) / (x1 - x0 || 1)) * W;
  const sy = (y: number) => H - ((y - y0) / (y1 - y0)) * H;
  const format = (n: number) =>
    Math.abs(n) >= 1000 ? n.toLocaleString("en", { maximumFractionDigits: 0 }) : Number.isInteger(n) ? String(n) : n.toFixed(Math.abs(n) >= 10 ? 1 : 4);

  return (
    <figure className="flex flex-col gap-2">
      <div className="flex justify-between font-mono text-xs text-mute">
        <span>{format(Math.max(...ys))}</span>
        <span className="flex gap-4">
          {series.map((s, i) => (
            <span key={s.name} className="flex items-center gap-1.5">
              <span className="h-0.5 w-4" style={{ background: i === series.length - 1 && series.length > 1 ? "var(--mute)" : "var(--accent)" }} />
              {s.name}
            </span>
          ))}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label} className="h-64 w-full">
        {series.map((s, i) => (
          <polyline
            key={s.name}
            fill="none"
            vectorEffect="non-scaling-stroke"
            strokeWidth={1.5}
            strokeDasharray={i === series.length - 1 && series.length > 1 ? "4 4" : undefined}
            stroke={i === series.length - 1 && series.length > 1 ? "var(--mute)" : "var(--accent)"}
            points={s.points.map(([x, y]) => `${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(" ")}
          />
        ))}
      </svg>
      <div className="flex justify-between font-mono text-xs text-mute">
        <span>{format(Math.min(...ys))}</span>
        <span>
          {format(x0)} → {format(x1)}
        </span>
      </div>
    </figure>
  );
}
