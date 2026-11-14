/**
 * README for a project's Overview tab.
 *  - in-browser projects: read from the vendored copy in projects/<slug>/src (no network).
 *  - others: fetched from GitHub, cached, and refreshed about once an hour.
 * Returns null when there is no README or GitHub is unreachable; the page then
 * falls back to the summary. A build never fails because of GitHub.
 */
import fs from "node:fs";
import path from "node:path";
import { cacheLife } from "next/cache";
import { REPO_ROOT, type Project } from "./projects";
import { tidyReadme } from "./tidy";

const MAX_BYTES = 200_000;

async function fetchReadme(owner: string, repo: string, ref: string, file: string): Promise<string | null> {
  "use cache";
  cacheLife("hours");
  try {
    // Only ever talks to raw.githubusercontent.com; owner/repo come from our own manifests.
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${file.split("/").map(encodeURIComponent).join("/")}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const text = await response.text();
    return text.length <= MAX_BYTES ? text : text.slice(0, MAX_BYTES);
  } catch {
    return null;
  }
}

export async function loadReadme(project: Project): Promise<string | null> {
  const vendored = path.join(REPO_ROOT, "projects", project.slug, "src", "README.md");
  if (fs.existsSync(vendored)) return tidyReadme(fs.readFileSync(vendored, "utf8"));
  if (!project.repo) return null;
  const [owner, repo] = project.repo.replace("https://github.com/", "").split("/");
  const text = await fetchReadme(owner, repo, project.readme?.ref ?? "HEAD", project.readme?.path ?? "README.md");
  return text === null ? null : tidyReadme(text);
}

/**
 * GitHub link for a project: straight to its folder when it lives inside a
 * bigger repo, otherwise the repo itself.
 */
export function sourceUrl(project: Project): string | null {
  const encode = (p: string) => p.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  if (project.in_browser) {
    const { repo, ref, path: dir } = project.in_browser.source;
    return `${repo}/tree/${ref}/${encode(dir)}`;
  }
  if (!project.repo) return null;
  const dir = path.posix.dirname(project.readme?.path ?? "README.md");
  return dir === "." ? project.repo : `${project.repo}/tree/${encodeURIComponent(project.readme?.ref ?? "HEAD")}/${encode(dir)}`;
}
