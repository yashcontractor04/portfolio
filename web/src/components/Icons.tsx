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
  board: (<><rect x="3" y="4" width="5" height="16" rx="1" /><rect x="10" y="4" width="5" height="10" rx="1" /><rect x="17" y="4" width="4" height="13" rx="1" /></>),
  login: (<><path d="M10 17l5-5-5-5M15 12H3" /><path d="M14 3h5a2 2 0 012 2v14a2 2 0 01-2 2h-5" /></>),
  logout: (<><path d="M16 17l5-5-5-5M21 12H9" /><path d="M10 3H5a2 2 0 00-2 2v14a2 2 0 002 2h5" /></>),
  arrow: (<path d="M5 12h14M13 6l6 6-6 6" />),
  news: (<><path d="M4 5h13v14H6a2 2 0 01-2-2z" /><path d="M17 9h3v8a2 2 0 01-2 2" /><path d="M7.500 9h6M7.500 12.500h6M7.500 16h3" /></>),
  chip: (<><rect x="7" y="7" width="10" height="10" rx="1.500" /><path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4" /></>),
  city: (<><path d="M4 21V8l6-3v16" /><path d="M10 21V11l10 3v7" /><path d="M2 21h20" /></>),
  chart: (<><path d="M4 20V10M10 20V4M16 20v-7M21 20H3" /></>),
  globe: (<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.500 3 14.500 0 18M12 3c-3 3.500-3 14.500 0 18" /></>),
  flag: (<><path d="M5 21V4" /><path d="M5 5h12l-2 4 2 4H5" /></>),
  "thumb-up": (<><path d="M7 11v9H4v-9z" /><path d="M7 11l4-7c1.500 0 2.500 1 2.500 2.500V10h4.500a2 2 0 012 2.300l-1 6a2 2 0 01-2 1.700H7" /></>),
  "thumb-down": (<><path d="M7 13V4H4v9z" /><path d="M7 13l4 7c1.500 0 2.500-1 2.500-2.500V14h4.500a2 2 0 002-2.300l-1-6a2 2 0 00-2-1.700H7" /></>),
  check: (<path d="M5 12.500l4.500 4.500L19 7.500" />),
  gear: (<><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.600 5.600l2.100 2.100M16.300 16.300l2.100 2.100M18.400 5.600l-2.100 2.100M7.700 16.300l-2.100 2.100" /></>),
  external: (<><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" /></>),
  up: (<path d="M6 14l6-6 6 6" />),
  down: (<path d="M6 10l6 6 6-6" />),
};

export function Icon({ name, size = 20 }: { name: keyof typeof paths | string; size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[name] ?? paths.static}
    </svg>
  );
}
