import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const isDev = process.env.NODE_ENV !== "production";

// Content-Security-Policy: the browser only loads what is listed here.
// 'unsafe-inline' for scripts is needed because statically generated Next.js pages
// contain inline bootstrap scripts (nonces would force every page to be dynamic).
// Everything else is locked to this site. Widen deliberately when Supabase and
// Pyodide are added (connect-src / script-src), never with a wildcard.
const csp = [
  "default-src 'self'",
  // 'wasm-unsafe-eval' lets the browser compile WebAssembly (Pyodide). It does not allow eval().
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
  "worker-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Cross-origin isolation. Required for SharedArrayBuffer, which the in-browser
  // Python terminal uses to make input() work. Site-wide, because moving between
  // pages without a full reload keeps the first page's headers.
  // Consequence: any cross-origin image/script must be CORS-enabled (crossorigin attribute).
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default createNextIntlPlugin()(nextConfig);
