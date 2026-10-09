// Story 6.11 — migration 00021 (the 1968 ABA Finals added to the archive).
// Pins the migration's literals to the committed CSV, and the CSV to the
// owner-supplied table in spec-6-11 (basketball-reference, cross-checked), so
// neither can drift from the other or from the record. The SQL's behaviour is
// rehearsed in scripts/rehearse-migration-00014.mjs (section 10), not here.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const repoFile = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8').replace(/\r\n?/g, '\n');
const dataLines = (text: string) => text.split('\n').filter((line) => line.trim() !== '' && !line.startsWith('#'));

const migration = repoFile('supabase/migrations/00021_add_1968_aba_finals.sql');
const csvText = repoFile('supabase/scripts/pipeline/data/aba_1968_finals.csv');
const [header, ...lines] = dataLines(csvText);
const rows = lines.map((line) => {
  const fields = line.split(',');
  const [game_number, date, home, away, home_score, away_score, source, cross_check] = fields;
  return { game_number, date, home, away, home_score, away_score, source, cross_check, fieldCount: fields.length };
});

/** The spec's owner-supplied table (spec-6-11, Boundaries · Always · Data record), verbatim. */
const SPEC_TABLE = [
  { game: 1, date: '04-18', home: 'PTP', away: 'NOB', homeScore: 120, awayScore: 112 },
  { game: 2, date: '04-20', home: 'PTP', away: 'NOB', homeScore: 100, awayScore: 109 },
  { game: 3, date: '04-24', home: 'NOB', away: 'PTP', homeScore: 109, awayScore: 101 },
  { game: 4, date: '04-25', home: 'NOB', away: 'PTP', homeScore: 105, awayScore: 106 },
  { game: 5, date: '04-27', home: 'PTP', away: 'NOB', homeScore: 108, awayScore: 111 },
  { game: 6, date: '05-01', home: 'NOB', away: 'PTP', homeScore: 112, awayScore: 118 },
  { game: 7, date: '05-04', home: 'PTP', away: 'NOB', homeScore: 122, awayScore: 113 },
];

/** The migration's game literals, in file order, as "game,home,away,home_score,away_score". */
function migrationGames(): string[] {
  const block = /INSERT INTO aba_1968_finals_games \(game_number, home, away, home_score, away_score\) VALUES\n([\s\S]*?);\n/.exec(migration)?.[1];
  if (block === undefined) throw new Error('00021 carries no aba_1968_finals_games VALUES list');
  return [...block.matchAll(/\((\d), '([A-Z]{3})', '([A-Z]{3})', (\d+), (\d+)\)/g)].map((m) => `${m[1]},${m[2]},${m[3]},${m[4]},${m[5]}`);
}

describe('aba_1968_finals.csv — the record (Story 6.11)', () => {
  it('reads by its exact header, carries a # provenance header, and has seven well-formed rows', () => {
    expect(header).toBe('game_number,date,home,away,home_score,away_score,source,cross_check');
    expect(csvText.startsWith('# aba_1968_finals.csv')).toBe(true);
    expect(rows).toHaveLength(7);
    for (const row of rows) {
      expect(row.fieldCount, `game ${row.game_number}`).toBe(8);
      expect(row.source).toMatch(/^https:\/\/www\.basketball-reference\.com\/playoffs\/ABA_1968\.html \(Finals Game \d /);
      expect(row.cross_check).toMatch(/^https:\/\/en\.wikipedia\.org\/wiki\/1968_ABA_playoffs \(ABA Finals Game \d /);
    }
  });

  it('equals the spec table: date, real venue and both scores of every game', () => {
    expect(
      rows.map((r) => ({
        game: Number(r.game_number),
        date: r.date,
        home: r.home,
        away: r.away,
        homeScore: Number(r.home_score),
        awayScore: Number(r.away_score),
      })),
    ).toEqual(SPEC_TABLE.map((t) => ({ ...t, date: `1968-${t.date}` })));
  });

  it("carries citations that state each row's date, venue and scores (both sources, every game)", () => {
    const nameToCode: Record<string, string> = { 'Pittsburgh Pipers': 'PTP', 'New Orleans Buccaneers': 'NOB' };
    const cityToCode: Record<string, string> = { Pittsburgh: 'PTP', 'New Orleans': 'NOB' };
    const monthDay = (month: string, day: string) => `${month === 'April' ? '04' : '05'}-${day.padStart(2, '0')}`;
    for (const r of rows) {
      const key = `game ${r.game_number}`;
      // basketball-reference: (Finals Game <n> <Month> <day> <visitor> <pts> @ <home> <pts>)
      const src = /\(Finals Game (\d) (April|May) (\d{1,2}) (Pittsburgh Pipers|New Orleans Buccaneers) (\d+) @ (Pittsburgh Pipers|New Orleans Buccaneers) (\d+)\)$/.exec(r.source);
      expect(src, `${key} source format`).not.toBeNull();
      if (src === null) continue;
      expect(src[1], key).toBe(r.game_number);
      expect(`1968-${monthDay(src[2], src[3])}`, key).toBe(r.date);
      expect([nameToCode[src[4]], src[5], nameToCode[src[6]], src[7]], key).toEqual([r.away, r.away_score, r.home, r.home_score]);
      // Wikipedia: (ABA Finals Game <n> <Month> <day> <visitor city> <pts> <home city> <pts>[ OT] at <arena> <home city>)
      const xc = /\(ABA Finals Game (\d) (April|May) (\d{1,2}) (Pittsburgh|New Orleans) (\d+) (Pittsburgh|New Orleans) (\d+)(?: OT)? at (.+) (Pittsburgh|New Orleans)\)$/.exec(r.cross_check);
      expect(xc, `${key} cross_check format`).not.toBeNull();
      if (xc === null) continue;
      expect(xc[1], key).toBe(r.game_number);
      expect(`1968-${monthDay(xc[2], xc[3])}`, key).toBe(r.date);
      expect([cityToCode[xc[4]], xc[5], cityToCode[xc[6]], xc[7], cityToCode[xc[9]]], key).toEqual([r.away, r.away_score, r.home, r.home_score, r.home]);
    }
  });

  it('reads 4-3 PTP with 3-3 after six, PTP hosting Games 1 and 7, no tie', () => {
    const winners = rows.map((r) => {
      expect(Number(r.home_score)).not.toBe(Number(r.away_score));
      return Number(r.home_score) > Number(r.away_score) ? r.home : r.away;
    });
    expect(winners.filter((w) => w === 'PTP')).toHaveLength(4);
    expect(winners.filter((w) => w === 'NOB')).toHaveLength(3);
    expect(winners.slice(0, 6).filter((w) => w === 'PTP')).toHaveLength(3);
    expect(winners[6]).toBe('PTP');
    expect(rows[0].home).toBe('PTP');
    expect(rows[6].home).toBe('PTP');
  });
});

describe('migration 00021 — literals pinned to the CSV (Story 6.11)', () => {
  it('embeds exactly the CSV games, in order', () => {
    expect(migrationGames()).toEqual(rows.map((r) => `${r.game_number},${r.home},${r.away},${r.home_score},${r.away_score}`));
  });

  it('inserts the PTP team row as specified (id 61, distinct from MNP, owner logo, no espn_code)', () => {
    expect(migration).toContain(
      "SELECT 61, 'Pittsburgh Pipers', 'PTP', 'Pittsburgh', 'Pipers', 'assets/teams/Pittsburgh_Pipers.gif', NULL",
    );
    expect(readFileSync(new URL('../../public/assets/teams/Pittsburgh_Pipers.gif', import.meta.url)).subarray(0, 6).toString('latin1')).toMatch(
      /^GIF8[79]a$/,
    );
  });

  it('ships a logo og:cards can decode: normaliseLogo turns the GIF into a PNG', async () => {
    const { normaliseLogo } = await import('../../scripts/og/card.ts');
    const png = await normaliseLogo(readFileSync(new URL('../../public/assets/teams/Pittsburgh_Pipers.gif', import.meta.url)));
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  });

  it('inserts the series PTP-first, PTP the winner, league ABA, round Finals, not featured', () => {
    expect(migration).toMatch(/INSERT INTO public\.series \(year, round, league, team_a_id, team_b_id, winner_team_id, is_featured\)\nSELECT 1968, 'Finals', 'ABA', ptp\.id, nob\.id, ptp\.id, false/);
    expect(migration).not.toMatch(/is_featured\s*=\s*true|,\s*true\s*\n/);
  });

  it('writes public tables through three INSERTs only — no UPDATE, DELETE or DDL against public.', () => {
    const publicStatements = [
      ...migration.matchAll(/\b(INSERT\s+INTO|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?|UPDATE|MERGE\s+INTO|ALTER\s+TABLE|DROP\s+\w+|CREATE\s+(?:OR\s+REPLACE\s+)?\w+)\s+(?:ONLY\s+)?public\./gi),
    ].map((m) => m[1].toUpperCase().replace(/\s+/g, ' '));
    expect(publicStatements).toEqual(['INSERT INTO', 'INSERT INTO', 'INSERT INTO']);
    expect(migration).toMatch(/LOCK TABLE public\.teams, public\.series, public\.series_game_scores IN SHARE ROW EXCLUSIVE MODE;/);
    expect(migration.split('-- ==== 00021 POST-CONDITIONS ====')).toHaveLength(2);
  });

  it('carries every guard the spec names, as abort-on-failure guards', () => {
    const [head, tail] = migration.split('-- ==== 00021 POST-CONDITIONS ====');
    for (const guard of ['team_slot', 'nob_present', 'series_slot', 'archive_state']) {
      expect(head).toContain(`RAISE EXCEPTION '00021 guard ${guard}:`);
    }
    for (const guard of [
      'archived_count',
      'new_series_archive',
      'series_score',
      'hosts_are_team_a',
      'games_match_literals',
      'other_rows_unchanged',
    ]) {
      expect(tail).toContain(`RAISE EXCEPTION '00021 guard ${guard}:`);
    }
    expect(migration).toMatch(/v_expected_archived := 178;/);
    expect(migration).toMatch(/v_expected_archived := 179;/);
    // First apply pinned to exactly 178 -> 179; a no-op re-apply accepts >= 179 (P4).
    expect(migration).toMatch(/\(v_expected_archived = 178 AND v_archived <> 178\) OR \(v_expected_archived = 179 AND v_archived < 179\)/);
    expect(migration).toMatch(/\(v_mode = 'apply' AND v_archived <> 179\) OR \(v_mode = 'noop' AND v_archived < 179\)/);
    // team_slot covers the UNIQUE full_name too (P3).
    expect(migration).toMatch(/v_ptp_rows = 0 AND v_id61_rows = 0 AND v_name_rows = 0/);
    expect(migration).toMatch(/v_ptp <> 4 OR v_nob <> 3 OR v_ptp6 <> 3 OR v_nob6 <> 3/);
    expect(migration).toMatch(/Apply 00020 first, then 00021/);
  });
});
