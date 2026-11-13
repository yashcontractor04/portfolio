import type { ReactNode } from "react";

// Small inline stroke icons (no icon library needed). Decorative: hidden from screen readers.
const paths: Record<string, ReactNode> = {
  runner: (<><path d="M3 17l5-6 4 3 6-8" /><path d="M3 21h18" /></>),
  "bot-status": (<><rect x="4" y="8" width="16" height="11" rx="2" /><path d="M12 8V4" /><path d="M9 13h.01M15 13h.01" /></>),
  "in-browser": (<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9l3 3-3 3M13 15h4" /></>),
  static: (<><path d="M6 3h9l4 4v14H6z" /><path d="M9 12h7M9 16h7" /></>),
  home: (<><path d="M4 11l8-7 8 7" /><path d="M6 10v10h12V10" /></>),
  grid: (<><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" /></>),
  spark: (<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.500 15.5L6 18" />),
  mail: (<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>),
  arrow: (<path d="M5 12h14M13 6l6 6-6 6" />),
};

export function Icon({ name, size = 20 }: { name: keyof typeof paths | string; size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[name] ?? paths.static}
    </svg>
  );
}
