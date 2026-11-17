import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const isDev = process.env.NODE_ENV !== "production";

// Content-Security-Policy: the browser only loads what is listed here.
// 'unsafe-inline' for scripts is needed because statically generated Next.js pages
// contain inline bootstrap scripts (nonces would force every page to be dynamic).
// Everything else is locked to this site. Widen deliberately when Supabase and
// Pyodide are added (connect-src / script-src), never with a wildcard.
// The browser may talk to exactly one external host: our Supabase project
// (https for the API, wss for Realtime). Derived from the env var, never a wildcard.
let supabaseOrigin = "";
try {
  supabaseOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
} catch {}
const supabaseSources = supabaseOrigin ? ` ${supabaseOrigin} ${supabaseOrigin.replace(/^http/, "ws")}` : "";

// imgSrc differs for the News app only (see newsHeaders below).
const buildCsp = (imgSrc: string) => [
  "default-src 'self'",
  // 'wasm-unsafe-eval' lets the browser compile WebAssembly (Pyodide). It does not allow eval().
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
  "worker-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  `img-src ${imgSrc}`,
  "font-src 'self'",
  `connect-src 'self'${supabaseSources}${isDev ? " ws:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const csp = buildCsp("'self' data:");

// The News app shows each article's preview picture straight from the publisher
// (hotlinked: nothing is copied or stored). Two headers have to change for that,
// and they change for the News page ONLY:
//  1. img-src allows any https image, because publishers host pictures anywhere.
//     Images cannot run code; scripts, styles, fonts and connections stay locked down.
//  2. COEP "credentialless" instead of "require-corp". require-corp blocks every
//     cross-origin image whose server did not opt in, which is nearly all of them.
//     credentialless loads them WITHOUT cookies, so the publisher learns nothing about
//     the reader beyond the IP address (the <img> also sends no referrer).
// Why not site-wide: Safari does not support "credentialless" and would lose
// cross-origin isolation, which the in-browser Python terminal needs.
// Why the dock opens News with a full page load (registry.ts: fullLoad): headers
// belong to the document that was loaded, and client-side navigation keeps the old one.
const newsHeaders = [
  { key: "Content-Security-Policy", value: buildCsp("'self' data: https:") },
  { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
];

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
    return [
      { source: "/:path*", headers: securityHeaders },
      // Later entries win for the same header name.
      { source: "/:locale/apps/news", headers: newsHeaders },
    ];
  },
};

export default createNextIntlPlugin()(nextConfig);
