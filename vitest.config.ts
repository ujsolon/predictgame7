import { mergeConfig } from "vite";
import { defineConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

// The app config is the single source of truth for the test graph: everything
// it declares (react + svgr plugins, so `.svg` imports resolve, and the full
// `resolve.alias` set — `@` -> ./src today) is inherited here instead of being
// re-declared, so the two configs cannot drift.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // Cheap pure-logic tests stay on Node; component tests opt into jsdom
      // per-file with the `// @vitest-environment jsdom` docblock.
      environment: "node",
      include: ["src/**/*.{test,spec}.{ts,tsx}", "tests/**/*.{test,spec}.{ts,tsx}"],
      setupFiles: ["./src/test/setup.ts"],
    },
  })
);
