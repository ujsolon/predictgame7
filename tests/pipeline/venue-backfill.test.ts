// Story 2.8 — the venue-backfill generator: curated-CSV parsing, the
// refuse-to-emit gate, the three-case orientation rule, the deterministic
// self-test assignment, and the CSV ↔ migration --check contract.
// Pure-function tests (no Docker, no network, no database): the throwaway
// rehearsal (scripts/rehearse-migration-00014.mjs section 5) is what proves
// the emitted SQL itself.
//
// Loopback pass 1 (E5/VG-4): expectations about the COMMITTED file are derived
// from blankVenueRows(...) — the same instrument the gate is — so this suite
// inverts itself at curation instead of turning `npm test` red the moment the
// owner's venues land. scripts/** is checked by none of the four gate steps,
// so the `node --check` smoke and the seed-abbreviation pin below exist to
// close part of that gap from inside the gate.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CURATED_CSV_PATH,
  EXPECTED_GAME7_HOME_WINS,
  EXPECTED_TEAM_COUNT,
  FEED_ALIASES_CSV_PATH,
  LEAGUES,
  MIGRATION_FILENAME,
  SEASON_OUTCOME_MEANING,
  type VenueRow,
  VenueBackfillError,
  blankVenueRows,
  classifySeason,
  curatedAssignments,
  firstDriftLine,
  matchSeasonFeedSeries,
  normalizeEol,
  orientationDecision,
  pairMatches,
  parseFeedAliases,
  parseTeamsSeed,
  parseVenuesCsv,
  refusalReport,
  renderFixtureSeed,
  renderMigration,
  renderWorksheet,
  resolveFeedCode,
  runVenueBackfillCli,
  syntheticAssignments,
} from '../../supabase/scripts/pipeline/venueBackfill.ts';

const TEAMS_SEED_TEXT =
  readFileSync(new URL('../../supabase/migrations/00005_release_1_data_model.sql', import.meta.url), 'utf8') +
  readFileSync(new URL('../../supabase/migrations/00007_backfill_missing_historical_series.sql', import.meta.url), 'utf8');

const HEADER = 'year,team_a,team_b,league,game7_home_team';

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join('\n');
}

function fullAssignments(count: number): string {
  // 160 NBA/BAA rows need not be the real archive rows for the assignment
  // rule: the generator only counts them and splits them in file order.
  return csv(...Array.from({ length: count }, (_, i) => `${1900 + i},BOS,CHI,NBA,`));
}

// The committed file's CURRENT state, read through the same instrument the
// refuse-to-emit gate is. Every test that speaks about "this session" branches
// on this count, so the suite inverts itself at curation instead of turning
// `npm test` red the moment the owner's venues land (loopback pass 1, E5/VG-4).
const committedRows = parseVenuesCsv(readFileSync(CURATED_CSV_PATH, 'utf8'), 'game7_venues_curated.csv');
const committedBlanks = blankVenueRows(committedRows);

describe('parseVenuesCsv — the curated row shape', () => {
  it('reads the five columns, keeping the blank venue as an empty string', () => {
    const rows = parseVenuesCsv(csv('2016,CLE,GSW,NBA,CLE', '1970,IND,LOS,ABA,'), 'curated.csv');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ line: 2, year: 2016, teamA: 'CLE', teamB: 'GSW', league: 'NBA', home: 'CLE' });
    expect(rows[1]).toMatchObject({ line: 3, league: 'ABA', home: '' });
  });

  it('treats # lines and blank lines as comments, like the manualCsv convention', () => {
    const text = `# provenance\n\n${HEADER}\n# another comment\n2016,CLE,GSW,NBA,\n`;
    const rows = parseVenuesCsv(text, 'curated.csv');
    expect(rows).toHaveLength(1);
    expect(rows[0].line).toBe(5);
  });

  it('rejects a wrong column count, a wrong header, and a malformed field — each naming the row', () => {
    expect(() => parseVenuesCsv('2016,CLE,GSW,NBA\n', 'c.csv')).toThrowError(/c\.csv:1: expected 5 columns/s);
    expect(() => parseVenuesCsv('year,team_a,team_b,league,home\n2016,CLE,GSW,NBA,\n', 'c.csv')).toThrowError(
      /c\.csv:1: header column "home" should be "game7_home_team"/,
    );
    expect(() => parseVenuesCsv(csv('TWENTY,CLE,GSW,NBA,'), 'c.csv')).toThrowError(/"year" must be a non-negative integer/);
    expect(() => parseVenuesCsv(csv('2016,CLE,GS,NBA,'), 'c.csv')).toThrowError(/"team_b" must be a three-letter teams\.abbreviation/);
    expect(() => parseVenuesCsv(csv('2016,CLE,CLE,NBA,'), 'c.csv')).toThrowError(/cannot pair a team with itself/);
  });

  it('keeps league to the three values 00016 CHECKs', () => {
    expect(LEAGUES).toEqual(['NBA', 'BAA', 'ABA']);
    expect(() => parseVenuesCsv(csv('2016,CLE,GSW,ABL,'), 'c.csv')).toThrowError(/"league" must be one of NBA\/BAA\/ABA/);
  });

  it('rejects a curated home that is neither slot of its own row', () => {
    expect(() => parseVenuesCsv(csv('2016,CLE,GSW,NBA,LAL'), 'c.csv')).toThrowError(
      /"game7_home_team" "LAL" is neither team_a "CLE" nor team_b "GSW"/,
    );
  });

  it('rejects a filled ABA venue — the 18 ABA rows are out of scope and blank is their legal shape', () => {
    expect(() => parseVenuesCsv(csv('1970,IND,LOS,ABA,IND'), 'c.csv')).toThrowError(/out of venue scope \(Call 2\)/);
  });

  it('rejects two rows resolving to the same (year, unordered team pair) — including a slot-reversed twin', () => {
    expect(() => parseVenuesCsv(csv('2016,CLE,GSW,NBA,', '2016,GSW,CLE,NBA,'), 'c.csv')).toThrowError(VenueBackfillError);
    expect(() => parseVenuesCsv(csv('2016,CLE,GSW,NBA,', '2016,GSW,CLE,NBA,'), 'c.csv')).toThrowError(
      /same \(year, unordered team pair\) as c\.csv:2/,
    );
  });
});

describe('the committed curated file', () => {
  const rows = committedRows;

  it('carries one row per archived series: 178 total, 160 NBA/BAA, 18 ABA, 1 BAA', () => {
    expect(rows).toHaveLength(178);
    expect(rows.filter((r) => r.league === 'NBA')).toHaveLength(159);
    expect(rows.filter((r) => r.league === 'BAA')).toHaveLength(1);
    expect(rows.filter((r) => r.league === 'ABA')).toHaveLength(18);
    // The ABA blanks are a permanent rule (Call 2); the NBA/BAA blanks are
    // this session's state and NOT asserted here — the refusal gate is the
    // instrument for that, tested below with fixtures and run live via the
    // CLI in a state-neutral form that INVERTS at curation (E5).
    expect(rows.filter((r) => r.league === 'ABA' && r.home !== '')).toHaveLength(0);
  });

  it('resolves every row to a distinct (year, unordered team pair) — the identity the migration joins on', () => {
    const keys = rows.map((r) => `${r.year}|${[r.teamA, r.teamB].sort().join('|')}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  // Pass-4 review (verification-gap): the 117 checksum ran only inside 00016's
  // frozen guard and the manual Docker rehearsal — flipping a curated venue kept
  // all four gate steps green. This is the in-gate pin.
  it(`holds the ${EXPECTED_GAME7_HOME_WINS} Game-7 home-win checksum the 00016 guard pins`, () => {
    expect(curatedAssignments(committedRows).filter((v) => v.home === v.row.teamA)).toHaveLength(EXPECTED_GAME7_HOME_WINS);
  });
});

describe('the committed CSV against the teams seed 00016 joins on (E5)', () => {
  // The migration resolves every curated row through teams.abbreviation, and
  // the probe reads the same 59-team seed of 00005 + 00007. Nothing else pins an
  // abbreviation typo introduced at curation before the Docker rehearsal — and
  // no gate step runs the Docker rehearsal. The reader is `parseTeamsSeed`
  // itself (pass 2, P2-12): the probe calls the same function, so this test
  // verifies the probe's instrument rather than a copy of it.
  const seedText =
    readFileSync(new URL('../../supabase/migrations/00005_release_1_data_model.sql', import.meta.url), 'utf8') +
    readFileSync(new URL('../../supabase/migrations/00007_backfill_missing_historical_series.sql', import.meta.url), 'utf8');
  const seeded = parseTeamsSeed(seedText, '00005 + 00007 teams seed');

  it('the seed parse holds the 59 abbreviations the archive covers', () => {
    expect(seeded.size).toBe(EXPECTED_TEAM_COUNT);
  });

  it('a partial seed is refused by name, not silently mapped', () => {
    expect(() => parseTeamsSeed("INSERT INTO teams VALUES (1, 'Boston Celtics', 'BOS', NULL);", 'fixture.sql')).toThrowError(
      /found 1 abbreviations, expected exactly 59/,
    );
  });

  it('a duplicated abbreviation aborts instead of folding first-wins (P3-5)', () => {
    const doubled =
      "INSERT INTO teams VALUES (1, 'Boston Celtics', 'BOS', NULL);\n" +
      "INSERT INTO teams VALUES (2, 'Buffalo Braves', 'BOS', NULL);";
    expect(() => parseTeamsSeed(doubled, 'fixture.sql')).toThrowError(/holds abbreviation "BOS" twice \(ids 1 and 2\)/);
  });

  it('every curated abbreviation (slots and curated homes alike) resolves in the seed', () => {
    const missing: string[] = [];
    for (const row of committedRows) {
      for (const abbr of [row.teamA, row.teamB, row.home]) {
        if (abbr !== '' && !seeded.has(abbr)) missing.push(`${CURATED_CSV_PATH}:${row.line} ${abbr}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('the refuse-to-emit gate (spec-2-8 D2)', () => {
  it('names the count while any NBA/BAA venue is blank — the gap is an instrument, not a comment', () => {
    const rows = parseVenuesCsv(csv('2016,CLE,GSW,NBA,', '2017,GSW,CLE,NBA,', '1970,IND,LOS,ABA,'), 'c.csv');
    const report = refusalReport(rows, 'c.csv');
    expect(report).not.toBeNull();
    expect(report).toContain('refuses to emit: 2 NBA/BAA row(s) carry a blank game7_home_team');
    expect(report).toContain('c.csv:2');
    expect(report).toContain('c.csv:3');
  });

  it('goes quiet (null) once every NBA/BAA venue is curated — and the 18 ABA blanks never count', () => {
    const rows = parseVenuesCsv(csv('2016,CLE,GSW,NBA,CLE', '1970,IND,LOS,ABA,'), 'c.csv');
    expect(refusalReport(rows, 'c.csv')).toBeNull();
    expect(blankVenueRows(rows)).toHaveLength(0);
  });

  it('the committed file is refused or accepted strictly by its blank count — the suite inverts at curation (E5)', () => {
    const written: string[] = [];
    const result = runVenueBackfillCli([], {
      readFile: (path) => readFileSync(path, 'utf8'),
      writeFile: (path) => {
        written.push(path);
      },
    });
    const messages = result.messages.join('\n');
    if (committedBlanks.length > 0) {
      // This session's state: the data gap is an instrument that cannot pass.
      expect(result.exitCode).toBe(2);
      expect(messages).toContain(`refuses to emit: ${committedBlanks.length} NBA/BAA row(s)`);
      expect(written).toEqual([]);
    } else {
      // Curation landed: the emit path must run clean and target the real
      // migrations path with exactly the curated render (or find it there).
      expect(result.exitCode).toBe(0);
      expect(messages).toContain('00016');
      if (written.length > 0) {
        expect(written).toHaveLength(1);
        expect([...written][0].replace(/\\/g, '/')).toContain('/supabase/migrations/');
      }
    }
  });
});

describe('pair resolution and the three-case orientation rule', () => {
  it('matches the unordered team pair at the right year, in either slot order, never on round', () => {
    const curated = { year: 2016, teamA: 'CLE', teamB: 'GSW' };
    expect(pairMatches(curated, { year: 2016, teamA: 'CLE', teamB: 'GSW' })).toBe(true);
    expect(pairMatches(curated, { year: 2016, teamA: 'GSW', teamB: 'CLE' })).toBe(true);
    expect(pairMatches(curated, { year: 2017, teamA: 'CLE', teamB: 'GSW' })).toBe(false);
    expect(pairMatches(curated, { year: 2016, teamA: 'CLE', teamB: 'OKC' })).toBe(false);
  });

  it('keep / swap / conflict — case 3 never overwrites silently (the 178th-series protection)', () => {
    expect(orientationDecision('CLE', 'CLE', 'CLE')).toBe('keep');
    expect(orientationDecision('CLE', 'GSW', 'CLE')).toBe('swap');
    expect(orientationDecision('GSW', 'GSW', 'CLE')).toBe('keep');
    // stored home is neither the canonical team_a state nor the curated value:
    expect(orientationDecision('GSW', 'CLE', 'CLE')).toBe('conflict');
  });
});

describe('the deterministic self-test assignment (spec-2-8 D2)', () => {
  it('splits the first 117 NBA/BAA rows to keep and the last 43 to swap, deterministically', () => {
    const rows = parseVenuesCsv(fullAssignments(160), 'c.csv');
    const venues = syntheticAssignments(rows);
    expect(venues).toHaveLength(160);
    expect(venues.filter((v) => v.home === v.row.teamA)).toHaveLength(117);
    expect(venues.filter((v) => v.home === v.row.teamB)).toHaveLength(43);
    expect(venues.map((v) => v.home)).toEqual(syntheticAssignments(rows).map((v) => v.home));
    // ABA rows carry no venue assignment at all — their game-7 rows stay archived.
    expect(venues.some((v) => v.row.league === 'ABA')).toBe(false);
  });

  it('refuses a population that is not the pinned 160 — the self-test census depends on it', () => {
    expect(() => syntheticAssignments(parseVenuesCsv(fullAssignments(159), 'c.csv'))).toThrowError(
      /exactly 160 NBA\/BAA rows .* got 159/,
    );
  });

  it('the curated assignment mode takes every NBA/BAA row with its real venue', () => {
    const rows = parseVenuesCsv(csv('2016,CLE,GSW,NBA,GSW', '1970,IND,LOS,ABA,'), 'c.csv');
    expect(curatedAssignments(rows)).toEqual([{ row: rows[0], home: 'GSW' }]);
  });
});

describe('renderMigration — the single emitted copy of 00016', () => {
  const rows = parseVenuesCsv(fullAssignments(160) + '\n1970,IND,LOS,ABA,\n1971,IND,LOS,ABA,', 'c.csv');
  // (fullAssignments has no ABA rows; add two so the render exercises both lists.)
  const venues = syntheticAssignments(rows);
  const text = renderMigration(rows, venues, { selfTest: true });

  it('applies the schema sequence in the order the spec freezes: add → backfill → NOT NULL → DEFAULT → CHECK', () => {
    const at = (needle: string) => text.indexOf(needle);
    expect(at('ALTER TABLE public.series ADD COLUMN league text')).toBeGreaterThanOrEqual(0);
    expect(at('SET league = c.league')).toBeGreaterThan(at('ADD COLUMN league text'));
    expect(at('ALTER COLUMN league SET NOT NULL')).toBeGreaterThan(at('SET league = c.league'));
    expect(at("ALTER COLUMN league SET DEFAULT 'NBA'")).toBeGreaterThan(at('ALTER COLUMN league SET NOT NULL'));
    expect(at("ADD CONSTRAINT series_league_check CHECK (league IN ('NBA', 'BAA', 'ABA'))")).toBeGreaterThan(
      at("ALTER COLUMN league SET DEFAULT 'NBA'"),
    );
  });

  it('carries every guard the rehearsal tampers, named for its message', () => {
    for (const guard of [
      'league_row_match',
      'league_backfill_complete',
      'aba_row_census',
      'venue_row_match',
      'venue_coverage',
      'orientation_conflict',
      'game7_home_win_census',
      'row_winner_consistency',
      'series_winner_game7_consistency',
    ]) {
      expect(text).toContain(`00016 guard ${guard}`);
    }
  });

  it('ships no dead code, and its census guard ASSERTS the population it names (E6)', () => {
    // The unused `v_found` would have been inherited by every future reader
    // of 00016; the 117 only means nba.com's 117-43 over exactly 160 NBA/BAA
    // Game 7s, so the population gets its own raise, not an interpolation.
    expect(text).not.toContain('v_found');
    expect(text).toMatch(
      /IF v_population <> 160 THEN\s+RAISE EXCEPTION '00016 guard game7_home_win_census: NBA\/BAA Game-7 population is %/,
    );
    expect(text).toContain('Game-7 home wins over the NBA/BAA archive = % (population %), expected exactly 117');
  });

  it('never touches a non-game-7 row and never writes winner_team_id', () => {
    // Comments say the opposite to explain the rule; the CODE must not.
    const code = text
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');
    expect(code).not.toContain('game_number <> 7');
    for (const statement of code.split(';')) {
      if (statement.includes('UPDATE public.series_game_scores')) {
        expect(statement).toContain('g.game_number = 7');
      }
    }
    expect(code).not.toMatch(/\bSET\b[^;]{0,300}?winner_team_id\s*=/);
    expect(code).not.toContain('series.status');
  });

  it('embeds one league tuple per curated row and one venue tuple per NBA/BAA row', () => {
    const leagueSection = text.slice(text.indexOf('INSERT INTO curated_league'), text.indexOf('INSERT INTO curated_venue'));
    const venueSection = text.slice(
      text.indexOf('INSERT INTO curated_venue'),
      text.indexOf('ALTER TABLE public.series ADD COLUMN'),
    );
    expect(leagueSection.match(/^ {2}\(\d+, '[A-Z]{3}', '[A-Z]{3}', '(?:NBA|BAA|ABA)'\)[,;]$/gm)).toHaveLength(rows.length);
    expect(venueSection.match(/^ {2}\(\d+, '[A-Z]{3}', '[A-Z]{3}', '[A-Z]{3}'\)[,;]$/gm)).toHaveLength(venues.length);
  });

  it('is byte-stable across renders (the --check contract needs determinism)', () => {
    expect(renderMigration(rows, syntheticAssignments(rows), { selfTest: true })).toBe(text);
  });

  it('banners the self-test rendering so a temp copy can never read as the real migration', () => {
    expect(text).toContain('SELF-TEST RENDERING — NOT FOR supabase/migrations/');
    expect(renderMigration(rows, venues, { selfTest: false })).not.toContain('SELF-TEST RENDERING');
  });
});

describe('renderFixtureSeed — the 178 x 7 fixture the guards need', () => {
  const rows = parseVenuesCsv(fullAssignments(160) + '\n1970,IND,LOS,ABA,', 'c.csv');
  const seed = renderFixtureSeed(rows);

  it('clears scores before series (the FK direction) and re-seeds the full archive shape', () => {
    // 'DELETE FROM public.series;' with the semicolon: the bare text is also a
    // prefix of the scores DELETE, and an index compare that matches both is 430 < 430.
    expect(seed.indexOf('DELETE FROM public.series_game_scores')).toBeLessThan(seed.indexOf('DELETE FROM public.series;'));
    expect(seed.match(/^ {2}\(\d{4}, '/gm)).toHaveLength(rows.length);
    expect(seed).toContain('CROSS JOIN (VALUES (1), (2), (3), (4), (5), (6), (7))');
    expect(seed).toContain('SELF-TEST fixture archive');
  });
});

describe('firstDriftLine and the --check contract', () => {
  it('returns null on byte agreement and the first differing line otherwise', () => {
    expect(firstDriftLine('a\nb\nc', 'a\nb\nc')).toBeNull();
    expect(firstDriftLine('a\nb\nc', 'a\nX\nc')).toBe(2);
    expect(firstDriftLine('a\nb', 'a\nb\nc')).toBe(3);
  });

  it('--check on a complete CSV without an emitted migration exits non-zero naming the missing file', () => {
    const complete = csv('2016,CLE,GSW,NBA,CLE', '2017,GSW,CLE,NBA,CLE');
    const result = runVenueBackfillCli(['--check', '--csv=c.csv'], {
      readFile: (path) => {
        if (path === 'c.csv') return complete;
        throw new Error(`no such file: ${path}`);
      },
      writeFile: () => {
        throw new Error('--check must not write');
      },
    });
    expect(result.exitCode).toBe(2);
    expect(result.messages.join('\n')).toContain('--check:');
    expect(result.messages.join('\n')).toContain(MIGRATION_FILENAME);
    expect(result.messages.join('\n')).toContain('does not exist');
  });

  it('--check catches a hand-edit of the emitted migration in either direction, naming the line', () => {
    const complete = csv('2016,CLE,GSW,NBA,CLE', '2017,GSW,CLE,NBA,CLE');
    const rows: VenueRow[] = parseVenuesCsv(complete, 'c.csv');
    const rendered = renderMigration(rows, curatedAssignments(rows), { selfTest: false });
    const edited = rendered.replace('SET DEFAULT', 'SET  DEFAULT');
    const result = runVenueBackfillCli(['--check', '--csv=c.csv'], {
      readFile: (path) =>
        path === 'c.csv' ? complete : path.endsWith(MIGRATION_FILENAME) ? edited : (() => { throw new Error(`unexpected read ${path}`); })(),
      writeFile: () => {
        throw new Error('--check must not write');
      },
    });
    expect(result.exitCode).toBe(2);
    expect(result.messages.join('\n')).toMatch(/--check FAILED: .* disagree at line \d+/);
  });

  it('the emit path writes exactly the rendered migration once curation is complete', () => {
    const complete = csv('2016,CLE,GSW,NBA,CLE', '2017,GSW,CLE,NBA,CLE');
    const rows = parseVenuesCsv(complete, 'c.csv');
    const written = new Map<string, string>();
    const result = runVenueBackfillCli(['--csv=c.csv'], {
      readFile: (path) => (path === 'c.csv' ? complete : (() => { throw new Error(`unexpected read ${path}`); })()),
      writeFile: (path, data) => written.set(path, data),
    });
    expect(result.exitCode).toBe(0);
    expect([...written.keys()]).toHaveLength(1);
    const targetPath = [...written.keys()][0];
    expect(targetPath.endsWith(MIGRATION_FILENAME)).toBe(true);
    expect(targetPath.replace(/\\/g, '/')).toContain('/supabase/migrations/');
    expect([...written.values()][0]).toBe(renderMigration(rows, curatedAssignments(rows), { selfTest: false }));
  });

  it('a CRLF checkout does not make --check red (E2): line endings normalize before the compare', () => {
    const complete = csv('2016,CLE,GSW,NBA,CLE', '2017,GSW,CLE,NBA,CLE');
    const rows: VenueRow[] = parseVenuesCsv(complete, 'c.csv');
    const rendered = renderMigration(rows, curatedAssignments(rows), { selfTest: false });
    const crlfCheckout = rendered.replace(/\n/g, '\r\n'); // exactly what core.autocrlf=true produces
    const result = runVenueBackfillCli(['--check', '--csv=c.csv'], {
      readFile: (path) =>
        path === 'c.csv' ? complete : path.endsWith(MIGRATION_FILENAME) ? crlfCheckout : (() => { throw new Error(`unexpected read ${path}`); })(),
      writeFile: () => {
        throw new Error('--check must not write');
      },
    });
    expect(result.exitCode).toBe(0);
    expect(result.messages.join('\n')).toContain('--check ok');
  });

  it('the emit path is idempotent across EOL conventions too (E2): a CRLF committed file that agrees is left alone', () => {
    const complete = csv('2016,CLE,GSW,NBA,CLE', '2017,GSW,CLE,NBA,CLE');
    const rows: VenueRow[] = parseVenuesCsv(complete, 'c.csv');
    const rendered = renderMigration(rows, curatedAssignments(rows), { selfTest: false });
    const written: string[] = [];
    const result = runVenueBackfillCli(['--csv=c.csv'], {
      readFile: (path) =>
        path === 'c.csv' ? complete : path.endsWith(MIGRATION_FILENAME) ? rendered.replace(/\n/g, '\r\n') : (() => { throw new Error(`unexpected read ${path}`); })(),
      writeFile: (path) => {
        written.push(path);
      },
    });
    expect(result.exitCode).toBe(0);
    expect(result.messages.join('\n')).toContain('nothing written');
    expect(written).toEqual([]);
  });

  it('normalizeEol flattens CRLF and lone CR to LF', () => {
    expect(normalizeEol('a\r\nb\rc\nd')).toBe('a\nb\nc\nd');
    expect(firstDriftLine('a\r\nb', 'a\nb')).toBeNull();
  });

  it('the committed CSV <-> migration pair runs through the REAL-IO CLI and is refused or green by state (E2)', () => {
    // The injected-IO tests above prove the compare logic; this one drives the
    // shipped default IO over the committed files, so the normally-executed
    // path is exercised inside the gate. While curation stands incomplete the
    // refusal comes first by design (triage R5: there is no committed
    // migration to compare against yet); after it lands, --check must be
    // green on the committed pair.
    const exists = (() => {
      try {
        return readFileSync(new URL(`../../supabase/migrations/${MIGRATION_FILENAME}`, import.meta.url), 'utf8').length > 0;
      } catch {
        return false;
      }
    })();
    const result = runVenueBackfillCli(['--check'], {});
    const messages = result.messages.join('\n');
    if (committedBlanks.length > 0) {
      expect(result.exitCode).toBe(2);
      expect(messages).toContain(`refuses to emit: ${committedBlanks.length} NBA/BAA row(s)`);
    } else if (exists) {
      expect(result.exitCode).toBe(0);
      expect(messages).toContain('--check ok');
    } else {
      expect(result.exitCode).toBe(2);
      expect(messages).toContain('does not exist');
    }
  });
});

describe('CLI argument discipline (P3-6)', () => {
  it('a bare value flag is refused, not silently defaulted', () => {
    for (const arg of ['--csv', '--self-test-migration', '--self-test-fixture']) {
      const result = runVenueBackfillCli([arg], { readFile: () => '', writeFile: () => {} });
      expect(result.exitCode).toBe(2);
      expect(result.messages.join('\n')).toContain(`${arg} requires a value`);
    }
  });
});

describe('the self-test CLI path (what the rehearsal drives)', () => {
  it('emits the synthetic rendering and the fixture seed to the given paths — never into supabase/migrations/', () => {
    const written = new Map<string, string>();
    const io = {
      readFile: (path: string) => (path === 'c.csv' ? fullAssignments(160) + '\n1970,IND,LOS,ABA,' : (() => { throw new Error(`unexpected read ${path}`); })()),
      writeFile: (path: string, data: string) => written.set(path, data),
    };
    const result = runVenueBackfillCli(
      ['--csv=c.csv', '--self-test-migration=/tmp/00016.sql', '--self-test-fixture=/tmp/fixture.sql'],
      io,
    );
    expect(result.exitCode).toBe(0);
    expect([...written.keys()]).toEqual(['/tmp/00016.sql', '/tmp/fixture.sql']);
    expect(result.messages.join('\n')).toContain('SELF-TEST generated');
    expect(result.messages.join('\n')).toContain('117 keep (home = team_a) / 43 swap (home = team_b)');

    const refused = runVenueBackfillCli(
      ['--csv=c.csv', '--self-test-migration=supabase/migrations/00016_archive_league_identity_and_game7_venues.sql', '--self-test-fixture=/tmp/fixture.sql'],
      io,
    );
    expect(refused.exitCode).toBe(2);
    expect(refused.messages.join('\n')).toContain('must never land in');
  });

  it('the committed migration is exactly what the generator renders from the committed CSV', () => {
    // The byte-level form of "the generator owns the single copy", and the
    // inversion of the refusal case this file carried while the venues were
    // blank — that branch stays covered by the injected-IO cases above, and the
    // real-IO emit run below re-proves it: with nothing to refuse, it must be a
    // no-op that writes zero files.
    const rendered = renderMigration(committedRows, curatedAssignments(committedRows), { selfTest: false });
    const onDisk = readFileSync(new URL(`../../supabase/migrations/${MIGRATION_FILENAME}`, import.meta.url), 'utf8');
    expect(firstDriftLine(normalizeEol(onDisk), rendered)).toBeNull();

    const written = new Map<string, string>();
    const result = runVenueBackfillCli([], {
      readFile: (path) => readFileSync(path, 'utf8'),
      writeFile: (path, data) => {
        written.set(path, data);
      },
    });
    expect(result.exitCode).toBe(0);
    expect(result.messages.join('\n')).toContain('already matches the curated CSV');
    expect(written.size).toBe(0);
  });
});

describe('the scripts/** coverage gap (E5)', () => {
  // No gate step type-checks or lints scripts/** (AGENTS.md), so at minimum
  // the two Story 2.8 additions must parse under Node's own syntax check.
  // Anything deeper is the Docker rehearsal's job — which also runs in no
  // gate step, and says so in its header.
  for (const script of ['probe-game7-venues.mjs', 'rehearse-migration-00014.mjs']) {
    it(`node --check parses scripts/${script}`, () => {
      const res = spawnSync(process.execPath, ['--check', fileURLToPath(new URL(`../../scripts/${script}`, import.meta.url))], {
        encoding: 'utf8',
      });
      expect(res.stderr).toBe('');
      expect(res.status).toBe(0);
    });
  }
});

describe('classifySeason — when a quiet season is news (curation run, P2-4/P2-5)', () => {
  it('route silence is the blocker only when the archive expected something', () => {
    expect(classifySeason({ seriesInFeed: 0, completedGame7: 0, curatedRowsForYear: 3 })).toBe('empty-feed');
    expect(classifySeason({ seriesInFeed: 15, completedGame7: 0, curatedRowsForYear: 2 })).toBe('missing-game7');
    expect(classifySeason({ seriesInFeed: 15, completedGame7: 4, curatedRowsForYear: 0 })).toBe('ok');
  });

  it('agreement outranks silence: no Game 7 anywhere is corroboration, not failure', () => {
    // The 2026-10-01 sweep reported thirteen seasons as failures on exactly this
    // shape. The first classifier asked the route before it asked the archive, so an
    // instrument built to surface a depth gap cried failure on agreement — and
    // thirteen false failures is how an owner learns to ignore the report.
    expect(classifySeason({ seriesInFeed: 0, completedGame7: 0, curatedRowsForYear: 0 })).toBe('no-game7');
  });

  it('every season the sweep called depth-blocked is a year the archive holds no Game 7 for', () => {
    // Asserted against the committed file rather than restated from the run: if a row
    // for any of these calendar years is ever added, this test is what notices.
    // 1998-99 is in the family — the owner confirmed the gap from their own dataset.
    const blocked = [1947, 1949, 1950, 1953, 1956, 1958, 1967, 1972, 1983, 1985, 1989, 1991, 1999];
    const curatedYears = new Set(committedRows.filter((row) => row.league !== 'ABA').map((row) => row.year));
    expect(blocked.filter((year) => curatedYears.has(year))).toEqual([]);
    expect(blocked).toContain(1999);
  });

  it('every reading carries a meaning the probe can print', () => {
    for (const outcome of ['ok', 'empty-feed', 'missing-game7', 'no-game7'] as const) {
      expect(SEASON_OUTCOME_MEANING[outcome].length).toBeGreaterThan(0);
    }
  });
});

describe('renderWorksheet and --worksheet — the hand-entry route for rows no feed answers (D6)', () => {
  it('lists only the blank NBA/BAA rows, each answerable by one of its own two slots', () => {
    const sheet = renderWorksheet(
      parseVenuesCsv(csv('1962,BOS,LAL,NBA,', '1963,BOS,CNR,NBA,BOS', '1971,IND,KEN,ABA,'), 'fixture.csv'),
    );
    expect(sheet).toContain('1 NBA/BAA row(s) still blank');
    expect(sheet).toContain('1962');
    expect(sheet).toContain('one of BOS | LAL');
    expect(sheet).not.toContain('1963');
    expect(sheet).not.toContain('KEN');
  });

  it('names the exact CSV line to edit, and follows the file when curation completes', () => {
    // Formatting is proved on a fixture with known blanks; the committed file is
    // asserted only for agreeing with its own blank count, so completing curation
    // flips this test's branch instead of breaking it — the same discipline as the
    // refuse-to-emit gate, which just went from refusing to emitting `00016`.
    const fixture = parseVenuesCsv(csv('1962,BOS,LAL,NBA,', '1963,BOS,CNR,NBA,'), 'fixture.csv');
    const sheet = renderWorksheet(fixture);
    expect(sheet.match(/game7_home_team = ____/g)).toHaveLength(2);
    for (const row of blankVenueRows(fixture)) expect(sheet).toContain(`csv:${String(row.line).padStart(4, ' ')}`);

    const committedSheet = renderWorksheet(committedRows);
    const committedBlanks = blankVenueRows(committedRows);
    if (committedBlanks.length === 0) {
      expect(committedSheet).toContain('0 NBA/BAA row(s) still blank');
      expect(committedRows.filter((row) => row.league !== 'ABA' && row.home !== '')).toHaveLength(160);
    } else {
      expect(committedSheet.match(/game7_home_team = ____/g)).toHaveLength(committedBlanks.length);
    }
  });

  it('exits 0 while the venues are still blank and writes nothing — the worksheet is for the gap', () => {
    const written = new Map<string, string>();
    const result = runVenueBackfillCli(['--worksheet', '--csv=curated.csv'], {
      readFile: () => csv('1948,PHW,SLB,BAA,', '1957,BOS,SLH,NBA,'),
      writeFile: (path, data) => written.set(path, data),
    });
    expect(result.exitCode).toBe(0);
    expect(written.size).toBe(0);
    expect(result.messages.join('\n')).toContain('2 NBA/BAA row(s) still blank');
  });

  it('refuses to be combined with the instruments that write', () => {
    const result = runVenueBackfillCli(['--worksheet', '--check'], { readFile: () => csv('1948,PHW,SLB,BAA,'), writeFile: () => {} });
    expect(result.exitCode).toBe(2);
    expect(result.messages.join('\n')).toContain('read-only report');
  });
});

describe('the era-code alias table and the two-pass season matcher (curation option A)', () => {
  // Every case below is a series the OWNER's 2026-10-01 drills actually printed, so
  // these are reconstructions of observed data, not invented shapes: 1962-63 (CIN,
  // STL), 1975-76 (WAS, GOS) and 1987-88 (UTH, with LAL in three series at once).
  const aliases = parseFeedAliases(
    readFileSync(FEED_ALIASES_CSV_PATH, 'utf8'),
    'game7_feed_aliases.csv',
    parseTeamsSeed(TEAMS_SEED_TEXT, '00005 + 00007 teams seed'),
  );

  function curated(...rows: string[]): VenueRow[] {
    return parseVenuesCsv(csv(...rows), 'fixture.csv');
  }

  it('the committed table carries the evidenced mappings, each pointing into the teams seed', () => {
    const seed = parseTeamsSeed(TEAMS_SEED_TEXT, 'seed');
    // Derived, not counted: the owner approving another era code is the table
    // working, and a pinned list would turn that into a red gate.
    expect(aliases.length).toBeGreaterThanOrEqual(5);
    for (const feed of ['CIN', 'STL', 'WAS', 'GOS', 'UTH', 'CHH']) {
      expect(aliases.some((alias) => alias.feed === feed)).toBe(true);
    }
    for (const alias of aliases) {
      expect(seed.has(alias.teams)).toBe(true);
      expect(alias.evidence).toContain('csv:');
    }
  });

  it('refuses an alias whose target the teams table does not hold', () => {
    expect(() => parseFeedAliases('feed_abbr,teams_abbr,evidence\nCIN,CHH,made up', 'a.csv', new Map([['BOS', 1]]))).toThrowError(
      /alias target "CHH" is not in the teams seed/,
    );
  });

  it('refuses one feed code naming two franchises, an identity mapping, and an unevidenced row', () => {
    const seed = new Map([['BOS', 1], ['CHI', 2], ['CIN', 3]]);
    expect(() =>
      parseFeedAliases('feed_abbr,teams_abbr,evidence\nCIN,BOS,x\nCIN,CHI,y', 'a.csv', seed),
    ).toThrowError(/already aliased/);
    expect(() => parseFeedAliases('feed_abbr,teams_abbr,evidence\nBOS,BOS,x', 'a.csv', seed)).toThrowError(/maps a code to itself/);
    expect(() => parseFeedAliases('feed_abbr,teams_abbr,evidence\nCIN,BOS,', 'a.csv', seed)).toThrowError(/no evidence line/);
    expect(() => parseFeedAliases('feed,teams,evidence\nCIN,BOS,x', 'a.csv', seed)).toThrowError(/header must be exactly/);
  });

  it('1962-63: both Game 7s resolve through aliases onto the only rows their opposing side leaves', () => {
    const rows = curated('1963,BOS,CNR,NBA,', '1963,LAL,SLH,NBA,');
    const { matched, unmatched } = matchSeasonFeedSeries({
      year: 1963,
      series: [{ codeA: 'BOS', codeB: 'CIN' }, { codeA: 'LAL', codeB: 'STL' }],
      curated: rows,
      aliases,
    });
    expect(unmatched).toEqual([]);
    expect(matched.map((m) => [m.row.teamA, m.row.teamB, m.via === 'direct' ? 'direct' : m.via.aliases.map((a) => a.feed).join('+')])).toEqual([
      ['BOS', 'CNR', 'CIN'],
      ['LAL', 'SLH', 'STL'],
    ]);
  });

  it('1975-76: the home team can be the aliased side, and resolveFeedCode carries it', () => {
    const rows = curated('1976,PHX,GSW,NBA,', '1976,CLE,WSB,NBA,');
    const { matched } = matchSeasonFeedSeries({
      year: 1976,
      series: [{ codeA: 'PHX', codeB: 'GOS' }, { codeA: 'CLE', codeB: 'WAS' }],
      curated: rows,
      aliases,
    });
    expect(matched.map((m) => m.row.line)).toEqual([2, 3]);
    // The home side is the aliased code here, so resolution has to carry it into the
    // matched row's own vocabulary — and the row's slots are what the parser accepts.
    expect(resolveFeedCode('GOS', aliases).abbr).toBe('GSW');
    expect(resolveFeedCode('GOS', aliases).alias).toMatchObject({ feed: 'GOS', teams: 'GSW' });
  });

  it('1987-88: the alias pass runs after the WHOLE direct pass, so three LAL series disambiguate', () => {
    const rows = curated('1988,LAL,DAL,NBA,', '1988,LAL,DET,NBA,', '1988,LAL,UTA,NBA,', '1988,BOS,ATL,NBA,');
    // UTH listed FIRST — the order the feed happens to print in must not decide which
    // row it lands on. Claiming is what makes `LAL/UTH` resolvable at all.
    const { matched, unmatched } = matchSeasonFeedSeries({
      year: 1988,
      series: [
        { codeA: 'LAL', codeB: 'UTH' },
        { codeA: 'LAL', codeB: 'DAL' },
        { codeA: 'LAL', codeB: 'DET' },
        { codeA: 'BOS', codeB: 'ATL' },
      ],
      curated: rows,
      aliases,
    });
    expect(unmatched).toEqual([]);
    // rows: line 2 = LAL/DAL, 3 = LAL/DET, 4 = LAL/UTA, 5 = BOS/ATL
    expect(matched.filter((m) => m.via === 'direct').map((m) => m.row.line)).toEqual([2, 3, 5]);
    const aliased = matched.find((m) => m.via !== 'direct');
    expect(aliased?.row.line).toBe(4);
    expect(aliased?.row.teamB).toBe('UTA');
  });

  it('a code that also exists in the seed is never reinterpreted when it matches directly (WAS 2017)', () => {
    const rows = curated('2017,BOS,WAS,NBA,', '1976,CLE,WSB,NBA,');
    const { matched } = matchSeasonFeedSeries({
      year: 2017,
      series: [{ codeA: 'BOS', codeB: 'WAS' }],
      curated: rows,
      aliases,
    });
    expect(matched).toHaveLength(1);
    expect(matched[0].via).toBe('direct');
    expect(matched[0].row.line).toBe(2);
  });

  it('an unresolvable series is reported with the rows an alias would have to choose between', () => {
    const rows = curated('1963,BOS,CNR,NBA,', '1963,LAL,SLH,NBA,');
    const { matched, unmatched } = matchSeasonFeedSeries({
      year: 1963,
      series: [{ codeA: 'BOS', codeB: 'ZZQ' }],
      curated: rows,
      aliases,
    });
    expect(matched).toEqual([]);
    expect(unmatched).toHaveLength(1);
    expect(unmatched[0].reason).toBe('no-alias');
    expect(unmatched[0].candidates.map((row) => row.teamB)).toEqual(['CNR']);
  });

  it('a pair needing TWO approved substitutions resolves — each code is still individually audited', () => {
    // 1979 is real: the feed printed `WAS vs SAN` for the Bullets–Spurs Game 7 and
    // `SAN vs PHL` for the Spurs–Sixers, and the first version left both unmatched
    // because it allowed one substitution. The owner approved the change on
    // 2026-10-01; what still guards a wrong answer is exactly-one-surviving-row.
    const rows = curated('1979,WSB,SAS,NBA,', '1979,SAS,PHI,NBA,', '1979,SEA,PHX,NBA,');
    const { matched, unmatched } = matchSeasonFeedSeries({
      year: 1979,
      series: [
        { codeA: 'WAS', codeB: 'SAN' },
        { codeA: 'SAN', codeB: 'PHL' },
        { codeA: 'SEA', codeB: 'PHX' },
      ],
      curated: rows,
      aliases,
    });
    expect(unmatched).toEqual([]);
    expect(matched.map((m) => [m.row.line, m.via === 'direct' ? 'direct' : m.via.aliases.map((a) => a.feed).join('+')])).toEqual([
      [4, 'direct'],
      [2, 'WAS+SAN'],
      [3, 'SAN+PHL'],
    ]);
  });

  it('a pair no approved alias can place is still unmatched, with its candidates listed', () => {
    const rows = curated('1970,CHI,DAL,NBA,');
    const { matched, unmatched } = matchSeasonFeedSeries({
      year: 1970,
      series: [{ codeA: 'ZZQ', codeB: 'QQZ' }],
      curated: rows,
      aliases,
    });
    expect(matched).toEqual([]);
    expect(unmatched[0].reason).toBe('no-alias');
    expect(unmatched[0].candidates).toEqual([]);
  });

  it('raises instead of choosing if substitution lands on two rows — the invariant that makes it single-valued broke', () => {
    // Unreachable through `parseVenuesCsv`, which rejects a repeated (year, unordered
    // pair) — so this builds the rows directly. The branch exists because that
    // uniqueness is what allows a match to be trusted; if it ever lapses, the matcher
    // must refuse to rank rather than pick one.
    const duplicated: VenueRow[] = [
      { line: 2, year: 1970, teamA: 'CHI', teamB: 'DAL', league: 'NBA', home: '' },
      { line: 3, year: 1970, teamA: 'DAL', teamB: 'CHI', league: 'NBA', home: '' },
    ];
    const oneAlias = parseFeedAliases('feed_abbr,teams_abbr,evidence\nCHH,CHI,evidence one', 'a.csv', new Map([['CHI', 1], ['DAL', 2]]));
    expect(() =>
      matchSeasonFeedSeries({ year: 1970, series: [{ codeA: 'CHH', codeB: 'DAL' }], curated: duplicated, aliases: oneAlias }),
    ).toThrowError(/alias resolution is not single-valued/);
  });
});
