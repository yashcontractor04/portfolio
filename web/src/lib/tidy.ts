/**
 * The site has its own project names, so repo-specific framing is removed:
 *  - the README's first heading (the page already shows the project name)
 *  - a "Day 7:" style prefix on any remaining heading
 */
export function tidyReadme(markdown: string): string {
  return markdown
    .replace(/^\uFEFF?\s*#\s+.*\r?\n+/, "")
    .replace(/^(#{1,6}\s*)Day[\s-]*\d+\s*[:\-–—]\s*/gim, "$1");
}
