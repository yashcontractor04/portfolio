import type { ReactNode } from "react";

/** macOS-style panel with the three traffic-light dots. Used for main panels. */
export function Window({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-line bg-panel ${className}`}>
      <div className="flex items-center gap-4 px-5 pt-4" aria-hidden="true">
        <div className="flex gap-2">
          <span className="size-3 rounded-full" style={{ background: "var(--light-close)" }} />
          <span className="size-3 rounded-full" style={{ background: "var(--light-min)" }} />
          <span className="size-3 rounded-full" style={{ background: "var(--light-max)" }} />
        </div>
        {title ? <span className="font-mono text-xs text-mute">{title}</span> : null}
      </div>
      {children}
    </section>
  );
}
