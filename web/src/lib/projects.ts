/**
 * Project system: reads every projects/<slug>/project.yaml at build time.
 *
 * The zod schema below mirrors projects/project.schema.json. zod gives us two
 * things at once: validation (a broken manifest fails the build, not the site)
 * and the TypeScript type `Project`, inferred from the schema.
 */
import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";

const both = z.strictObject({ en: z.string().min(1).max(300), de: z.string().min(1).max(300) });
const githubRepo = z.string().regex(/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
const slugPattern = /^[a-z0-9][a-z0-9-]{1,62}$/;

export const TAGS = ["python", "bots", "data", "web"] as const;
export const ACCENTS = ["blue", "indigo", "violet", "pink", "orange", "amber", "teal", "cyan"] as const;

const input = z.strictObject({
  name: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
  type: z.enum(["string", "integer", "number", "boolean", "select", "date", "string_list", "number_list"]),
  label: both,
  help: both.optional(),
  required: z.boolean().default(true),
  default: z.unknown().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  min_date: z.string().optional(),
  max_date: z.string().optional(),
  max_length: z.number().int().min(1).max(500).optional(),
  pattern: z.string().optional(),
  min_items: z.number().int().min(0).optional(),
  max_items: z.number().int().min(1).max(50).optional(),
  options: z.array(z.strictObject({ value: z.string(), label: both })).min(1).optional(),
});

export const manifestSchema = z
  .strictObject({
    schema: z.literal(1),
    name: z.string().min(1).max(60),
    type: z.enum(["static", "in-browser", "runner", "bot-status"]),
    status: z.enum(["live", "building", "coming-soon"]),
    featured: z.boolean().default(false),
    order: z.number().int().default(100),
    tags: z.array(z.enum(TAGS)).min(1),
    summary: both,
    repo: githubRepo.optional(),
    readme: z.strictObject({ path: z.string().default("README.md"), ref: z.string().default("HEAD") }).optional(),
    stack: z.array(z.string().max(30)).max(12).default([]),
    accent: z.enum(ACCENTS).default("blue"),
    how_it_works: z.string().regex(/^[a-z0-9._-]+\.mdx?$/).optional(),
    static: z.strictObject({ content: z.string().regex(/^[a-z0-9._-]+\.mdx?$/) }).optional(),
    in_browser: z
      .strictObject({
        entry: z.string().regex(/^[A-Za-z0-9_./-]+\.py$/),
        source: z.strictObject({
          repo: githubRepo,
          path: z.string(),
          ref: z.string().regex(/^[0-9a-f]{40}$/, "must be a full commit SHA"),
        }),
        packages: z.array(z.string()).max(10).default([]),
      })
      .optional(),
    runner: z
      .strictObject({
        timeout_seconds: z.number().int().min(5).max(900).default(120),
        max_attempts: z.number().int().min(1).max(5).default(2),
        key_provider: z.string().regex(/^[a-z0-9_]{2,32}$/).optional(),
        disclaimer: z.enum(["not-financial-advice"]).optional(),
        inputs: z.array(input).max(20),
        demo: z.strictObject({ enabled: z.boolean().default(true), params: z.record(z.string(), z.unknown()) }),
      })
      .optional(),
    bot: z
      .strictObject({
        bot_slug: z.string().regex(slugPattern),
        check_interval_minutes: z.number().int().min(1).max(1440).optional(),
      })
      .optional(),
  })
  // Each type needs its own section.
  .refine((m) => m.type !== "in-browser" || m.in_browser, { message: "type in-browser needs an in_browser section" })
  .refine((m) => m.type !== "runner" || m.runner, { message: "type runner needs a runner section" })
  .refine((m) => m.type !== "bot-status" || m.bot, { message: "type bot-status needs a bot section" });

export type Manifest = z.infer<typeof manifestSchema>;
export type Project = Manifest & { slug: string };
export type Tag = (typeof TAGS)[number];

/** Validate one manifest (already parsed from YAML). Throws a readable error. */
export function parseManifest(slug: string, data: unknown): Project {
  if (!slugPattern.test(slug)) {
    throw new Error(`projects/${slug}: folder name must be lowercase letters, digits and dashes`);
  }
  const result = manifestSchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new Error(`projects/${slug}/project.yaml is invalid:\n  ${issues.join("\n  ")}`);
  }
  return { ...result.data, slug };
}

/** The repo root is one level above web/ (where `next build` runs). */
export const REPO_ROOT = path.resolve(process.cwd(), "..");

/** All projects, sorted for display: featured first, then by `order`, then name. */
export function loadProjects(root: string = REPO_ROOT): Project[] {
  const dir = path.join(root, "projects");
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(dir, entry.name, "project.yaml")))
    .map((entry) => {
      const text = fs.readFileSync(path.join(dir, entry.name, "project.yaml"), "utf8");
      return parseManifest(entry.name, parse(text));
    })
    .sort((a, b) => Number(b.featured) - Number(a.featured) || a.order - b.order || a.name.localeCompare(b.name));
}
