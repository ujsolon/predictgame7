/**
 * Story 2.8 — the committed generator for migration `00016` (archive league
 * identity + Game 7 venue backfill).
 *
 * Single source: `data/game7_venues_curated.csv` (178 rows — one per archived
 * series). This file parses it, validates it, and emits the whole migration
 * text so there is exactly one copy of the VALUES lists and no hand-spliced
 * block to drift (`--check` regenerates and compares — after line-ending
 * normalization, so `core.autocrlf=true` checkouts cannot make it red at
 * line 1 — and drift fails in either direction). Placement under
 * `supabase/scripts/pipeline/` is deliberate: `tsconfig.pipeline.json`
 * includes this directory (so `tsc -b` type-checks it) and Biome's
 * `files.includes` lints it — unlike anything under `scripts/`.
 *
 * The refuse-to-emit gate (spec D2): while any NBA/BAA row carries a blank
 * `game7_home_team`, emitting is refused with a non-zero exit naming the
 * count — the missing curation is an instrument that cannot pass, not a
 * comment. Blank is legal on the 18 ABA rows only: their game-7 rows stay as
 * archived (sprint-change-proposal Call 2).
 *
 * The self-test path (spec D2): while curation was outstanding, the harness drove the
 * SAME template with a deterministic synthetic assignment — the first 117
 * NBA/BAA rows in file order get home = `team_a` (keep), the last 43 get
 * home = `team_b` (swap) — written to a temp path, never into
 * `supabase/migrations/`. It exists so every guard is demonstrably falsifiable
 * on a fixture archive of the real shape (178 series × 7 rows); a guard that
 * cannot fail is not a guard. Curation landed 2026-10-02, so a normal run takes
 * the committed-file branch and this one remains for a pre-emit drill.
 *
 * The orientation rule per matched game-7 row (Design Notes):
 *   1. stored home = curated home  → keep;
 *   2. stored home = team_a (the canonical 00007 state) → swap teams AND
 *      scores in one UPDATE (Postgres evaluates every SET against the
 *      pre-update row, so `winner_team_id` needs no touch);
 *   3. otherwise → abort naming the series — the 178th-series protection:
 *      never overwrite a row that is neither canonical nor the curated value.
 *
 * Usage:
 *   node supabase/scripts/pipeline/venueBackfill.ts              # emit (refused while venues are blank)
 *   node supabase/scripts/pipeline/venueBackfill.ts --check      # CSV ↔ migration byte agreement
 *   node supabase/scripts/pipeline/venueBackfill.ts \
 *        --self-test-migration=<tmp.sql> --self-test-fixture=<tmp.sql>   # harness self-test path
 *
 * This script writes no database, reads no network, and never runs the
 * pipeline; `plan.ts` and both adapters are untouched by design (Call 1).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = dirname(fileURLToPath(import.meta.url));

export const CURATED_CSV_PATH = join(moduleDir, 'data', 'game7_venues_curated.csv');
export const FEED_ALIASES_CSV_PATH = join(moduleDir, 'data', 'game7_feed_aliases.csv');
export const MIGRATION_FILENAME = '00016_archive_league_identity_and_game7_venues.sql';
const MIGRATIONS_DIR = resolve(moduleDir, '..', '..', 'migrations');

export class VenueBackfillError extends Error {}

/** The five columns, in this exact order — `game7_venues_curated.csv`. */
const REQUIRED_COLUMNS = ['year', 'team_a', 'team_b', 'league', 'game7_home_team'];

export const LEAGUES = ['NBA', 'BAA', 'ABA'];

/**
 * The pinned post-`00016` archive facts (epic-2-context "Measured archive facts"):
 * measured against the live table on 2026-10-01, and deliberately **pinned rather
 * than derived** — spec-2-8 D5, owner decision 2026-10-01. Pinned means a drifted
 * archive cannot be silently absorbed: these numbers are interpolated into the
 * migration's own guards, so growth or a shrink aborts the apply loudly at
 * `league_backfill_complete` / `venue_coverage` / `aba_row_census` /
 * `game7_home_win_census` rather than re-scoping a statistic nobody re-read.
 *
 * The rule that goes with it: if the live archive has grown by apply time, the
 * fix is to **re-measure it (owner-run), append the newer series to the curated
 * CSV, and change these constants in that same commit** — never to relax or
 * delete a guard. The 178 total and the 1,246 row count are pinned alongside
 * them by `parseVenuesCsv`'s one-row-per-series contract and the rehearsal's
 * fixture census.
 */
export const EXPECTED_NBA_BAA = 160;
export const EXPECTED_ABA = 18;
export const EXPECTED_GAME7_HOME_WINS = 117;
/** The synthetic self-test split: 117 keeps (home = team_a) + 43 swaps (home = team_b). */
export const SYNTHETIC_KEEP_COUNT = EXPECTED_GAME7_HOME_WINS;

const ABBREVIATION_PATTERN = /^[A-Z]{3}$/;
const INTEGER_PATTERN = /^\d+$/;

export interface VenueRow {
  /** 1-based line number in the CSV — every error message names it. */
  line: number;
  year: number;
  teamA: string;
  teamB: string;
  league: string;
  /** '' when blank. Always one of teamA/teamB when non-blank (validated). */
  home: string;
}

function rowRef(sourceName: string, line: number): string {
  return `${sourceName}:${line}`;
}

/** No quoting anywhere in this file (same convention as manualCsv's splitter). */
function splitCsvLine(line: string, ref: string): string[] {
  const fields = line.split(',').map((field) => field.trim());
  if (fields.length !== REQUIRED_COLUMNS.length) {
    throw new VenueBackfillError(
      `${ref}: expected ${REQUIRED_COLUMNS.length} columns (${REQUIRED_COLUMNS.join(', ')}), got ${fields.length}: "${line}"`,
    );
  }
  return fields;
}

/**
 * Three columns, with the last one allowed to contain commas: an evidence line reads
 * as English prose ("… claimed 1988 LAL vs DAL (csv:112) and …, leaving UTA …"), and a
 * splitter that counted commas would reject the very documentation this table exists
 * to carry. `splitCsvLine` is deliberately NOT reused — it is pinned to the curated
 * file's five columns.
 */
function splitAliasLine(line: string, ref: string): string[] {
  const first = line.indexOf(',');
  const second = first === -1 ? -1 : line.indexOf(',', first + 1);
  if (first === -1 || second === -1) {
    throw new VenueBackfillError(`${ref}: expected ${ALIAS_COLUMNS.join(', ')} — got "${line}"`);
  }
  return [line.slice(0, first).trim(), line.slice(first + 1, second).trim(), line.slice(second + 1).trim()];
}

function fail(ref: string, message: string): never {
  throw new VenueBackfillError(`${ref}: ${message}`);
}

/**
 * Parse and validate the curated CSV. Throws `VenueBackfillError` naming the
 * offending row (source + line number) for any malformed input, and rejects
 * two rows resolving to the same (year, unordered team pair) — the identity
 * `00016` resolves series against.
 */
export function parseVenuesCsv(csvText: string, sourceName: string): VenueRow[] {
  const rows: VenueRow[] = [];
  const seenPairs = new Map<string, number>();
  let headerSeen = false;

  const lines = csvText.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    const lineNo = index + 1;
    if (line === '' || line.startsWith('#')) continue;

    if (!headerSeen) {
      const header = splitCsvLine(line, rowRef(sourceName, lineNo));
      const mismatch = header.findIndex(
        (column, position) => column.toLowerCase() !== REQUIRED_COLUMNS[position].toLowerCase(),
      );
      if (mismatch !== -1) {
        throw new VenueBackfillError(
          `${rowRef(sourceName, lineNo)}: header column "${header[mismatch]}" should be "${REQUIRED_COLUMNS[mismatch]}" — ` +
            `expected exactly ${REQUIRED_COLUMNS.join(', ')}`,
        );
      }
      headerSeen = true;
      continue;
    }

    const ref = rowRef(sourceName, lineNo);
    const [yearText, teamA, teamB, league, home] = splitCsvLine(line, ref);
    if (!INTEGER_PATTERN.test(yearText)) {
      fail(ref, `"year" must be a non-negative integer, got "${yearText}"`);
    }
    for (const [column, value] of [
      ['team_a', teamA],
      ['team_b', teamB],
    ] as const) {
      if (!ABBREVIATION_PATTERN.test(value)) {
        fail(ref, `"${column}" must be a three-letter teams.abbreviation, got "${value}"`);
      }
    }
    if (teamA === teamB) {
      fail(ref, `a series cannot pair a team with itself (${teamA} vs ${teamB})`);
    }
    if (!LEAGUES.includes(league)) {
      fail(ref, `"league" must be one of ${LEAGUES.join('/')}, got "${league}"`);
    }
    if (home !== '') {
      if (!ABBREVIATION_PATTERN.test(home)) {
        fail(ref, `"game7_home_team" must be blank or a three-letter abbreviation, got "${home}"`);
      }
      if (home !== teamA && home !== teamB) {
        fail(ref, `"game7_home_team" "${home}" is neither team_a "${teamA}" nor team_b "${teamB}" — the Game 7 home team is one of the two series slots`);
      }
    }
    if (league === 'ABA' && home !== '') {
      fail(
        ref,
        'the 18 ABA rows are out of venue scope (Call 2) — their game7_home_team must stay blank and their game-7 rows stay as archived',
      );
    }

    const pairKey = `${yearText}|${[teamA, teamB].sort().join('|')}`;
    const previous = seenPairs.get(pairKey);
    if (previous !== undefined) {
      throw new VenueBackfillError(
        `${ref}: same (year, unordered team pair) as ${rowRef(sourceName, previous)} (${yearText}, ${teamA}, ${teamB}) — ` +
          'one curated row per archived series',
      );
    }
    seenPairs.set(pairKey, lineNo);

    rows.push({ line: lineNo, year: Number(yearText), teamA, teamB, league, home });
  }

  if (!headerSeen) {
    throw new VenueBackfillError(`${sourceName}: no header row found — expected ${REQUIRED_COLUMNS.join(',')}`);
  }
  return rows;
}

/** NBA or BAA — the rows whose Game-7 venue is real once `00016` applies. */
export function isNbaBaa(row: VenueRow): boolean {
  return row.league === 'NBA' || row.league === 'BAA';
}

/** NBA/BAA rows still carrying a blank venue — the curation gap. */
export function blankVenueRows(rows: readonly VenueRow[]): VenueRow[] {
  return rows.filter((row) => isNbaBaa(row) && row.home === '');
}

/** The archive's teams: 30 current franchises from `00005` plus 29 historical from `00007`. */
export const EXPECTED_TEAM_COUNT = 59;

const TEAM_SEED_ROW = /\((\d+),\s*'[^']+',\s*'([A-Z]{3})',/g;

/**
 * The `teams` seed as an abbreviation → id map — the same 59 rows `00016`
 * resolves abbreviations through, and the only id space this repo's clients
 * speak. Owned here (review pass 2, P2-12) because both `00016`'s generator and
 * the owner-run venue probe read it: two copies of one regex is how a curated
 * abbreviation starts meaning two different things.
 *
 * Throws when the count is not exactly 59 — the seed format drifting is a
 * louder event than a venue list built on a partial map.
 */
export function parseTeamsSeed(seedText: string, sourceName: string): Map<string, number> {
  const seed = new Map<string, number>();
  for (const match of seedText.matchAll(TEAM_SEED_ROW)) {
    // A duplicate used to fold first-wins: 60 rows with one repeated
    // abbreviation still yielded 59 uniques and passed the count pin while
    // silently dropping a team (pass 3, P3-5).
    if (seed.has(match[2])) {
      throw new VenueBackfillError(
        `${sourceName}: teams seed holds abbreviation "${match[2]}" twice (ids ${seed.get(match[2])} and ${match[1]}) — refusing to fold first-wins under the ${EXPECTED_TEAM_COUNT}-count pin`,
      );
    }
    seed.set(match[2], Number(match[1]));
  }
  if (seed.size !== EXPECTED_TEAM_COUNT) {
    throw new VenueBackfillError(
      `${sourceName}: teams seed parse found ${seed.size} abbreviations, expected exactly ${EXPECTED_TEAM_COUNT} ` +
        '(00005 seeds the 30 current franchises, 00007 the 29 historical ones) — fix the reader before trusting any output built on it',
    );
  }
  return seed;
}

/**
 * What one season of the venue feed just told the owner (review pass 2, P2-4/P2-5
 * of the curation run). The distinction the first version of the probe got wrong:
 * **zero completed Game 7s is only news when the archive says there was one.**
 * 1998-99 answers zero and the curated file holds no 1999 row — that is the feed
 * corroborating the archive, and failing the run on it would be a false alarm.
 */
export type SeasonOutcome = 'ok' | 'empty-feed' | 'missing-game7' | 'no-game7';

/**
 * What one season of the venue feed just told the owner (spec-2-8 D1 evidence).
 *
 * **Agreement outranks silence.** The first version asked whether the route returned
 * anything before asking whether the archive expected anything, and the 2026-10-01
 * full sweep showed what that costs: thirteen seasons reported as failures —
 * 1946-47, 1948-49, 1949-50, 1952-53, 1955-56, 1957-58, 1966-67, 1971-72, 1982-83,
 * 1984-85, 1988-89, 1990-91, 1998-99 — and the curated file holds **no Game 7 for
 * any of those thirteen calendar years**. The feed and the archive agree on every one;
 * a run that ends in exit 2 on agreement trains the owner to ignore the instrument.
 */
export function classifySeason(input: {
  seriesInFeed: number;
  completedGame7: number;
  curatedRowsForYear: number;
}): SeasonOutcome {
  if (input.completedGame7 > 0) return 'ok';
  // Nothing reached Game 7 on the feed's account. If the archive holds none either,
  // that is corroboration — it does not matter whether the route said "no series" or
  // "no Game 7".
  if (input.curatedRowsForYear === 0) return 'no-game7';
  return input.seriesInFeed === 0 ? 'empty-feed' : 'missing-game7';
}

export const SEASON_OUTCOME_MEANING: Record<SeasonOutcome, string> = {
  ok: 'answered',
  'empty-feed': 'the archive holds a Game 7 for this calendar year and the route returned no series at all — depth short of this season, or a hostile-cadence block (spec-2-8 D1 evidence)',
  'missing-game7': 'the feed answered the season but no series reached Game 7, while the curated file holds NBA/BAA Game 7s for that calendar year — a real disagreement to resolve, not a gap to fill by hand',
  'no-game7': 'no Game 7 on the feed and none in the archive for that year — corroborating, not a failure',
};

/** One approved row of `data/game7_feed_aliases.csv`. */
export interface FeedAlias {
  line: number;
  /** The code the feed prints. */
  feed: string;
  /** The abbreviation `teams` holds, and the archive speaks. */
  teams: string;
  evidence: string;
}

/** A season's Game-7 series as raw feed codes — a code the seed lacks stays a code. */
export interface FeedSeriesPair {
  codeA: string;
  codeB: string;
}

export interface MatchedSeries {
  series: FeedSeriesPair;
  row: VenueRow;
  /** `'direct'`, or the approved alias(es) that made the pair resolve. */
  via: 'direct' | { aliases: FeedAlias[] };
}

export interface UnmatchedSeries {
  series: FeedSeriesPair;
  reason: 'no-alias';
  /** The curated rows this season leaves standing on one known side — what an alias would have to pick between. */
  candidates: VenueRow[];
}

const ALIAS_COLUMNS = ['feed_abbr', 'teams_abbr', 'evidence'];

/**
 * Parse and validate the owner-approved alias table. A mapping whose target is not
 * in the `teams` seed is refused — that is the whole vocabulary `00016` resolves
 * through, so an alias pointing outside it could never be written. Two rows naming
 * the same feed code is also refused: one code meaning two franchises is precisely
 * the ambiguity this table exists to remove, not to reintroduce.
 */
export function parseFeedAliases(csvText: string, sourceName: string, seed: ReadonlyMap<string, number>): FeedAlias[] {
  const aliases: FeedAlias[] = [];
  const seen = new Map<string, number>();
  let headerSeen = false;

  const lines = csvText.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    const lineNo = index + 1;
    if (line === '' || line.startsWith('#')) continue;

    const ref = rowRef(sourceName, lineNo);
    const cells = splitAliasLine(line, ref);
    if (!headerSeen) {
      const mismatch = cells.findIndex((cell, position) => cell.toLowerCase() !== ALIAS_COLUMNS[position]?.toLowerCase());
      if (mismatch !== -1) {
        throw new VenueBackfillError(
          `${ref}: header must be exactly ${ALIAS_COLUMNS.join(', ')} — got "${line}"`,
        );
      }
      headerSeen = true;
      continue;
    }

    const [feed, teams, evidence] = cells;
    for (const [column, value] of [
      ['feed_abbr', feed],
      ['teams_abbr', teams],
    ] as const) {
      if (!ABBREVIATION_PATTERN.test(value)) {
        throw new VenueBackfillError(`${ref}: "${column}" must be a three-letter abbreviation, got "${value}"`);
      }
    }
    if (evidence === '') {
      throw new VenueBackfillError(`${ref}: an alias with no evidence line is unauditable — name the season, the opposing side and the curated row it resolves to`);
    }
    if (!seed.has(teams)) {
      throw new VenueBackfillError(
        `${ref}: alias target "${teams}" is not in the teams seed — 00016 resolves abbreviations through that table, so this alias could never be written`,
      );
    }
    const previous = seen.get(feed);
    if (previous !== undefined) {
      throw new VenueBackfillError(
        `${ref}: feed code "${feed}" is already aliased at ${rowRef(sourceName, previous)} — one feed code may not name two franchises`,
      );
    }
    seen.set(feed, lineNo);
    if (feed === teams) {
      throw new VenueBackfillError(`${ref}: alias "${feed}" → "${teams}" maps a code to itself — it can never fire, so it is noise in an audited table`);
    }
    aliases.push({ line: lineNo, feed, teams, evidence });
  }

  if (!headerSeen) {
    throw new VenueBackfillError(`${sourceName}: no header row found — expected ${ALIAS_COLUMNS.join(',')}`);
  }
  return aliases;
}

function slotPairMatches(row: VenueRow, a: string, b: string): boolean {
  return (row.teamA === a && row.teamB === b) || (row.teamA === b && row.teamB === a);
}

/**
 * Resolve one season's Game-7 series against the curated rows by (year, unordered
 * pair), with approved aliases allowed to close a naming gap — and allowed to do it
 * in exactly one way.
 *
 * The ordering is the safety property, and it is why this lives in the tested module
 * rather than in the probe's print loop:
 *
 * 1. **Direct pass first, over the whole season.** A pair that matches a curated row
 *    without substitution wins outright and *claims* that row. This is what keeps
 *    `WAS → WSB` harmless: the 2017 Celtics-Wizards row matches directly and is
 *    claimed before any alias is consulted, so it is never re-read as the 1970s
 *    Bullets.
 * 2. **Alias pass only on what the direct pass could not match, and only against
 *    rows no direct match claimed.** The 1988 case is why claiming matters: `LAL/UTH`
 *    is ambiguous until the direct matches take `LAL vs DAL` and `LAL vs DET`, which
 *    leaves `LAL vs UTA` as the one row that can be standing.
 * 3. **One surviving row or no answer.** Zero is unmatched, and its candidate rows
 *    are returned so the owner can see what an alias would have to claim. Two is not
 *    a choice to make — it means pair-uniqueness or one-alias-per-code has broken, so
 *    it raises.
 * 4. **Every substitution applied at once, each one owner-approved separately.** The
 *    first version allowed exactly one and left pairs like `WAS/SAN` (1979 Bullets at
 *    the Spurs) unmatched on the reasoning that the answer would then rest on two
 *    unverified codes. The owner approved that change on 2026-10-01: an alias is only
 *    ever consulted from the audited table, so a pair needing two of them is no less
 *    verified than a pair needing one — and the constraint that carries the safety,
 *    exactly one surviving row, is unchanged.
 */
export function matchSeasonFeedSeries(input: {
  year: number;
  series: readonly FeedSeriesPair[];
  curated: readonly VenueRow[];
  aliases: readonly FeedAlias[];
}): { matched: MatchedSeries[]; unmatched: UnmatchedSeries[] } {
  const rowsForYear = input.curated.filter((row) => row.year === input.year);
  const claimed = new Set<number>();
  const matched: MatchedSeries[] = [];
  const pending: FeedSeriesPair[] = [];

  for (const series of input.series) {
    const direct = rowsForYear.find((row) => !claimed.has(row.line) && slotPairMatches(row, series.codeA, series.codeB));
    if (direct === undefined) {
      pending.push(series);
      continue;
    }
    claimed.add(direct.line);
    matched.push({ series, row: direct, via: 'direct' });
  }

  const unmatched: UnmatchedSeries[] = [];
  for (const series of pending) {
    const applied: FeedAlias[] = [];
    const substitute = (code: string): string => {
      const alias = input.aliases.find((candidate) => candidate.feed === code);
      if (alias === undefined) return code;
      applied.push(alias);
      return alias.teams;
    };
    const codeA = substitute(series.codeA);
    const codeB = substitute(series.codeB);
    const survivors = applied.length === 0 ? [] : rowsForYear.filter((row) => !claimed.has(row.line) && slotPairMatches(row, codeA, codeB));

    if (survivors.length === 1) {
      const [row] = survivors;
      claimed.add(row.line);
      matched.push({ series, row, via: { aliases: applied } });
      continue;
    }
    if (survivors.length > 1) {
      // Not a judgement call — an invariant broke. `parseVenuesCsv` rejects two
      // curated rows on the same (year, unordered pair) and `parseFeedAliases`
      // rejects two aliases for one feed code, so substitution can land on at most
      // one row. Reaching this line means one of those rules no longer holds.
      const detail = survivors.map((row) => `${row.year} ${row.teamA}/${row.teamB} (csv:${row.line})`).join('; ');
      throw new VenueBackfillError(
        `alias resolution is not single-valued for series ${input.year} ${series.codeA}/${series.codeB} -> ${codeA}/${codeB}: ${detail} — ` +
          'one curated row per (year, pair) and one alias per feed code are the guarantees this rests on',
      );
    }
    // Nothing resolved it. Report the rows this season leaves standing that share at
    // least one side with the series — that list is the proposal an owner can approve
    // or reject, and an empty list means the archive genuinely does not hold this pair.
    const candidates = rowsForYear.filter(
      (row) => !claimed.has(row.line) && (row.teamA === series.codeA || row.teamB === series.codeA || row.teamA === series.codeB || row.teamB === series.codeB),
    );
    unmatched.push({ series, reason: 'no-alias', candidates });
  }

  return { matched, unmatched };
}

/**
 * Map one raw feed code through the approved aliases. Used on the resolved side of a
 * match (the Game-7 home team), so a caller can require the answer to be one of the
 * matched row's own two slots — the same rule `parseVenuesCsv` enforces on input.
 */
export function resolveFeedCode(code: string, aliases: readonly FeedAlias[]): { abbr: string; alias: FeedAlias | null } {
  const alias = aliases.find((candidate) => candidate.feed === code) ?? null;
  return { abbr: alias === null ? code : alias.teams, alias };
}


/**
 * The hand-entry worksheet for the rows no feed answers (spec-2-8 D6: the 62
 * NBA/BAA series in 1948–1992, plus anything the venue probe cannot reach).
 *
 * The point of generating it instead of reading the CSV is that **the answer is
 * binary**: the curated home is always one of the row's own two slots, because
 * `parseVenuesCsv` refuses anything else. So the worksheet asks "which of these
 * two hosted Game 7" and names the exact line to edit — no abbreviation
 * transcription from an outside source, which is where a hand-entered list
 * actually goes wrong (a reference site's code for a relocated franchise is not
 * this repo's `teams.abbreviation`).
 */
export function renderWorksheet(rows: readonly VenueRow[]): string {
  const blanks = blankVenueRows(rows);
  const head = [
    `# Game-7 venue worksheet — ${blanks.length} NBA/BAA row(s) still blank in game7_venues_curated.csv`,
    '# For each line, answer with the abbreviation of the team that HOSTED Game 7.',
    '# The answer is always one of the two names shown; anything else is refused',
    '# by the parser. Fill column 5 of the named line, then run:',
    '#   node supabase/scripts/pipeline/venueBackfill.ts   # emits 00016 when none are left',
    '#',
  ];
  const lines = blanks.map(
    (row) =>
      `${curatedLineLabel(row.line)}  ${row.year}  ${row.league}  ${row.teamA} vs ${row.teamB}  ->  game7_home_team = ____ (one of ${row.teamA} | ${row.teamB})`,
  );
  return `${[...head, ...lines].join('\n')}\n`;
}

/** Where a curated row lives, so a worksheet answer can be pasted without hunting. */
function curatedLineLabel(line: number): string {
  return `csv:${String(line).padStart(4, ' ')}`;
}

/**
 * The refuse-to-emit gate: a message naming the count while any NBA/BAA venue
 * is blank, `null` when curation is complete. The caller exits non-zero on a
 * message — the missing data is an instrument that cannot pass, not a comment.
 */
export function refusalReport(rows: readonly VenueRow[], sourceName: string): string | null {
  const blanks = blankVenueRows(rows);
  if (blanks.length === 0) return null;
  const listing = blanks.map((row) => `  ${rowRef(sourceName, row.line)}: ${row.year}, ${row.teamA} vs ${row.teamB} (${row.league})`).join('\n');
  return (
    `venueBackfill refuses to emit: ${blanks.length} NBA/BAA row(s) carry a blank game7_home_team — ` +
    `the curation (spec-2-8 D1/D2) has not landed, so no migration was written.\n${listing}`
  );
}

/** Series identity as the migration resolves it: (year, unordered team pair) via abbreviations. */
export interface SeriesPair {
  year: number;
  teamA: string;
  teamB: string;
}

/**
 * Unordered-pair resolution — the identity `00014` made enforceable. `round`
 * is never consulted (17 era spellings; deliberately ungated since Story 2.2).
 */
export function pairMatches(curated: { year: number; teamA: string; teamB: string }, series: SeriesPair): boolean {
  if (curated.year !== series.year) return false;
  return (
    (curated.teamA === series.teamA && curated.teamB === series.teamB) ||
    (curated.teamA === series.teamB && curated.teamB === series.teamA)
  );
}

/** The three-case orientation decision (Design Notes) — case 3 is never a silent overwrite. */
export type OrientationDecision = 'keep' | 'swap' | 'conflict';

export function orientationDecision(storedHome: string, curatedHome: string, teamA: string): OrientationDecision {
  if (storedHome === curatedHome) return 'keep';
  if (storedHome === teamA) return 'swap';
  return 'conflict';
}

export interface VenueAssignment {
  row: VenueRow;
  /** The curated (or synthetic) Game-7 home abbreviation — always one of the row's slots. */
  home: string;
}

/**
 * The deterministic self-test assignment (spec D2): NBA/BAA rows in file
 * order, the first 117 keep (home = team_a), the last 43 swap (home = team_b).
 * It exists to prove the machinery — the emitted SQL is the identical
 * template, and the 117 census then holds by construction.
 */
export function syntheticAssignments(rows: readonly VenueRow[]): VenueAssignment[] {
  const nbaBaa = rows.filter(isNbaBaa);
  if (nbaBaa.length !== EXPECTED_NBA_BAA) {
    throw new VenueBackfillError(
      `self-test assignment needs exactly ${EXPECTED_NBA_BAA} NBA/BAA rows (the pinned archive population), got ${nbaBaa.length}`,
    );
  }
  return nbaBaa.map((row, index) => ({ row, home: index < SYNTHETIC_KEEP_COUNT ? row.teamA : row.teamB }));
}

/** Curated assignments for the real emission: every NBA/BAA row, blank or not. */
export function curatedAssignments(rows: readonly VenueRow[]): VenueAssignment[] {
  return rows.filter(isNbaBaa).map((row) => ({ row, home: row.home }));
}

function sqlQuote(value: string | number): string {
  return typeof value === 'number' ? String(value) : `'${value.replace(/'/g, "''")}'`;
}

function leagueValuesTuples(rows: readonly VenueRow[]): string {
  return rows.map((row) => `  (${row.year}, ${sqlQuote(row.teamA)}, ${sqlQuote(row.teamB)}, ${sqlQuote(row.league)})`).join(',\n');
}

function venueValuesTuples(venues: readonly VenueAssignment[]): string {
  return venues
    .map((v) => `  (${v.row.year}, ${sqlQuote(v.row.teamA)}, ${sqlQuote(v.row.teamB)}, ${sqlQuote(v.home)})`)
    .join(',\n');
}

/**
 * Render the whole migration. `selfTest` only changes the banner and the
 * provenance note — statement-for-statement the SQL is the same template the
 * curated CSV will emit, which is what makes the rehearsal evidence transfer.
 */
export function renderMigration(
  rows: readonly VenueRow[],
  venues: readonly VenueAssignment[],
  options: { selfTest: boolean },
): string {
  const banner = options.selfTest
    ? `-- SELF-TEST RENDERING — NOT FOR supabase/migrations/. Same template as the real
-- 00016, fed by the deterministic synthetic 117/43 assignment (spec-2-8 D2)
-- because the curated venues have not landed yet. Venue VALUES below are
-- synthetic; league VALUES are real. Applied only inside the throwaway
-- rehearsal container by scripts/rehearse-migration-00014.mjs.`
    : `-- Applies the one-time, owner-approved lift of the archive freeze for Game-7
-- venues of the NBA/BAA series (sprint-change-proposal-2026-10-01.md, Calls
-- 1-2-4). The 18 ABA game-7 rows and every games-1-6 row stay untouched.`;

  const nbaBaaCount = venues.length;
  return `-- =========================================================
-- Predict Game 7 — Archive league identity + Game 7 venue backfill
-- Migration 00016 (Story 2.8)
-- =========================================================
-- GENERATED FILE — owned by supabase/scripts/pipeline/venueBackfill.ts.
-- Do not hand-edit: regenerate with
--   node supabase/scripts/pipeline/venueBackfill.ts
-- and prove agreement with
--   node supabase/scripts/pipeline/venueBackfill.ts --check
-- Source: supabase/scripts/pipeline/data/game7_venues_curated.csv
-- (${rows.length} curated rows: ${nbaBaaCount} NBA/BAA venues + ${rows.length - nbaBaaCount} ABA rows, venue blank by scope).
${banner}

-- Ordered in exactly the spec'd sequence: league added nullable -> backfilled
-- -> SET NOT NULL -> DEFAULT 'NBA' -> CHECK. NOT NULL before the backfill
-- would strand the rows; the default after it keeps every one of the ${rows.length}
-- archived values coming from the curated file, not the default (Call 4: the
-- default serves rows the ongoing pipeline writes, and both shipped adapters
-- write NBA-only seasons).
--
-- Series resolution is (year, unordered team pair) through teams.abbreviation
-- — the identity 00014 made enforceable — never round (17 era spellings).
-- Game-7 rows only: every statement below names game_number = 7, and the
-- swap exchanges (home_team_id, away_team_id) together with
-- (home_score, away_score) in ONE UPDATE so winner-vs-score consistency
-- survives whatever orientation the row arrives in. winner_team_id (both
-- tables) is never written.
--
-- The guards use 00015:80-85's raise-to-abort style. Every one of them is
-- executed against a fixture archive of the real shape (178 series x 7 rows)
-- by scripts/rehearse-migration-00014.mjs, each with a tamper that makes it
-- fire — a guard that cannot fail is not a guard.

BEGIN;

-- The curated list, once per concern, so each guard reads one shape.
CREATE TEMP TABLE curated_league (year integer, team_a text, team_b text, league text) ON COMMIT DROP;
INSERT INTO curated_league (year, team_a, team_b, league) VALUES
${leagueValuesTuples(rows)};

CREATE TEMP TABLE curated_venue (year integer, team_a text, team_b text, game7_home text) ON COMMIT DROP;
INSERT INTO curated_venue (year, team_a, team_b, game7_home) VALUES
${venueValuesTuples(venues)};

ALTER TABLE public.series ADD COLUMN league text;

-- Guard league_row_match: every curated league row resolves to exactly one
-- stored series. Zero matches is a year/abbreviation typo; two is a
-- slot-swapped twin (00014's UNIQUE guards the pair as stored, not this).
DO $guard$
DECLARE
  v_row record;
  v_matches integer;
BEGIN
  FOR v_row IN SELECT c.year, c.team_a, c.team_b, c.league FROM curated_league c LOOP
    SELECT count(*) INTO v_matches
      FROM public.series s
      JOIN public.teams ta ON ta.id = s.team_a_id
      JOIN public.teams tb ON tb.id = s.team_b_id
     WHERE s.year = v_row.year
       AND ((ta.abbreviation = v_row.team_a AND tb.abbreviation = v_row.team_b)
         OR (ta.abbreviation = v_row.team_b AND tb.abbreviation = v_row.team_a));
    IF v_matches <> 1 THEN
      RAISE EXCEPTION '00016 guard league_row_match: curated league row (%, %, %) matches % series — expected exactly one',
        v_row.year, v_row.team_a, v_row.team_b, v_matches
        USING ERRCODE = '23514';
    END IF;
  END LOOP;
END
$guard$;

UPDATE public.series s
   SET league = c.league
  FROM curated_league c
  JOIN public.teams ta ON ta.abbreviation = c.team_a
  JOIN public.teams tb ON tb.abbreviation = c.team_b
 WHERE s.year = c.year
   AND ((s.team_a_id = ta.id AND s.team_b_id = tb.id)
     OR (s.team_a_id = tb.id AND s.team_b_id = ta.id));

-- Guard league_backfill_complete: the curated file covers every stored
-- series, so SET NOT NULL below cannot strand a row.
DO $guard$
DECLARE
  v_null integer;
  v_example record;
BEGIN
  SELECT count(*) INTO v_null FROM public.series WHERE league IS NULL;
  IF v_null <> 0 THEN
    SELECT s.year, ta.abbreviation AS a, tb.abbreviation AS b
      INTO v_example
      FROM public.series s
      JOIN public.teams ta ON ta.id = s.team_a_id
      JOIN public.teams tb ON tb.id = s.team_b_id
     WHERE s.league IS NULL
     LIMIT 1;
    RAISE EXCEPTION '00016 guard league_backfill_complete: % series row(s) left with NULL league (e.g. %, %, %) — the curated file does not cover the archive. Either curation is incomplete or the live archive grew after it was cut (spec-2-8 D5): re-measure the table, append the newer series to game7_venues_curated.csv and re-derive the pinned counts in the same commit. Relaxing this guard is not the route',
      v_null, v_example.year, v_example.a, v_example.b
      USING ERRCODE = '23514';
  END IF;
END
$guard$;

-- Guard aba_row_census: the pinned composition (18 ABA) holds, so a mis-keyed
-- league list cannot quietly resize the populations Story 2.5 counts against.
DO $guard$
DECLARE
  v_aba integer;
BEGIN
  SELECT count(*) INTO v_aba FROM public.series WHERE league = 'ABA';
  IF v_aba <> ${EXPECTED_ABA} THEN
    RAISE EXCEPTION '00016 guard aba_row_census: ABA series count is %, expected exactly ${EXPECTED_ABA} (epic-2-context pinned league composition 160 NBA/BAA + 18 ABA)', v_aba
      USING ERRCODE = '23514';
  END IF;
END
$guard$;

ALTER TABLE public.series ALTER COLUMN league SET NOT NULL;
ALTER TABLE public.series ALTER COLUMN league SET DEFAULT 'NBA';
ALTER TABLE public.series ADD CONSTRAINT series_league_check CHECK (league IN ('NBA', 'BAA', 'ABA'));

-- Guard venue_row_match: every curated venue row resolves to exactly one
-- series (the league loop above ran the same rule over the league list; this
-- one covers the venue list independently).
DO $guard$
DECLARE
  v_row record;
  v_matches integer;
BEGIN
  FOR v_row IN SELECT c.year, c.team_a, c.team_b, c.game7_home FROM curated_venue c LOOP
    SELECT count(*) INTO v_matches
      FROM public.series s
      JOIN public.teams ta ON ta.id = s.team_a_id
      JOIN public.teams tb ON tb.id = s.team_b_id
     WHERE s.year = v_row.year
       AND ((ta.abbreviation = v_row.team_a AND tb.abbreviation = v_row.team_b)
         OR (ta.abbreviation = v_row.team_b AND tb.abbreviation = v_row.team_a));
    IF v_matches <> 1 THEN
      RAISE EXCEPTION '00016 guard venue_row_match: curated venue row (%, %, %) matches % series — expected exactly one',
        v_row.year, v_row.team_a, v_row.team_b, v_matches
        USING ERRCODE = '23514';
    END IF;
  END LOOP;
END
$guard$;

-- Guard venue_coverage: every NBA/BAA series carries exactly one curated
-- Game-7 venue row. This is the migration-side echo of the generator's
-- refuse-to-emit gate: a blank venue hand-bypassed into a missing row fails
-- here too, naming the uncovered series rather than silently leaving it on
-- the winner-fiction orientation.
DO $guard$
DECLARE
  v_missing integer;
  v_example record;
BEGIN
  SELECT count(*) INTO v_missing
    FROM public.series s
   WHERE s.league IN ('NBA', 'BAA')
     AND NOT EXISTS (
       SELECT 1
         FROM curated_venue c
         JOIN public.teams ta ON ta.id = s.team_a_id
         JOIN public.teams tb ON tb.id = s.team_b_id
        WHERE c.year = s.year
          AND ((ta.abbreviation = c.team_a AND tb.abbreviation = c.team_b)
            OR (ta.abbreviation = c.team_b AND tb.abbreviation = c.team_a))
     );
  IF v_missing <> 0 THEN
    SELECT s.year, ta.abbreviation AS a, tb.abbreviation AS b
      INTO v_example
      FROM public.series s
      JOIN public.teams ta ON ta.id = s.team_a_id
      JOIN public.teams tb ON tb.id = s.team_b_id
     WHERE s.league IN ('NBA', 'BAA')
       AND NOT EXISTS (
         SELECT 1
           FROM curated_venue c
           JOIN public.teams tta ON tta.id = s.team_a_id
           JOIN public.teams ttb ON ttb.id = s.team_b_id
          WHERE c.year = s.year
            AND ((tta.abbreviation = c.team_a AND ttb.abbreviation = c.team_b)
              OR (tta.abbreviation = c.team_b AND ttb.abbreviation = c.team_a))
       )
     LIMIT 1;
    RAISE EXCEPTION '00016 guard venue_coverage: % NBA/BAA archived series have no curated Game-7 venue row (e.g. %, %, %) — curation is incomplete and hand-bypass is not a route. If these rows are newer than the curated file, the archive grew after it was cut (spec-2-8 D5): append them and re-derive the pinned counts in the same commit that changes this migration',
      v_missing, v_example.year, v_example.a, v_example.b
      USING ERRCODE = '23514';
  END IF;
END
$guard$;

-- Guard orientation_conflict — the three-case rule, checked before any
-- update so no row can be clobbered mid-transaction:
--   1. stored game-7 home = curated home  -> keep (no statement touches it);
--   2. stored game-7 home = team_a (the canonical 00007 state) -> swap below;
--   3. anything else -> abort naming the series. This is the 178th-series
--      protection: production measured home = team_a in 177 of 178 series,
--      so exactly one archived series may already carry a real venue, and a
--      curated list must never overwrite one silently.
DO $guard$
DECLARE
  v record;
BEGIN
  SELECT s.year AS year, ta.abbreviation AS a, tb.abbreviation AS b, th.abbreviation AS stored_home, ch.abbreviation AS curated_home
    INTO v
    FROM public.series s
    JOIN public.teams ta ON ta.id = s.team_a_id
    JOIN public.teams tb ON tb.id = s.team_b_id
    JOIN public.series_game_scores g ON g.series_id = s.id AND g.game_number = 7
    JOIN public.teams th ON th.id = g.home_team_id
    JOIN curated_venue c ON c.year = s.year
      AND ((c.team_a = ta.abbreviation AND c.team_b = tb.abbreviation)
        OR (c.team_a = tb.abbreviation AND c.team_b = ta.abbreviation))
    JOIN public.teams ch ON ch.abbreviation = c.game7_home
   WHERE s.league IN ('NBA', 'BAA')
     AND g.home_team_id <> ch.id
     AND g.home_team_id <> s.team_a_id
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION '00016 guard orientation_conflict: game 7 of series % (%) already carries home % — neither the canonical team_a side nor the curated %; refusing to overwrite a row that is neither state',
      v.year, v.a || ' vs ' || v.b, v.stored_home, v.curated_home
      USING ERRCODE = '23514';
  END IF;
END
$guard$;

-- The orientation fix. Only case-2 rows qualify: stored home is the
-- canonical team_a side AND the curated home is the team_b side. Teams and
-- scores exchange in ONE statement — Postgres evaluates every SET expression
-- against the pre-update row, so the exchange is atomic and winner_team_id
-- needs no touch (and gets none). ABA rows are excluded by the league
-- filter; no statement here or above touches game_number <> 7.
UPDATE public.series_game_scores g
   SET home_team_id = s.team_b_id,
       away_team_id = s.team_a_id,
       home_score = g.away_score,
       away_score = g.home_score
  FROM public.series s
  JOIN public.teams ta ON ta.id = s.team_a_id
  JOIN public.teams tb ON tb.id = s.team_b_id
  JOIN curated_venue c ON c.year = s.year
    AND ((c.team_a = ta.abbreviation AND c.team_b = tb.abbreviation)
      OR (c.team_a = tb.abbreviation AND c.team_b = ta.abbreviation))
 WHERE g.series_id = s.id
   AND g.game_number = 7
   AND s.league IN ('NBA', 'BAA')
   AND g.home_team_id = s.team_a_id
   AND c.game7_home = tb.abbreviation;

-- Guard game7_home_win_census — the curated list's own checksum: nba.com's
-- published 117-43 over exactly the NBA/BAA Game-7 population this backfill
-- covers. It asserts BOTH numbers it names (review pass 1, E6): the ${EXPECTED_NBA_BAA}-series
-- population first, then the 117 — the 117 is only meaningful over exactly
-- that set. A list with a single wrong row does not land on 117; a compensating
-- pair does, which is the residual risk the owner-run curation route (D1)
-- accepts. If this lands 116 or 118, Story 2.8 resolves WHICH in writing
-- (one mis-curated row vs. the published as-of date excluding the 2026
-- Finals) before the owner applies — relaxing or deleting this guard is not
-- an acceptable resolution.
DO $guard$
DECLARE
  v_home_wins integer;
  v_population integer;
BEGIN
  SELECT count(*) INTO v_home_wins
    FROM public.series_game_scores g
    JOIN public.series s ON s.id = g.series_id
   WHERE g.game_number = 7
     AND s.league IN ('NBA', 'BAA')
     AND g.home_score > g.away_score;
  SELECT count(*) INTO v_population FROM public.series WHERE league IN ('NBA', 'BAA');
  IF v_population <> ${EXPECTED_NBA_BAA} THEN
    RAISE EXCEPTION '00016 guard game7_home_win_census: NBA/BAA Game-7 population is %, expected exactly ${EXPECTED_NBA_BAA} (the published 117-43 is taken over exactly this set) — resolve in writing before applying, do not relax this guard',
      v_population
      USING ERRCODE = '23514';
  END IF;
  IF v_home_wins <> ${EXPECTED_GAME7_HOME_WINS} THEN
    RAISE EXCEPTION '00016 guard game7_home_win_census: Game-7 home wins over the NBA/BAA archive = % (population %), expected exactly ${EXPECTED_GAME7_HOME_WINS} — the published 117-43 covers the same 160 Game 7s; resolve the delta in writing before applying, do not relax this guard',
      v_home_wins, v_population
      USING ERRCODE = '23514';
  END IF;
END
$guard$;

-- Guard row_winner_consistency: for every game row (all ${rows.length * 7}),
-- winner_team_id is the higher-scoring side. The swap could not break this by
-- construction (scores travel with their teams), and this is what proves the
-- claim rather than asserting it — no migration has data-guarded before this
-- one, which is exactly why the rehearsal tampers it (spec I/O matrix).
DO $guard$
DECLARE
  v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
    FROM public.series_game_scores g
   WHERE g.winner_team_id IS DISTINCT FROM
     (CASE WHEN g.home_score > g.away_score THEN g.home_team_id ELSE g.away_team_id END);
  IF v_bad <> 0 THEN
    RAISE EXCEPTION '00016 guard row_winner_consistency: % game row(s) whose winner_team_id is not the higher-scoring side — AD-4 derivation must survive the data change intact. This drift predates 00016 (it scans games 1-6 and the ABA rows too): measure it against the live table before applying rather than assuming the backfill caused it', v_bad
      USING ERRCODE = '23514';
  END IF;
END
$guard$;

-- Guard series_winner_game7_consistency: every archived series'
-- winner_team_id still equals its game-7 winner (derived from game 7's
-- scores, never stored).
DO $guard$
DECLARE
  v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
    FROM public.series s
    JOIN public.series_game_scores g ON g.series_id = s.id AND g.game_number = 7
   WHERE s.winner_team_id IS NOT NULL
     AND s.winner_team_id IS DISTINCT FROM
       (CASE WHEN g.home_score > g.away_score THEN g.home_team_id ELSE g.away_team_id END);
  IF v_bad <> 0 THEN
    RAISE EXCEPTION '00016 guard series_winner_game7_consistency: % archived series whose winner_team_id is not their game-7 winner — AD-4 derivation must survive the data change intact. 00016 never writes winner_team_id, so a failure here is pre-existing drift: measure it before applying', v_bad
      USING ERRCODE = '23514';
  END IF;
END
$guard$;

COMMIT;
`;
}

/**
 * The fixture archive the rehearsal seeds: 178 series x 7 rows in the
 * pre-00016 state — home = team_a throughout (the 00007 orientation),
 * winner = team_a throughout (the series winner), games 1/2/5/7 home wins and
 * 3/4/6 away wins (the certified 3-3 + game 7), synthetic scores that satisfy
 * every 00005 CHECK. The shape is real; the venue VALUES are deliberately absent —
 * every row names `team_a` as home, which is the 00007 fiction `00016` exists to
 * correct. No committed derived file: it is rebuilt from the
 * CSV, so it cannot drift.
 */
export function renderFixtureSeed(rows: readonly VenueRow[]): string {
  return `-- SELF-TEST fixture archive (Story 2.8 rehearsal) — built from
-- game7_venues_curated.csv by supabase/scripts/pipeline/venueBackfill.ts
-- --self-test-fixture. 178 series x 7 rows in the pre-00016 state, replacing
-- the 00001 fixture rows the ordered replay left behind: 00016's guards are
-- census guards, and a guard census over 8 series is not the census.
-- Round is a literal string (NOT NULL, never a key — Story 2.2).

DELETE FROM public.series_game_scores;
DELETE FROM public.series;

INSERT INTO public.series (id, year, round, team_a_id, team_b_id, winner_team_id)
SELECT md5('pg7-2-8-fixture|' || c.year || '|' || c.team_a || '|' || c.team_b)::uuid,
       c.year,
       'Self-Test Fixture Archive',
       ta.id,
       tb.id,
       ta.id
  FROM (VALUES
${leagueValuesTuples(rows)}
  ) AS c (year, team_a, team_b, league)
  JOIN public.teams ta ON ta.abbreviation = c.team_a
  JOIN public.teams tb ON tb.abbreviation = c.team_b;

-- All seven games: home_team_id = team_a (the 00007 fiction), games 1/2/5/7
-- won by the home (team_a) side, 3/4/6 by the away side — a certified 3-3
-- before game 7, winner_team_id = the higher-scoring side on every row.
INSERT INTO public.series_game_scores
  (series_id, game_number, home_team_id, away_team_id, home_score, away_score, winner_team_id)
SELECT s.id,
       gs.game_number,
       s.team_a_id,
       s.team_b_id,
       CASE WHEN gs.game_number IN (1, 2, 5, 7) THEN 110 + gs.game_number ELSE 100 + gs.game_number END,
       CASE WHEN gs.game_number IN (1, 2, 5, 7) THEN 100 + gs.game_number ELSE 110 + gs.game_number END,
       CASE WHEN gs.game_number IN (1, 2, 5, 7) THEN s.team_a_id ELSE s.team_b_id END
  FROM public.series s
 CROSS JOIN (VALUES (1), (2), (3), (4), (5), (6), (7)) AS gs (game_number);
`;
}

/**
 * Normalize line endings to LF before any byte compare. `core.autocrlf=true`
 * on this machine checks committed files out as CRLF (review pass 1, E2):
 * without this, `--check` and the emit path's idempotence compare would go red
 * at line 1 on every fresh checkout even when the texts agree. `.gitattributes`
 * pins `eol=lf` for the migration and the curated CSV as the belt; this is
 * the braces — the compare is what must not care about the checkout's EOL.
 */
export function normalizeEol(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/** First 1-based line where two texts differ; null when byte-identical (after EOL normalization). */
export function firstDriftLine(committed: string, regenerated: string): number | null {
  const c = normalizeEol(committed);
  const r = normalizeEol(regenerated);
  if (c === r) return null;
  const a = c.split('\n');
  const b = r.split('\n');
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    if (a[i] !== b[i]) return i + 1;
  }
  return max + 1;
}

export interface CliResult {
  exitCode: number;
  messages: string[];
}

function parseFlags(argv: readonly string[]): Map<string, string | true> {
  const flags = new Map<string, string | true>();
  for (const arg of argv) {
    const eq = arg.indexOf('=');
    if (arg.startsWith('--') && eq !== -1) {
      flags.set(arg.slice(2, eq), arg.slice(eq + 1));
    } else if (arg.startsWith('--')) {
      flags.set(arg.slice(2), true);
    } else {
      throw new VenueBackfillError(`unrecognised argument "${arg}" — supported: --check, --worksheet, --csv=, --self-test-migration=, --self-test-fixture=`);
    }
  }
  return flags;
}

function refusePathInsideMigrations(path: string): string | null {
  const resolved = resolve(path).toLowerCase();
  const migrations = MIGRATIONS_DIR.toLowerCase();
  if (resolved.startsWith(migrations + '\\') || resolved.startsWith(migrations + '/')) {
    return `self-test output must never land in ${MIGRATIONS_DIR} (spec-2-8 D2: 00016 enters supabase/migrations/ only from the curated emit path)`;
  }
  return null;
}

/** The CLI body — exported for tests that drive a full run without spawning. */
export function runVenueBackfillCli(argv: readonly string[], io: { readFile?: (path: string) => string; writeFile?: (path: string, data: string) => void }): CliResult {
  const messages: string[] = [];
  const readFile = io.readFile ?? ((path: string) => readFileSync(path, 'utf8'));
  const writeFile = io.writeFile ?? ((path: string, data: string) => writeFileSync(path, data));
  const tryRead = (path: string): string | null => {
    try {
      return readFile(path);
    } catch {
      return null;
    }
  };
  try {
    const flags = parseFlags(argv);
    const unknown = [...flags.keys()].filter(
      (name) => !['check', 'csv', 'self-test-migration', 'self-test-fixture', 'worksheet'].includes(name),
    );
    if (unknown.length > 0) {
      throw new VenueBackfillError(`unrecognised argument(s): ${unknown.join(', ')} — supported: --check, --worksheet, --csv=, --self-test-migration=, --self-test-fixture=`);
    }
    // A bare value flag used to parse to `true`, miss the string test below and
    // silently fall back to the default path (pass 3, P3-6).
    for (const name of ['csv', 'self-test-migration', 'self-test-fixture']) {
      if (flags.get(name) === true) {
        throw new VenueBackfillError(`--${name} requires a value: write --${name}=<path> — a bare --${name} would silently fall back to a default`);
      }
    }
    const csvPath = typeof flags.get('csv') === 'string' ? (flags.get('csv') as string) : CURATED_CSV_PATH;
    const rows = parseVenuesCsv(readFile(csvPath), csvPath);

    // The hand-entry worksheet (D6) is deliberately reachable while blanks stand
    // — that is exactly when it is needed — and writes nothing.
    if (flags.get('worksheet') !== undefined) {
      if (flags.get('check') !== undefined || flags.get('self-test-migration') !== undefined || flags.get('self-test-fixture') !== undefined) {
        throw new VenueBackfillError('--worksheet is a read-only report; do not combine it with --check or --self-test-*');
      }
      const blanks = blankVenueRows(rows);
      messages.push(
        blanks.length === 0 ? `${csvPath}: no NBA/BAA row is blank — nothing to hand-enter` : renderWorksheet(rows),
      );
      return { exitCode: 0, messages };
    }

    const selfMigration = flags.get('self-test-migration');
    const selfFixture = flags.get('self-test-fixture');
    if (selfMigration !== undefined || selfFixture !== undefined) {
      if (typeof selfMigration !== 'string' || typeof selfFixture !== 'string') {
        throw new VenueBackfillError('the self-test path needs BOTH --self-test-migration=<path> and --self-test-fixture=<path>');
      }
      if (flags.get('check') !== undefined) {
        throw new VenueBackfillError('--check and --self-test-* are different contracts; do not combine them');
      }
      for (const path of [selfMigration, selfFixture]) {
        const refusal = refusePathInsideMigrations(path);
        if (refusal) throw new VenueBackfillError(refusal);
      }
      const venues = syntheticAssignments(rows);
      const keepCount = venues.filter((v) => v.home === v.row.teamA).length;
      const swapCount = venues.length - keepCount;
      writeFile(selfMigration, renderMigration(rows, venues, { selfTest: true }));
      writeFile(selfFixture, renderFixtureSeed(rows));
      messages.push(
        `SELF-TEST generated (spec-2-8 D2): synthetic venues ${keepCount} keep (home = team_a) / ${swapCount} swap (home = team_b) — venue values are SYNTHETIC, not curated`,
        `SELF-TEST wrote migration rendering to ${selfMigration}`,
        `SELF-TEST wrote fixture archive seed to ${selfFixture}`,
      );
      return { exitCode: 0, messages };
    }

    const refusal = refusalReport(rows, csvPath);
    if (refusal !== null) {
      messages.push(refusal, 'no migration written — the blanks listed above are the blocker (spec-2-8 D2). If 00016 already exists on disk it is now stale against this CSV, and --check will say so.');
      return { exitCode: 2, messages };
    }

    const target = join(MIGRATIONS_DIR, MIGRATION_FILENAME);
    const rendered = renderMigration(rows, curatedAssignments(rows), { selfTest: false });
    if (flags.get('check') !== undefined) {
      if (tryRead(target) === null) {
        throw new VenueBackfillError(
          `--check: ${target} does not exist — the curated CSV is complete, so the next run without --check is the one that emits it`,
        );
      }
      const drift = firstDriftLine(readFile(target), rendered);
      if (drift !== null) {
        throw new VenueBackfillError(
          `--check FAILED: ${MIGRATION_FILENAME} and ${csvPath} disagree at line ${drift} of the committed migration — one is hand-edited; regenerate (owner decision 2026-10-01: the generator owns the single copy)`,
        );
      }
      messages.push(`--check ok: ${MIGRATION_FILENAME} matches this generator's output for ${csvPath} (EOL-normalized byte compare)`);
      return { exitCode: 0, messages };
    }

    const existing = tryRead(target);
    if (existing !== null && normalizeEol(existing) === rendered) {
      messages.push(`${MIGRATION_FILENAME} already matches the curated CSV — nothing written`);
      return { exitCode: 0, messages };
    }
    writeFile(target, rendered);
    messages.push(`wrote ${target} from ${rows.length} curated rows — this file and the rehearsal's COVERED_THROUGH ceiling share a commit (Story 2.8 D5)`);
    return { exitCode: 0, messages };
  } catch (error) {
    return { exitCode: 2, messages: [...messages, `venueBackfill failed: ${error instanceof Error ? error.message : String(error)}`] };
  }
}

// Only auto-run when executed as the entry script, the same way run.ts does;
// importing this module (tests, the rehearsal harness) has no side effects.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = runVenueBackfillCli(process.argv.slice(2), {});
  for (const message of result.messages) {
    if (result.exitCode === 0) console.log(message);
    else console.error(message);
  }
  process.exitCode = result.exitCode;
}
