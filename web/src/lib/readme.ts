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
  if (fs.existsSync(vendored)) return fs.readFileSync(vendored, "utf8");
  if (!project.repo) return null;
  const [owner, repo] = project.repo.replace("https://github.com/", "").split("/");
  return fetchReadme(owner, repo, project.readme?.ref ?? "HEAD", project.readme?.path ?? "README.md");
}
