/**
 * Story 2.3, Decision 3 — the `manual_csv` adapter: the floor that works
 * regardless of what Story 2.1's spike concludes.
 *
 * Format: long-format CSV, one row per game, committed at
 * `supabase/scripts/pipeline/data/series_manual.csv`. Columns:
 *
 *   year, round, game_number, home_team, away_team, home_score, away_score
 *
 * Teams are referenced by `teams.abbreviation` (UNIQUE) and resolved to
 * `teams.id` through the lookup the runner supplies — an abbreviation the
 * `teams` table does not hold fails the plan, naming the abbreviation and the
 * row. `#` lines are comments; the first non-comment line is the header.
 *
 * The adapter never stores a winner: every game is decided by its scores (a
 * tie is rejected, naming the row), the series slots follow the archive
 * convention (team_a = game 1's home team), and a series' winner is game 7's
 * winner when a game-7 row exists. Completing a series is therefore literally
 * "append one line" — the operator cadence Story 2.6 documents.
 */
import type { AdapterDeps, GameScoreRow, SeriesDataSource, SeriesStatusRow } from '../port.ts';

export class ManualCsvError extends Error {}

const REQUIRED_COLUMNS = ['year', 'round', 'game_number', 'home_team', 'away_team', 'home_score', 'away_score'];

const INTEGER_PATTERN = /^\d+$/;

interface ParsedRow {
  line: number;
  year: number;
  round: string;
  gameNumber: number;
  homeAbbr: string;
  awayAbbr: string;
  homeId: number;
  awayId: number;
  homeScore: number;
  awayScore: number;
}

interface SeriesAccumulator {
  year: number;
  round: string;
  label: string;
  firstLine: number;
  rows: ParsedRow[];
}

function rowRef(sourceName: string, line: number): string {
  return `${sourceName}:${line}`;
}

function parseIntegerField(value: string, column: string, ref: string): number {
  if (!INTEGER_PATTERN.test(value)) {
    throw new ManualCsvError(`${ref}: "${column}" must be a non-negative integer, got "${value}"`);
  }
  return Number(value);
}

function splitCsvLine(line: string, ref: string): string[] {
  const fields = line.split(',').map((field) => field.trim());
  if (fields.length !== REQUIRED_COLUMNS.length) {
    throw new ManualCsvError(
      `${ref}: expected ${REQUIRED_COLUMNS.length} columns (${REQUIRED_COLUMNS.join(', ')}), got ${fields.length}: "${line}"`,
    );
  }
  return fields;
}

/**
 * Read and validate the CSV into port rows, resolving team abbreviations to
 * `teams.id` via the supplied lookup. Throws `ManualCsvError` naming the
 * offending row (source + line number) for any malformed input.
 */
export function parseManualCsv(
  csvText: string,
  sourceName: string,
  teamIdByAbbreviation: (abbreviation: string) => number | undefined,
): { statuses: SeriesStatusRow[]; scores: GameScoreRow[] } {
  const groups = new Map<string, SeriesAccumulator>();
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
        throw new ManualCsvError(
          `${rowRef(sourceName, lineNo)}: header column "${header[mismatch]}" should be "${REQUIRED_COLUMNS[mismatch]}" — ` +
            `expected exactly ${REQUIRED_COLUMNS.join(', ')}`,
        );
      }
      headerSeen = true;
      continue;
    }

    const ref = rowRef(sourceName, lineNo);
    const [yearText, round, gameText, homeAbbr, awayAbbr, homeText, awayText] = splitCsvLine(line, ref);
    if (round === '') {
      throw new ManualCsvError(`${ref}: "round" is empty`);
    }
    const year = parseIntegerField(yearText, 'year', ref);
    const gameNumber = parseIntegerField(gameText, 'game_number', ref);
    const homeScore = parseIntegerField(homeText, 'home_score', ref);
    const awayScore = parseIntegerField(awayText, 'away_score', ref);
    if (gameNumber < 1 || gameNumber > 7) {
      throw new ManualCsvError(`${ref}: game_number ${gameNumber} is outside 1..7`);
    }
    if (homeAbbr === awayAbbr) {
      throw new ManualCsvError(`${ref}: a team cannot play itself (${homeAbbr} vs ${awayAbbr})`);
    }
    if (homeScore === awayScore) {
      throw new ManualCsvError(
        `${ref}: tie score ${homeScore}-${awayScore} — every source game must be final and decided`,
      );
    }

    const homeId = teamIdByAbbreviation(homeAbbr);
    if (homeId === undefined) {
      throw new ManualCsvError(`${ref}: unknown team abbreviation "${homeAbbr}" — not in the teams table`);
    }
    const awayId = teamIdByAbbreviation(awayAbbr);
    if (awayId === undefined) {
      throw new ManualCsvError(`${ref}: unknown team abbreviation "${awayAbbr}" — not in the teams table`);
    }

    const row: ParsedRow = { line: lineNo, year, round, gameNumber, homeAbbr, awayAbbr, homeId, awayId, homeScore, awayScore };

    // Group by (year, unordered team pair) — the identity AD-5 keys on, with
    // slot order fixed per series by the game-1 row below.
    const key = `${year}|${Math.min(homeId, awayId)}|${Math.max(homeId, awayId)}`;
    let accumulator = groups.get(key);
    if (!accumulator) {
      accumulator = { year, round, label: `${year} ${round} ${homeAbbr} vs ${awayAbbr}`, firstLine: lineNo, rows: [] };
      groups.set(key, accumulator);
    }
    if (accumulator.round !== round) {
      throw new ManualCsvError(
        `${ref}: series ${accumulator.label} already carries round "${accumulator.round}" — one round label per series`,
      );
    }
    if (accumulator.rows.some((existing) => existing.gameNumber === gameNumber)) {
      throw new ManualCsvError(`${ref}: duplicate game_number ${gameNumber} for series ${accumulator.label}`);
    }
    accumulator.rows.push(row);
  }

  if (!headerSeen) {
    throw new ManualCsvError(`${sourceName}: no header row found — expected ${REQUIRED_COLUMNS.join(',')}`);
  }

  const statuses: SeriesStatusRow[] = [];
  const scores: GameScoreRow[] = [];
  for (const accumulator of groups.values()) {
    const gameOne = accumulator.rows.find((row) => row.gameNumber === 1);
    if (!gameOne) {
      throw new ManualCsvError(
        `series ${accumulator.label} (first row ${rowRef(sourceName, accumulator.firstLine)}) has no game 1 row — ` +
          'team slots come from game 1 (team_a = game 1 home team, AD-5)',
      );
    }
    const teamAId = gameOne.homeId;
    const teamBId = gameOne.awayId;

    const gameRows: GameScoreRow[] = accumulator.rows
      .map((row) => ({
        year: row.year,
        team_a_id: teamAId,
        team_b_id: teamBId,
        game_number: row.gameNumber,
        home_team_id: row.homeId,
        away_team_id: row.awayId,
        home_score: row.homeScore,
        away_score: row.awayScore,
      }))
      .sort((left, right) => left.game_number - right.game_number);

    const gameSeven = gameRows.find((game) => game.game_number === 7);
    statuses.push({
      year: accumulator.year,
      round: accumulator.round,
      team_a_id: teamAId,
      team_b_id: teamBId,
      winner_team_id: gameSeven ? (gameSeven.home_score > gameSeven.away_score ? gameSeven.home_team_id : gameSeven.away_team_id) : null,
    });
    scores.push(...gameRows);
  }

  return { statuses, scores };
}

/** The registry factory: eager read + validate, so a bad CSV fails the run before any write. */
export function createManualCsvAdapter(deps: AdapterDeps): SeriesDataSource {
  const text = deps.readFile(deps.csvPath);
  const parsed = parseManualCsv(text, deps.csvPath, deps.teamIdByAbbreviation);
  return {
    async fetch_series_statuses() {
      return parsed.statuses;
    },
    async fetch_game_scores() {
      return parsed.scores;
    },
  };
}
