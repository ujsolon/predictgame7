/**
 * Story 4.2 — the OG card build step (FR-31, AD-6/AD-7 as amended 2026-10-07).
 *
 * Reads every series over anon REST, keeps the ones that derive a phase
 * (archive AND pending, `deriveSeriesPhase`, AD-4 — never `status`, dates or
 * `league`), normalises each team's logo from `public/` to PNG, and writes
 * `dist/og/<series-id>.png` plus `dist/og/fallback.png` (1200×630 each).
 *
 * Runs in `predeploy` after the gate, never inside it: the gate and CI have no
 * Supabase secrets. Any failure — DB unreachable, a missing or undecodable
 * logo, a series render that throws — exits non-zero after listing every
 * failure, and the output directory is removed so no partial output can ship by
 * accident. A run that never got past the env check touches nothing on disk.
 *
 * Operator usage:
 *   npm run og:cards        (= node --env-file-if-exists=.env scripts/og/render.ts)
 */
import { mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { deriveSeriesPhase, type SeriesPhaseInput } from '../../src/lib/series-phase.ts';
import { SERIES_SELECT } from '../../src/lib/series-query.ts';
import { neutralPair } from '../../src/lib/spoiler-neutral.ts';
import { normaliseLogo, renderCard } from './card.ts';

/** Repo root, derived from this file's location; pinned by `tests/og/card.test.ts`. */
export const REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

/** The directory `gh-pages -d dist` publishes the cards from. Exported so its seam is testable. */
export const DEFAULT_OUT_DIR = join(REPO_ROOT, 'dist', 'og');

export const ENV_SUPABASE_URL = 'VITE_SUPABASE_URL';
export const ENV_ANON_KEY = 'VITE_SUPABASE_ANON_KEY';

interface TeamRow {
  id?: number | string;
  full_name?: string | null;
  nickname?: string | null;
  abbreviation: string;
  logo_url: string | null;
}

/** The slice of a `SERIES_SELECT` row this step reads. */
export interface OgSeriesRow extends SeriesPhaseInput {
  id: string;
  year: number;
  round: string;
  team_a?: TeamRow | null;
  team_b?: TeamRow | null;
}

export interface OgRunDeps {
  env: Record<string, string | undefined>;
  /** Defaults to an anon `SERIES_SELECT` read; tests inject rows. */
  fetchSeries?: (url: string, anonKey: string) => Promise<OgSeriesRow[]>;
  publicDir?: string;
  outDir?: string;
  readFile?: (path: string) => Buffer;
  log?: (line: string) => void;
  logError?: (line: string) => void;
}

async function fetchSeriesAnon(url: string, anonKey: string): Promise<OgSeriesRow[]> {
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.from('series').select(SERIES_SELECT).order('year').order('id');
  if (error) {
    throw new Error(`series read failed: ${error.message}`);
  }
  return (data ?? []) as unknown as OgSeriesRow[];
}

export async function runOgCards(deps: OgRunDeps): Promise<number> {
  const log = deps.log ?? ((line: string) => console.log(line));
  const logError = deps.logError ?? ((line: string) => console.error(line));
  const publicDir = deps.publicDir ?? join(REPO_ROOT, 'public');
  const outDir = deps.outDir ?? DEFAULT_OUT_DIR;
  const readFile = deps.readFile ?? ((path: string) => readFileSync(path));
  const fetchSeries = deps.fetchSeries ?? fetchSeriesAnon;

  // Checked before anything is deleted, so a run with no env leaves the previous
  // output alone instead of destroying it on the way out.
  const url = deps.env[ENV_SUPABASE_URL];
  const anonKey = deps.env[ENV_ANON_KEY];
  if (!url || !anonKey) {
    logError(`${ENV_SUPABASE_URL} and ${ENV_ANON_KEY} must be set (put them in .env and run npm run og:cards)`);
    return 2;
  }

  // A stale or partial `dist/og` must never outlive a failed run.
  rmSync(outDir, { recursive: true, force: true });

  try {
    const started = performance.now();
    const rows = await fetchSeries(url, anonKey);
    if (rows.length === 0) {
      throw new Error('the series read returned no rows — refusing to publish a card set with no series');
    }

    const skipped: string[] = [];
    const failures: string[] = [];
    // Cached by path, team-free: a shared failing `logo_url` must name each
    // requesting team, so the `team <code>: …` message is built per call.
    const logoCache = new Map<string, Promise<Buffer>>();
    const loadLogo = (path: string): Promise<Buffer> => {
      let cached = logoCache.get(path);
      if (!cached) {
        cached = (async () => {
          let bytes: Buffer;
          try {
            bytes = readFile(path);
          } catch (error) {
            throw new Error(`logo missing at ${path} (${messageOf(error)})`);
          }
          try {
            return await normaliseLogo(bytes);
          } catch (error) {
            throw new Error(`logo at ${path} failed to decode (${messageOf(error)})`);
          }
        })();
        logoCache.set(path, cached);
      }
      return cached;
    };

    const logoFor = async (seriesId: string, slot: string, team: TeamRow | null | undefined): Promise<Buffer> => {
      if (!team) {
        throw new Error(`series ${seriesId}: ${slot} team is missing from the read`);
      }
      if (!team.logo_url) {
        throw new Error(`team ${team.abbreviation}: no logo_url`);
      }
      try {
        return await loadLogo(join(publicDir, team.logo_url.replace(/^\/+/, '')));
      } catch (error) {
        throw new Error(`team ${team.abbreviation}: ${messageOf(error)}`);
      }
    };

    mkdirSync(outDir, { recursive: true });
    let seriesCards = 0;
    let fallbackCards = 0;
    let totalBytes = 0;
    const write = (name: string, png: Buffer) => {
      writeFileSync(join(outDir, name), png);
      totalBytes += png.length;
    };

    for (const row of rows) {
      if (deriveSeriesPhase(row) === null) {
        skipped.push(`${row.id} (${row.year} ${row.round})`);
        continue;
      }
      try {
        const [logoA, logoB] = await Promise.all([
          logoFor(row.id, 'team_a', row.team_a),
          logoFor(row.id, 'team_b', row.team_b),
        ]);
        // Spoiler-neutral order (owner decision 2026-10-07): stored order puts
        // the eventual winner first in 177/178 archived rows, and the card is
        // winner-free — so the left/right sides follow `neutralPair`, never
        // team_a/team_b.
        const side = (team: TeamRow | null | undefined, logoPng: Buffer) => ({
          id: team?.id ?? '',
          full_name: team?.full_name ?? team?.abbreviation ?? '',
          nickname: team?.nickname ?? null,
          card: { abbreviation: team?.abbreviation ?? '', logoPng },
        });
        const [left, right] = neutralPair(side(row.team_a, logoA), side(row.team_b, logoB));
        const png = await renderCard({
          kind: 'series',
          year: row.year,
          round: row.round,
          teamA: left.card,
          teamB: right.card,
        });
        write(`${row.id}.png`, png);
        seriesCards += 1;
      } catch (error) {
        failures.push(`${row.id} (${row.year} ${row.round}): ${messageOf(error)}`);
      }
    }

    try {
      write('fallback.png', await renderCard({ kind: 'fallback' }));
      fallbackCards = 1;
    } catch (error) {
      failures.push(`fallback: ${messageOf(error)}`);
    }
    if (seriesCards === 0 && failures.length === 0) {
      failures.push(`no series card written: all ${rows.length} series row(s) were skipped (no derivable phase)`);
    }

    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    const megabytes = (totalBytes / (1024 * 1024)).toFixed(2);
    log(`og cards: ${seriesCards + fallbackCards} written (${seriesCards} series + ${fallbackCards} fallback) of ${rows.length} series read, ${seconds} s, ${megabytes} MB -> ${outDir}`);
    log(`skipped (no derivable phase, so no page either): ${skipped.length ? skipped.join('; ') : 'none'}`);
    if (failures.length > 0) {
      logError(`og cards failed: ${failures.length} failure(s):`);
      for (const failure of failures) {
        logError(`  - ${failure}`);
      }
      rmSync(outDir, { recursive: true, force: true });
      return 2;
    }
    return 0;
  } catch (error) {
    logError(`og cards failed: ${messageOf(error)}`);
    rmSync(outDir, { recursive: true, force: true });
    return 2;
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Only auto-run when executed as the entry script; importing it has no side effects.
// realpathSync on both sides (as scripts/measure-predict-latency.mjs does): Node
// realpaths the main module, so a plain resolve() can miss through a symlink or
// a case-differing path and the step would exit 0 having written nothing. An
// unresolvable argv[1] throws rather than quietly skipping the run — a step that
// exits 0 with no cards is the failure this guard exists to prevent.
const entryPath = realpathSync(fileURLToPath(import.meta.url)).toLowerCase();
if (process.argv[1] !== undefined && realpathSync(resolve(process.argv[1])).toLowerCase() === entryPath) {
  process.exitCode = await runOgCards({ env: process.env });
}
