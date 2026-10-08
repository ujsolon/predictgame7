/**
 * Story 4.8 — the prerender build step (AD-6/AD-7), the thin Node entry.
 *
 * Runs in `predeploy` after `og:cards`, never inside the gate (the gate and CI
 * have no Supabase secrets). It reads every series over anon REST, loads the
 * app's own route tree through Vite's SSR loader and renders every series page,
 * the four app-route shells, `sitemap.xml` and `robots.txt` into `dist/`.
 * The logic lives in `src/prerender/` (unit tested); this file only supplies
 * the filesystem, the read and the loader.
 *
 * The `src/prerender` modules are loaded with `ssrLoadModule`, never imported
 * here at runtime: they use the `@/` alias and JSX, which plain Node cannot run
 * (and the type-only imports below keep JSX out of the pipeline program).
 *
 * Operator usage:
 *   npm run prerender       (= node --env-file-if-exists=.env scripts/prerender/run.ts)
 */
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, type ViteDevServer } from 'vite';
import type { DistIo, PrerenderDeps } from '../../src/prerender/build.ts';
import { OUTPUT_PATHS } from '../../src/prerender/outputs.ts';
import type { PrerenderOutput } from '../../src/prerender/types.ts';
import type { Series } from '../../src/types/types.ts';
import { ENV_ANON_KEY, ENV_SUPABASE_URL, fetchSeriesAnon, REPO_ROOT } from '../og/render.ts';

export const DIST_DIR = join(REPO_ROOT, 'dist');

interface BuildModule {
  runPrerender: (deps: PrerenderDeps) => Promise<number>;
}

interface EntryModule {
  prerenderSite: (rows: readonly Series[], template: string) => PrerenderOutput;
}

/** `dist/`-rooted filesystem access for `runPrerender`. */
export function distIo(distDir: string): DistIo {
  const at = (path: string) => join(distDir, ...path.split('/'));
  return {
    exists: (path) => existsSync(at(path)) && statSync(at(path)).size > 0,
    read: (path) => (existsSync(at(path)) ? readFileSync(at(path), 'utf8') : null),
    write: (path, content) => {
      mkdirSync(dirname(at(path)), { recursive: true });
      writeFileSync(at(path), content, 'utf8');
    },
    remove: (path) => rmSync(at(path), { recursive: true, force: true }),
  };
}

async function main(): Promise<number> {
  // A run without env deletes nothing (Story 4.2's rule) and never starts Vite.
  if (!process.env[ENV_SUPABASE_URL] || !process.env[ENV_ANON_KEY]) {
    // Same message `runPrerender` prints, without starting Vite first.
    console.error(`${ENV_SUPABASE_URL} and ${ENV_ANON_KEY} must be set (put them in .env and run npm run prerender)`);
    return 2;
  }
  let server: ViteDevServer | null = null;
  try {
    // measured: react-helmet-async is CJS and its named imports fail unless it is bundled into the SSR graph.
    server = await createServer({
      root: REPO_ROOT,
      configFile: join(REPO_ROOT, 'vite.config.ts'),
      mode: 'production',
      appType: 'custom',
      logLevel: 'warn',
      server: { middlewareMode: true, hmr: false, ws: false },
      ssr: { noExternal: ['react-helmet-async'] },
    });
    const vite = server;
    const build = (await vite.ssrLoadModule('/src/prerender/build.ts')) as BuildModule;
    return await build.runPrerender({
      env: process.env,
      fetchRows: async (url, anonKey) => (await fetchSeriesAnon(url, anonKey)) as unknown as Series[],
      render: async (rows, template) => {
        const entry = (await vite.ssrLoadModule('/src/prerender/entry-server.tsx')) as EntryModule;
        return entry.prerenderSite(rows, template);
      },
      io: distIo(DIST_DIR),
    });
  } catch (error) {
    console.error(`prerender failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
    // The SSR loader itself failed: no partial or stale prerender may survive.
    const io = distIo(DIST_DIR);
    for (const path of OUTPUT_PATHS) io.remove(path);
    return 2;
  } finally {
    await server?.close();
  }
}

// Only auto-run as the entry script (same guard as scripts/og/render.ts): an
// unresolvable argv[1] throws rather than exiting 0 having written nothing.
const entryPath = realpathSync(fileURLToPath(import.meta.url)).toLowerCase();
if (process.argv[1] !== undefined && realpathSync(resolve(process.argv[1])).toLowerCase() === entryPath) {
  process.exitCode = await main();
}
