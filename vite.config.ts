import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import { copyFileSync } from "fs";
import path from "path";

// AD-6 (Story 4.1): GitHub Pages answers a cold GET on any path it has no file
// for with `404.html`, so that file is a byte copy of the SPA shell and the
// router renders the requested route. `scripts/verify-build-base.mjs` fails
// the build if the copy is missing or differs.
function spaFallback404(): Plugin {
  let outDir = "dist";
  return {
    name: "spa-fallback-404",
    apply: "build",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      copyFileSync(path.join(outDir, "index.html"), path.join(outDir, "404.html"));
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    svgr({
      svgrOptions: {
        icon: true,
        exportType: "named",
        namedExport: "ReactComponent",
      },
    }),
    spaFallback404(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  base: '/predictgame7/',
});
