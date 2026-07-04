import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";
import { VitePWA } from "vite-plugin-pwa";

const dataPkgVersion: string = JSON.parse(
  readFileSync(
    new URL("./node_modules/@alpaca-software/40kdc-data/package.json", import.meta.url),
    "utf8",
  ),
).version;

// GH Pages serves from /<repo>/; hash routing keeps deep links working there.
export default defineConfig({
  base: process.env.GH_PAGES_BASE ?? "/40k-app/",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        // The embedded dataset chunk is far larger than workbox's 2MB default.
        maximumFileSizeToCacheInBytes: 40 * 1024 * 1024,
      },
      manifest: {
        name: "40k List Viewer",
        short_name: "40k Viewer",
        description: "Glanceable Warhammer 40k army list viewer",
        display: "standalone",
        background_color: "#0c0a09",
        theme_color: "#0c0a09",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
  define: {
    __DATA_PKG_VERSION__: JSON.stringify(dataPkgVersion),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Keep the dataset + importer + translator in one lazy chunk so the
          // app shell paints before it downloads.
          if (id.includes("@alpaca-software")) return "40kdc";
        },
      },
    },
  },
  test: {
    environment: "node",
  },
});
