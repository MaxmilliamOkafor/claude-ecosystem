/** Bundle test/unit.test.ts with Vite (SSR mode) and run it in Node. */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = mkdtempSync(join(tmpdir(), "wd-unit-"));
await build({
  configFile: false,
  root,
  logLevel: "warn",
  build: { ssr: "test/unit.test.ts", target: "node20", outDir: out, emptyOutDir: true, rollupOptions: { output: { entryFileNames: "unit.mjs" } } },
});
await import(pathToFileURL(join(out, "unit.mjs")).href);
