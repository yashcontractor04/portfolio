// Web Worker that runs a Python program with Pyodide.
//
// Why a worker: Python runs on a separate thread, so the page never freezes,
// even if the program loops forever. "Stop" simply terminates this worker.
//
// How input() works: Python's input() is synchronous, but the browser is not.
// So when Python asks for a line, this worker tells the page ("input") and then
// SLEEPS on a SharedArrayBuffer with Atomics.wait. The page writes the typed
// line into that shared memory and wakes the worker with Atomics.notify.
//
// Messages from the page:  { type: "run", files: [{ name, text }], entry, shared }
// Messages to the page:    { type: "ready" | "out" | "input" | "done" | "error", ... }
import { loadPyodide } from "/pyodide/pyodide.mjs";

const decoder = new TextDecoder();
const post = (message) => self.postMessage(message);

self.onmessage = async (event) => {
  const { type, files, entry, shared } = event.data;
  if (type !== "run") return;

  const control = new Int32Array(shared, 0, 2); // [0] = wake flag, [1] = byte length
  const bytes = new Uint8Array(shared, 8);

  try {
    const pyodide = await loadPyodide({ indexURL: "/pyodide/" });

    pyodide.setStdout({
      write: (buffer) => {
        post({ type: "out", text: decoder.decode(buffer, { stream: true }) });
        return buffer.length;
      },
      isatty: true,
    });
    pyodide.setStderr({
      write: (buffer) => {
        post({ type: "out", text: decoder.decode(buffer, { stream: true }) });
        return buffer.length;
      },
      isatty: true,
    });
    pyodide.setStdin({
      stdin: () => {
        Atomics.store(control, 0, 0);
        post({ type: "input" });
        Atomics.wait(control, 0, 0); // sleep until the page provides a line
        const length = Atomics.load(control, 1);
        return decoder.decode(bytes.slice(0, length));
      },
      isatty: true,
    });

    pyodide.FS.mkdirTree("/app");
    for (const file of files) pyodide.FS.writeFile(`/app/${file.name}`, file.text);

    post({ type: "ready" });
    pyodide.globals.set("ENTRY", entry);
    await pyodide.runPythonAsync(`
import os, runpy, sys
os.chdir("/app")
sys.path.insert(0, "/app")
try:
    runpy.run_path(ENTRY, run_name="__main__")
except SystemExit:
    pass
`);
    post({ type: "done" });
  } catch (error) {
    post({ type: "error", message: String(error?.message ?? error) });
  }
};
