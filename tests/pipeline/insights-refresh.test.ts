// Story 2.5 — metric tests, shape layer: the 00017 RPC is pinned against the
// contract `InsightsPage.tsx` declares, from the migration text itself. This
// is the layer a local gate can reach; the arithmetic VALUES are exercised by
// `scripts/rehearse-migration-00014.mjs` section 6, which runs the real SQL in
// a throwaway database (hand-authored fixtures + U11's real-score fixture),
// because the only place this arithmetic exists is the SQL.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const migrationPath = join(repoRoot, 'supabase', 'migrations', '00017_pipeline_insights_refresh.sql');
const sql = readFileSync(migrationPath, 'utf8');
const pageSource = readFileSync(join(repoRoot, 'src', 'pages', 'InsightsPage.tsx'), 'utf8');
const writerSource = readFileSync(join(repoRoot, 'supabase', 'scripts', 'pipeline', 'writer.ts'), 'utf8');

const KEYS = ['game_6_winner_stats', 'home_team_stats', 'avg_point_differential'] as const;

/** Member names exactly as `InsightsPage.tsx`'s `InsightData` declares them (the de-facto payload contract). */
function membersFromPage(key: string): string[] {
  const block = new RegExp(`${key}: \\{([^}]*)\\}`).exec(pageSource);
  if (block === null) throw new Error(`InsightsPage.tsx declares no ${key} block — the payload contract moved, update both sides together`);
  return [...block[1].matchAll(/(\w+): number/g)].map((m) => m[1]);
}

/** Member names the RPC writes for one key, from its jsonb_build_object call. */
function membersFromSql(key: string): string[] {
  const row = new RegExp(`\\('${key}',\\s*jsonb_build_object\\(([^)]*)\\)\\)`).exec(sql);
  if (row === null) throw new Error(`00017 writes no ${key} row via jsonb_build_object — the three-row shape broke`);
  return [...row[1].matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
}

describe('migration 00017 — shape of the three-row write', () => {
  it('sits below the head: 00018, 00019 and 00020 are the only migrations above it, and nothing else', () => {
    const files = readdirSync(join(repoRoot, 'supabase', 'migrations'))
      .filter((f) => f.endsWith('.sql'))
      .sort();
    expect(files).toContain('00017_pipeline_insights_refresh.sql');
    // Pinned by NAME, not by a ceiling comparison: Story 2.13's 00018 is a lawful
    // head, so a bare `> 17 → []` would have gone red for the right migration.
    // Listing the accepted set keeps a stray 00019 red — the reader has to come
    // name the new head instead of watching a number drift. Story 4.5 named 00019;
    // Story 6.10 named 00020.
    expect(files.filter((f) => Number(f.slice(0, 5)) > 17)).toEqual([
      '00018_teams_espn_code.sql',
      '00019_series_editorial_content.sql',
      '00020_archive_home_court_first.sql',
    ]);
  });

  it('writes one row per key and three exactly, through a single INSERT', () => {
    expect(sql.match(/INSERT INTO public\.insights_cache/g) ?? []).toHaveLength(1);
    for (const key of KEYS) {
      expect(sql.match(new RegExp(`'${key}'`, 'g')) ?? []).toHaveLength(1);
    }
    expect(sql.match(/jsonb_build_object\(/g) ?? []).toHaveLength(3 + 1); // three payload rows + the returned census
  });

  it('the JSONB member names are byte-equal to the client contract, median included even though nothing renders it', () => {
    for (const key of KEYS) {
      const declared = membersFromPage(key);
      const written = membersFromSql(key);
      expect(written.sort()).toEqual(declared.sort());
    }
    expect(membersFromPage('avg_point_differential')).toContain('median');
  });

  it('the upsert carries the atomic three-row shape: ON CONFLICT (insight_key) DO UPDATE sets insight_value and updated_at', () => {
    expect(sql).toMatch(/ON CONFLICT \(insight_key\) DO UPDATE/);
    expect(sql).toMatch(/SET insight_value = EXCLUDED\.insight_value,/);
    expect(sql).toMatch(/updated_at = now\(\)/);
    // Nothing else may be written on conflict — created_at stays the row's own.
    expect(sql).not.toMatch(/DO UPDATE[\s\S]*?created_at/);
  });

  it('the client prints win_rate and appends "%" — so win_rate must be a PERCENTAGE rounded to 2 (seed units: 3-of-4 is 75, never 0.75)', () => {
    expect(pageSource).toMatch(/win_rate\?\.toFixed\(2\)/);
    expect(pageSource).toMatch(/win_rate\?\.toFixed\(1\)/);
    expect(sql).toMatch(/round\(100\.0 \* v_home_wins \/ v_total, 2\)/);
    expect(sql).toMatch(/round\(100\.0 \* v_g6_winners_won \/ v_total, 2\)/);
    // The zero-population branch is not a division.
    expect(sql).toMatch(/CASE WHEN v_total = 0 THEN 0/);
  });

  it('margin is ABS(home - away); median is percentile_cont(0.5) (the mean of the two middle values on an even count); max/min stay integers', () => {
    expect(sql.match(/abs\(g\.home_score - g\.away_score\)/g)!.length).toBeGreaterThanOrEqual(4); // avg / median / max / min
    expect(sql).toMatch(/percentile_cont\(0\.5\) WITHIN GROUP \(ORDER BY abs\(g\.home_score - g\.away_score\)\)/);
    expect(sql).toMatch(/COALESCE\(round\(avg\(abs\(g\.home_score - g\.away_score\)\)::numeric, 2\), 0\)/);
    expect(sql).toMatch(/COALESCE\(max\(abs\(g\.home_score - g\.away_score\)\), 0\)/);
    expect(sql).toMatch(/COALESCE\(min\(abs\(g\.home_score - g\.away_score\)\), 0\)/);
    // No round() wraps max or min — integers per the frozen contract.
    expect(sql).not.toMatch(/round\((?:max|min)\(/);
  });

  it('the population is exactly the frozen one: archived (winner filled, AD-4 — never a status or a date), game 7 only, league-filtered for all three cards', () => {
    expect(sql).toMatch(/WHERE s\.winner_team_id IS NOT NULL\s+AND s\.league IN \('NBA', 'BAA'\)/);
    expect(sql).toMatch(/g\.series_id = s\.id AND g\.game_number = 7/);
    expect(sql).toMatch(/g6\.series_id = s\.id AND g6\.game_number = 6/);
    // The ABA rows may not sneak back in anywhere; no phase comes from status
    // or a date (the header comment names `created_at` to explain why it is
    // NOT touched — the assertion is that no statement writes or filters on it).
    expect(sql).not.toMatch(/'ABA'/);
    expect(sql).not.toMatch(/s\.status/);
    expect(sql).not.toMatch(/SET created_at|WHERE created_at|ORDER BY created_at/);
    expect(sql).not.toMatch(/INTERVAL|CURRENT_DATE|NOW\(\) -/);
  });

  it('signature and surface: no arguments, RETURNS jsonb, SECURITY DEFINER with pinned search_path, EXECUTE for service_role only', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.pipeline_refresh_insights_cache\(\)\s*RETURNS jsonb/);
    expect(sql).toMatch(/LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path = public, pg_temp/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.pipeline_refresh_insights_cache\(\)\s*FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.pipeline_refresh_insights_cache\(\)\s*TO service_role/);
  });

  it('the RPC is the story\'s only write to insights_cache, and 00017 writes nothing else — no series/series_game_scores touch, no edit to 00015', () => {
    expect(sql).not.toMatch(/(INSERT|UPDATE|DELETE)[\s\S]{0,40}FROM public\.series\b(?!\w)/);
    expect(sql).not.toMatch(/UPDATE public\.series/);
    expect(sql).not.toMatch(/DELETE FROM/);
    // The file that carries the census guard for the missing-league state.
    expect(sql).toMatch(/00017 guard league_column_present/);
  });

  it('the census the run prints is the server\'s own answer: population + the three counts, returned by the RPC', () => {
    const census = /RETURN jsonb_build_object\(\s*'total_game_sevens', v_total,\s*'home_team_wins', v_home_wins,\s*'game_6_winners_won', v_g6_winners_won,\s*'average_margin', v_avg\s*\)/;
    expect(sql).toMatch(census);
  });
});

describe('writer.ts — the sink member follows the established conventions', () => {
  const match = /async refreshInsights\(\) \{([\s\S]*?)\n    \}/.exec(writerSource);
  if (match === null) throw new Error('refreshInsights not found in writer.ts — the sink member did not land');
  const refreshBody = match;

  it('is one .rpc() call with no parameters (the RPC takes no arguments)', () => {
    expect(refreshBody[1]).toMatch(/client\.rpc\('pipeline_refresh_insights_cache'\)/);
    expect(refreshBody[1]).not.toMatch(/client\.rpc\('pipeline_refresh_insights_cache', *\{/);
  });

  it('throws on error AND on a null census — birth\'s second-throw convention, so a refresh can never report an empty line as success', () => {
    const body = refreshBody[1];
    expect(body).toMatch(/if \(error\) \{\s*throw new Error\(/);
    expect(body).toMatch(/if \(!census\) \{\s*throw new Error\(/);
    expect(body).toMatch(/return census/);
  });
});
