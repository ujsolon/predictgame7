// Story 6.10 — migration 00020 (archive re-keyed to home-court first). Pins the
// migration's literal swap set to its committed sources so a later edit to the
// CSV or the SQL cannot silently drift apart: the six ABA tuples to
// aba_game7_venues.csv (Story 6.9, with its `info:` note rule), and the 42
// NBA/BAA count literal to game7_venues_curated.csv. The SQL's behaviour is
// rehearsed in scripts/rehearse-migration-00014.mjs (section 9), not here.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const repoFile = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8').replace(/\r\n?/g, '\n');
const dataLines = (text: string) => text.split('\n').filter((line) => line.trim() !== '' && !line.startsWith('#'));

const migration = repoFile('supabase/migrations/00020_archive_home_court_first.sql');

const [abaHeader, ...abaLines] = dataLines(repoFile('supabase/scripts/pipeline/data/aba_game7_venues.csv'));
const abaRows = abaLines.map((line) => {
  const fields = line.split(',');
  const [year, team_a, team_b, game7_home_team, , , note] = fields;
  return { year, team_a, team_b, game7_home_team, note: note ?? '', fieldCount: fields.length };
});

const [curatedHeader, ...curatedLines] = dataLines(repoFile('supabase/scripts/pipeline/data/game7_venues_curated.csv'));
const curatedRows = curatedLines.map((line) => {
  const [year, team_a, team_b, league, game7_home_team] = line.split(',');
  return { year, team_a, team_b, league, game7_home_team };
});

/** The migration's ABA tuples, in file order, as "year,team_a,team_b". */
function migrationAbaTuples(): string[] {
  const block = /INSERT INTO aba_home_court_swap \(year, team_a, team_b\) VALUES\n([\s\S]*?);\n/.exec(migration)?.[1];
  if (block === undefined) throw new Error('00020 carries no aba_home_court_swap VALUES list');
  return [...block.matchAll(/\((\d{4}), '([A-Z]{3})', '([A-Z]{3})'\)/g)].map((m) => `${m[1]},${m[2]},${m[3]}`);
}

function constant(name: string): number {
  const match = new RegExp(`${name} CONSTANT integer := (\\d+);`).exec(migration);
  if (match === null) throw new Error(`00020 declares no ${name} constant`);
  return Number(match[1]);
}

describe('migration 00020 — the swap set is pinned to its sources (Story 6.10)', () => {
  it('reads both CSVs by their exact headers, so the positional parse cannot mis-key', () => {
    expect(abaHeader).toBe('year,team_a,team_b,game7_home_team,source,cross_check,note');
    expect(curatedHeader).toBe('year,team_a,team_b,league,game7_home_team');
  });

  it('reads only settled ABA rows: a blank Game 7 host, or a non-blank note that is not an info: remark, aborts generation', () => {
    expect(abaRows).toHaveLength(18);
    for (const row of abaRows) {
      const key = `${row.year},${row.team_a},${row.team_b}`;
      expect(row.fieldCount, key).toBe(7);
      if (row.game7_home_team === '') throw new Error(`${key}: blank game7_home_team — an unsettled row; 00020 cannot be generated`);
      if (row.note !== '' && !row.note.startsWith('info:')) throw new Error(`${key}: note "${row.note}" marks an unsettled row; 00020 cannot be generated`);
      expect([row.team_a, row.team_b], key).toContain(row.game7_home_team);
    }
  });

  it('embeds exactly the CSV rows whose Game 7 host is not team_a, in CSV order', () => {
    const csvSwaps = abaRows.filter((r) => r.game7_home_team !== r.team_a).map((r) => `${r.year},${r.team_a},${r.team_b}`);
    expect(csvSwaps).toEqual(['1971,UTS,IND', '1972,IND,UTS', '1972,NYN,VAS', '1973,IND,KEN', '1973,KEN,CAC', '1975,IND,DEN']);
    expect(migrationAbaTuples()).toEqual(csvSwaps);
    expect(constant('c_expected_aba')).toBe(csvSwaps.length);
  });

  it('pins 42 NBA/BAA candidates: the curated CSV has 43 road-Game-7 rows in its own slot order, and one is stored the other way round live', () => {
    const nbaBaa = curatedRows.filter((r) => r.league === 'NBA' || r.league === 'BAA');
    expect(nbaBaa).toHaveLength(160);
    const csvRoad = nbaBaa.filter((r) => r.game7_home_team !== r.team_a).map((r) => `${r.year},${r.team_a},${r.team_b}`);
    expect(csvRoad).toHaveLength(43);
    // The 2026 WCF: the CSV writes it winner-first (SAS), production stores it
    // OKC-first (game 1's home, which is also the Game 7 host) — so it is
    // already home-court first live (docs/CURRENT_DATA_MODEL.md § Story 2.8 status).
    const storedReversedLive = ['2026,SAS,OKC'];
    for (const key of storedReversedLive) expect(csvRoad).toContain(key);
    expect(constant('c_expected_nba_baa')).toBe(csvRoad.length - storedReversedLive.length);
    expect(constant('c_expected_nba_baa')).toBe(42);
  });

  it('writes public tables through the two UPDATEs only — no other DML or DDL against public.', () => {
    const publicStatements = [
      ...migration.matchAll(/\b(INSERT\s+INTO|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?|UPDATE|MERGE\s+INTO|ALTER\s+TABLE|DROP\s+\w+|CREATE\s+(?:OR\s+REPLACE\s+)?\w+)\s+(?:ONLY\s+)?public\./gi),
    ].map((m) => m[1].toUpperCase().replace(/\s+/g, ' '));
    expect(publicStatements).toEqual(['UPDATE', 'UPDATE']);
    expect(migration).toMatch(/LOCK TABLE public\.series, public\.series_game_scores IN SHARE ROW EXCLUSIVE MODE;/);
  });

  it('never writes a winner, and carries its post-condition marker exactly once', () => {
    const updates = migration.match(/UPDATE public\.[\s\S]*?;/g) ?? [];
    expect(updates).toHaveLength(2);
    for (const statement of updates) {
      const setClause = /\bSET\b([\s\S]*?)\bFROM\b/.exec(statement)?.[1] ?? '';
      const assigned = [...setClause.matchAll(/(\w+)\s*=/g)].map((m) => m[1]).sort();
      expect(assigned.length).toBeGreaterThan(0);
      expect(['away_score', 'away_team_id', 'home_score', 'home_team_id', 'team_a_id', 'team_b_id']).toEqual(
        expect.arrayContaining(assigned),
      );
    }
    expect(migration.split('-- ==== 00020 POST-CONDITIONS ====')).toHaveLength(2);
  });

  it('pins the post-conditions the spec names, each as an abort-on-failure guard', () => {
    for (const guard of [
      'aba_tuple_match',
      'swap_count',
      'candidate_shape',
      'game1_home_is_team_a',
      'game7_home_is_team_a',
      'swapped_games_1_6_home_is_team_a',
      'team_scores_unchanged',
      'game7_home_win_census',
      'aba_game7_home_win_census',
      'winners_unchanged',
      'identity_unchanged',
    ]) {
      expect(migration).toContain(`RAISE EXCEPTION '00020 guard ${guard}:`);
    }
    expect(migration).toMatch(/v_archived <> 178/);
    expect(migration).toMatch(/v_population <> 160 OR v_home_wins <> 117/);
    expect(migration).toMatch(/v_population <> 18 OR v_home_wins <> 12/);
    // Every pinned count tells the operator to re-measure, not to relax.
    expect(migration.match(/re-measure and regenerate this migration before applying/g) ?? []).toHaveLength(5);
  });
});
