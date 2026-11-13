/** Reads content/cv.yaml (the CV single source of truth) at build time. */
import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { localized } from "./localized";
import { REPO_ROOT } from "./projects";

const cvSchema = z.object({
  person: z.object({
    name: z.string(),
    location: localized,
    email: z.email(),
    links: z.object({ github: z.url(), linkedin: z.url() }),
    headline: localized,
    about: localized,
  }),
  skills: z.array(z.object({ group: localized, items: z.array(localized) })),
});

export type Cv = z.infer<typeof cvSchema>;

export function loadCv(root: string = REPO_ROOT): Cv {
  const text = fs.readFileSync(path.join(root, "content", "cv.yaml"), "utf8");
  return cvSchema.parse(parse(text));
}
