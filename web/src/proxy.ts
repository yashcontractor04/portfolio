import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

// Runs before a request reaches a page. Its only job: send "/" (and any path
// without a language) to /en or /de, based on the browser's language.
export default createMiddleware(routing);

export const config = {
  // Skip API routes, Next.js internals and files (anything with a dot).
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
