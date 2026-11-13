import { z } from "zod";

/** Text that is either the same in both languages or given per language. */
export const localized = z.union([z.string(), z.strictObject({ en: z.string(), de: z.string() })]);
export type Localized = z.infer<typeof localized>;

export function pick(value: Localized, locale: string): string {
  if (typeof value === "string") return value;
  return locale === "de" ? value.de : value.en;
}
