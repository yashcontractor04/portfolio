"use client";

import { useId, useState, type ReactNode } from "react";

export type Tab = { key: string; label: string; content: ReactNode };

/**
 * Accessible tabs (like a GitHub repo page). Arrow keys move between tabs.
 * All panels stay mounted and are only hidden, so a running terminal is not
 * lost when the visitor looks at another tab.
 */
export function Tabs({ tabs, label }: { tabs: Tab[]; label: string }) {
  const [active, setActive] = useState(tabs[0]?.key);
  const id = useId();

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = tabs[(index + step + tabs.length) % tabs.length];
    setActive(next.key);
    document.getElementById(`${id}-tab-${next.key}`)?.focus();
  };

  return (
    <div className="flex flex-col gap-6">
      <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((tab, index) => (
          <button
            key={tab.key}
            id={`${id}-tab-${tab.key}`}
            role="tab"
            type="button"
            aria-selected={active === tab.key}
            aria-controls={`${id}-panel-${tab.key}`}
            tabIndex={active === tab.key ? 0 : -1}
            onClick={() => setActive(tab.key)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`-mb-px h-11 shrink-0 border-b-2 px-4 text-sm ${
              active === tab.key ? "border-accent text-text" : "border-transparent text-mute hover:text-text"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div key={tab.key} id={`${id}-panel-${tab.key}`} role="tabpanel" aria-labelledby={`${id}-tab-${tab.key}`} hidden={active !== tab.key}>
          {tab.content}
        </div>
      ))}
    </div>
  );
}
