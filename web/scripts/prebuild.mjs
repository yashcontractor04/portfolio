// Runs before `next dev` and `next build` (see package.json).
// Copies two things into public/ so the browser can load them from OUR domain:
//   1. the Pyodide runtime (Python compiled to WebAssembly) from node_modules
//   2. the vendored source of every in-browser project (projects/<slug>/src)
// Self-hosting means no visitor request goes to a third-party CDN.
import fs from "node:fs";
import path from "node:path";

const web = path.resolve(import.meta.dirname, "..");
const repo = path.resolve(web, "..");

const pyodideOut = path.join(web, "public", "pyodide");
fs.rmSync(pyodideOut, { recursive: true, force: true });
fs.mkdirSync(pyodideOut, { recursive: true });
for (const file of ["pyodide.mjs", "pyodide.asm.mjs", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"]) {
  fs.copyFileSync(path.join(web, "node_modules", "pyodide", file), path.join(pyodideOut, file));
}

const pyOut = path.join(web, "public", "py");
fs.rmSync(pyOut, { recursive: true, force: true });
let count = 0;
for (const entry of fs.readdirSync(path.join(repo, "projects"), { withFileTypes: true })) {
  const src = path.join(repo, "projects", entry.name, "src");
  if (!entry.isDirectory() || !fs.existsSync(src)) continue;
  fs.mkdirSync(path.join(pyOut, entry.name), { recursive: true });
  for (const file of fs.readdirSync(src)) {
    if (/\.(py|txt|json|csv)$/.test(file)) {
      fs.copyFileSync(path.join(src, file), path.join(pyOut, entry.name, file));
      count++;
    }
  }
}
console.log(`prebuild: Pyodide runtime + ${count} project source files copied to public/`);
