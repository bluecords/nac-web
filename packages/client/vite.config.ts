import { lingui as linguiSolidPlugin } from "@lingui-solid/vite-plugin";
import devtools from "@solid-devtools/transform";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import babelMacrosPlugin from "vite-plugin-babel-macros";
import Inspect from "vite-plugin-inspect";
import { VitePWA } from "vite-plugin-pwa";
import solidPlugin from "vite-plugin-solid";
import solidSvg from "vite-plugin-solid-svg";

import codegenPlugin from "./codegen.plugin";

const base = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base,
  plugins: [
    Inspect(),
    devtools(),
    codegenPlugin(),
    babelMacrosPlugin(),
    linguiSolidPlugin(),
    solidPlugin(),
    solidSvg({
      defaultAsComponent: false,
    }),
    VitePWA({
      srcDir: "src",
      // "autoUpdate" is correct here, but it only works if the service worker
      // itself calls skipWaiting - see the top of src/serviceWorker.ts. With
      // `strategies: injectManifest` the plugin does NOT inject that for you
      // the way generateSW does, and it was missing, which deadlocked every
      // client. Measured 2026-09-03 against the plugin's registration source
      // (dist/client/build/register.js), not its docs:
      //
      //   auto === true  -> listens for "activated"/"installed" only, and
      //                     reloads the page when an update activates.
      //   auto === false -> listens for "waiting" and calls onNeedRefresh.
      //
      // Do NOT switch this to "prompt" to bring back a refresh banner without
      // reading the note in serviceWorker.ts first: a prompt depends on code
      // running in the OLD page, so a client on a stale or broken build can
      // never be told to update. Worker-driven activation cannot be stranded.
      registerType: "autoUpdate",
      filename: "serviceWorker.ts",
      strategies: "injectManifest",
      injectManifest: {
        maximumFileSizeToCacheInBytes: 4000000,
      },
      manifest: {
        name: "NAC Social",
        short_name: "NAC",
        description: "Naked as Created community chat.",
        categories: ["communication", "chat", "messaging"],
        start_url: base,
        orientation: "portrait",
        display_override: ["window-controls-overlay"],
        display: "standalone",
        background_color: "#101823",
        theme_color: "#101823",
        icons: [
          {
            src: `${base}assets/web/android-chrome-192x192.png`,
            type: "image/png",
            sizes: "192x192",
          },
          {
            src: `${base}assets/web/android-chrome-512x512.png`,
            type: "image/png",
            sizes: "512x512",
          },
          {
            src: `${base}assets/web/monochrome.svg`,
            type: "image/svg+xml",
            sizes: "48x48 72x72 96x96 128x128 256x256",
            purpose: "monochrome",
          },
          {
            src: `${base}assets/web/masking-512x512.png`,
            type: "image/png",
            sizes: "512x512",
            purpose: "maskable",
          },
        ],
        // TODO: take advantage of shortcuts
      },
    }),
  ],
  build: {
    target: "esnext",
    rollupOptions: {
      external: ["hast"],
      output: {
        manualChunks: {
          markdown: [
            "lowlight",
            "rehype-highlight",
            "rehype-katex",
            "remark-breaks",
            "remark-gfm",
            "remark-math",
            "remark-parse",
            "remark-rehype",
            "vfile",
          ],
        },
      },
    },
    sourcemap: true,
  },
  optimizeDeps: {
    exclude: ["hast"],
  },
  resolve: {
    alias: {
      "styled-system": resolve(__dirname, "styled-system"),
      ...readdirSync(resolve(__dirname, "components")).reduce(
        (p, f) => ({
          ...p,
          [`@revolt/${f}`]: resolve(__dirname, "components", f),
        }),
        {},
      ),
    },
  },
});
