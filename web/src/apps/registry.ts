/**
 * Registry of private apps. The dock and the command palette read this list (through
 * useApps), so adding an app means adding one entry here plus its page and data store.
 * See docs/CONVENTIONS.md.
 *
 * `requires`: the app is only listed for logged-in users whose profile has this flag
 *   (a boolean column in `profiles` that only the server can set). Apps without it are
 *   listed for everyone and run in demo mode for guests. Hiding is for tidiness only:
 *   the database (RLS) is what actually protects the data.
 * `fullLoad`: open with a full page load instead of client-side navigation, because the
 *   page needs its own response headers (see the News rules in next.config.ts).
 */
export type AppKey = "workspace" | "board" | "news";

export type AppEntry = {
  key: AppKey;
  href: string;
  icon: string;
  hue: string;
  requires?: "news_enabled";
  fullLoad?: boolean;
};

export const APPS: readonly AppEntry[] = [
  { key: "workspace", href: "/apps/workspace", icon: "static", hue: "indigo" },
  { key: "board", href: "/apps/board", icon: "board", hue: "cyan" },
  { key: "news", href: "/apps/news", icon: "news", hue: "orange", requires: "news_enabled", fullLoad: true },
];

/** Which apps to list, given the flags of the logged-in user (null = guest or still loading). */
export function visibleApps(flags: Record<string, boolean> | null): AppEntry[] {
  return APPS.filter((app) => !app.requires || flags?.[app.requires] === true);
}
