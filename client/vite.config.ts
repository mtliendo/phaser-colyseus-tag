import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  publicDir: "public",
  resolve: {
    alias: {
      "@tag/shared": resolve(root, "../shared/src/index.ts"),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
        host: resolve(root, "host.html"),
        play: resolve(root, "play.html"),
      },
    },
  },
});
