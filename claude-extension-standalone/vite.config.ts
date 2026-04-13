import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json" with { type: "json" };

export default defineConfig({
  // base: "./" produces relative asset URLs in the built HTML. In a Chrome
  // extension the popup page runs at chrome-extension://<id>/src/popup/index.html,
  // and some Chrome builds resolve leading-slash URLs differently than expected
  // when the popup is opened off the action button — using relative paths is
  // the robust choice.
  base: "./",
  plugins: [react(), crx({ manifest: manifest as any })],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
  },
  server: { port: 5175, strictPort: true },
});
