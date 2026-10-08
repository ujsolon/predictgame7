/**
 * The prerender step's orchestration (Story 4.8), I/O injected so it is unit
 * testable; `scripts/prerender/run.ts` is the thin Node entry that supplies the
 * real filesystem, the anon read and Vite's SSR loader.
 *
 * Fails loud — non-zero, every failure listed, and this step's outputs removed
 * so no partial prerender can ship — on: missing env, an empty read, an
 * unshowable row or flagship problem (`planSeriesPages`), a render error, a
 * missing `dist/index.html` or a referenced card under `dist/og/`, any written
 * file missing or empty on read-back, or `index.html` / `404.html` changing.
 * A run that fails the env check deletes nothing (Story 4.2's rule).
 *
 * Pure of Node APIs: no `node:*` import.
 */
import type { Series } from '@/types/types';
import { OUTPUT_PATHS } from './outputs';
import type { PrerenderOutput } from './types';

export { OUTPUT_PATHS };

export const ENV_SUPABASE_URL = 'VITE_SUPABASE_URL';
export const ENV_ANON_KEY = 'VITE_SUPABASE_ANON_KEY';

/** Filesystem access rooted at `dist/`; every path is `dist/`-relative with `/` separators. */
export interface DistIo {
  exists(path: string): boolean;
  /** UTF-8 contents, or `null` when the file is absent. */
  read(path: string): string | null;
  write(path: string, content: string): void;
  /** Recursive and forgiving (`rm -rf`). */
  remove(path: string): void;
}

export interface PrerenderDeps {
  env: Record<string, string | undefined>;
  fetchRows: (url: string, anonKey: string) => Promise<Series[]>;
  render: (rows: Series[], template: string) => Promise<PrerenderOutput>;
  io: DistIo;
  log?: (line: string) => void;
  logError?: (line: string) => void;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runPrerender(deps: PrerenderDeps): Promise<number> {
  const log = deps.log ?? ((line: string) => console.log(line));
  const logError = deps.logError ?? ((line: string) => console.error(line));
  const { io } = deps;

  const url = deps.env[ENV_SUPABASE_URL];
  const anonKey = deps.env[ENV_ANON_KEY];
  if (!url || !anonKey) {
    logError(`${ENV_SUPABASE_URL} and ${ENV_ANON_KEY} must be set (put them in .env and run npm run prerender)`);
    return 2;
  }

  const removeOutputs = () => {
    for (const path of OUTPUT_PATHS) io.remove(path);
  };
  const fail = (failures: string[]): number => {
    logError(`prerender failed: ${failures.length} failure(s):`);
    for (const failure of failures) logError(`  - ${failure}`);
    removeOutputs();
    return 2;
  };

  // A stale or partial prerender must never outlive a failed run.
  removeOutputs();

  try {
    const started = performance.now();
    const template = io.read('index.html');
    if (!template) return fail(['dist/index.html is missing or empty — run npm run build first']);
    const fallback404 = io.read('404.html');

    const rows = await deps.fetchRows(url, anonKey);
    if (rows.length === 0) return fail(['the series read returned no rows — refusing to prerender an empty archive']);

    const output = await deps.render(rows, template);
    if (output.errors.length > 0) return fail(output.errors);
    if (output.files.length === 0) return fail(['the render produced no files']);

    const missingCards = output.cards.filter((card) => !io.exists(card));
    if (missingCards.length > 0) {
      return fail(missingCards.map((card) => `dist/${card} is missing — run npm run og:cards first`));
    }

    for (const file of output.files) io.write(file.path, file.content);

    const readBack: string[] = [];
    for (const file of output.files) {
      const content = io.read(file.path);
      if (!content) readBack.push(`dist/${file.path} is missing or empty on read-back`);
      else if (content !== file.content) readBack.push(`dist/${file.path} differs from what was written`);
    }
    if (io.read('index.html') !== template) readBack.push('dist/index.html changed during the prerender');
    if (io.read('404.html') !== fallback404) readBack.push('dist/404.html changed during the prerender');
    if (readBack.length > 0) return fail(readBack);

    const { summary } = output;
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    log(
      `prerender: ${summary.record + summary.preview + summary.result} series pages ` +
        `(${summary.record} record + ${summary.preview} preview + ${summary.result} result) from ${summary.rows} series read, ` +
        `${summary.shells} shells, sitemap ${summary.sitemapUrls} URLs, robots.txt — ${output.files.length} files, ${seconds} s`
    );
    return 0;
  } catch (error) {
    return fail([messageOf(error)]);
  }
}
