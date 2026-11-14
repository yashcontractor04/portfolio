/**
 * Registry of private apps. The dock reads this list, so adding an app means
 * adding one entry here (plus its page and data stores). See docs/CONVENTIONS.md.
 */
export const APPS = [
  { key: "workspace", href: "/apps/workspace", icon: "static", hue: "indigo" },
  { key: "board", href: "/apps/board", icon: "board", hue: "cyan" },
] as const;

export type AppKey = (typeof APPS)[number]["key"];
