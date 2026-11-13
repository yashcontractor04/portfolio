import { defineRouting } from "next-intl/routing";

// The two languages of the site. Every page lives under /en or /de.
export const routing = defineRouting({
  locales: ["en", "de"],
  defaultLocale: "en",
});

export type Locale = (typeof routing.locales)[number];
