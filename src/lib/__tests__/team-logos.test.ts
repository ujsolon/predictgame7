import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EXPECTED_TEAM_COUNT, parseTeamsSeed } from '../../../supabase/scripts/pipeline/venueBackfill.ts';
import { getAliasTeamCode, getTeamLogo, isRecognizedTeam, resolveTeamLogoUrl } from '@/lib/team-logos';

// Node environment (the vitest.config.ts default): pure logic over the alias
// map, no DOM. BASE_URL is stubbed to a SENTINEL, not the real config base
// ('/predictgame7/'): with the real value a hardcoded prefix would pass every
// assertion — the stub must be the only possible source of the prefix.
const BASE_URL = '/__base__/';

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv('BASE_URL', BASE_URL);
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('getTeamLogo — resolution table', () => {
  it('resolves a full team name, a nickname and an abbreviation to the same logo', () => {
    expect(getTeamLogo('Boston Celtics')).toBe(`${BASE_URL}assets/teams/celtics.png`);
    expect(getTeamLogo('Celtics')).toBe(`${BASE_URL}assets/teams/celtics.png`);
    expect(getTeamLogo('BOS')).toBe(`${BASE_URL}assets/teams/celtics.png`);
    expect(warn).not.toHaveBeenCalled();
  });

  it('matches aliases case-, space- and punctuation-insensitively, exact after normalization', () => {
    expect(getTeamLogo('boston celtics')).toBe(`${BASE_URL}assets/teams/celtics.png`);
    expect(getTeamLogo('  Boston   Celtics  ')).toBe(`${BASE_URL}assets/teams/celtics.png`);
    expect(getTeamLogo('bos')).toBe(`${BASE_URL}assets/teams/celtics.png`);
    expect(getTeamLogo('Golden State Warriors')).toBe(`${BASE_URL}assets/teams/warriors.png`);
    // '76ers' keeps its digits through normalization; a leading-zero query does not match it.
    expect(getTeamLogo('76ers')).toBe(`${BASE_URL}assets/teams/76ers.png`);
    expect(getTeamLogo('Sixers')).toBe(`${BASE_URL}assets/teams/76ers.png`);
    expect(warn).not.toHaveBeenCalled();
  });

  it('returns the generic placeholder entries for the Story 1.3 fallback names', () => {
    expect(getTeamLogo('Team A')).toBe(`${BASE_URL}assets/teams/teama.png`);
    expect(getTeamLogo('Team B')).toBe(`${BASE_URL}assets/teams/teamb.png`);
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns once and returns undefined for an unrecognized team; stays silent for blank input', () => {
    expect(getTeamLogo('Nowhere FC')).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('Logo not found for team: "Nowhere FC".');

    warn.mockClear();
    expect(getTeamLogo('')).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it('does not match near misses that only share a prefix with an alias', () => {
    // Normalization is exact-after-strip, not substring or fuzzy matching.
    expect(getTeamLogo('Celtic')).toBeUndefined();
    expect(getTeamLogo('Los Angeles')).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

describe('isRecognizedTeam', () => {
  // Every alias literal in the source must agree across both surfaces:
  // recognized by the predicate AND resolvable by getTeamLogo — which also
  // proves the predicate is the warn-free door to the same map.
  const source = readFileSync(
    fileURLToPath(new URL('../team-logos.ts', import.meta.url)),
    'utf8'
  );
  const aliasEntries = [...source.matchAll(/aliases:\s*\[([^\]]*)\]/g)].flatMap((group) =>
    [...group[1].matchAll(/(["'])([^"']+)\1/g)].map((alias) => alias[2])
  );

  // Story 2.11 re-keyed the oracle below onto the **database**. Until this
  // change it iterated `Object.values(TEAM_ABBREVIATIONS)`, the hardcoded
  // name→code map the story deleted — and an empty object would have kept the
  // case green while checking nothing at all (its AC 5 names that failure). The
  // migrations are the other source, which is exactly the agreement this guard
  // exists to protect: re-keying onto `TEAM_LOGO_ENTRIES` instead would be
  // circular, because the extractor two lines above reads its list out of that
  // same file, so a loop over it would assert a file agrees with itself.
  //
  // Story 6.8 widened it from the `00005` + `00007` seeds to **every**
  // `INSERT INTO [public.]teams` statement across `supabase/migrations/*.sql`,
  // so a team a later migration adds (`00021`'s Pittsburgh Pipers, written as
  // `INSERT … SELECT 61, 'Pittsburgh Pipers', 'PTP', …`) cannot go unseen. Its
  // count is its own: the shared `parseTeamsSeed` (`venueBackfill.ts`) keeps its
  // 59-row pin over the two seeds, which `00016`'s generator still relies on,
  // and is cross-checked below as a subset of this wider read.
  const MIGRATION_TEAM_COUNT = 60;
  const migrationsDir = fileURLToPath(new URL('../../../supabase/migrations/', import.meta.url));
  const migrationText = (name: string) => readFileSync(join(migrationsDir, name), 'utf8');
  const migrationFiles = readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  // One statement per match: from `INSERT INTO teams` / `public.teams` to its `;`.
  // A row is `(id, 'full_name', 'CODE'` in a VALUES list or `SELECT id, 'full_name', 'CODE'`.
  const insertedTeams = migrationFiles.flatMap((name) =>
    [...migrationText(name).matchAll(/INSERT\s+INTO\s+(?:public\.)?teams\b[^;]*;/gi)].flatMap((statement) =>
      [...statement[0].matchAll(/(?:\(|\bSELECT)\s*(\d+),\s*'((?:[^']|'')+)',\s*'([A-Z]{2,4})'/g)].map((match) => ({
        id: Number(match[1]),
        name: match[2].replace(/''/g, "'"),
        code: match[3],
        file: name,
      }))
    )
  );
  const insertedAbbreviations = insertedTeams.map((team) => team.code);

  it('reads every teams insert across the migrations, 00021 included', () => {
    expect(insertedTeams).toHaveLength(MIGRATION_TEAM_COUNT);
    expect(new Set(insertedAbbreviations).size).toBe(MIGRATION_TEAM_COUNT);
    expect(new Set(insertedTeams.map((team) => team.id)).size).toBe(MIGRATION_TEAM_COUNT);
    expect(insertedTeams.find((team) => team.code === 'PTP')).toMatchObject({
      id: 61,
      name: 'Pittsburgh Pipers',
      file: '00021_add_1968_aba_finals.sql',
    });
    // The shared 59-row reader still agrees with this one over the two seeds.
    const seed = parseTeamsSeed(
      migrationText('00005_release_1_data_model.sql') + migrationText('00007_backfill_missing_historical_series.sql'),
      '00005 + 00007 teams seed'
    );
    expect(seed.size).toBe(EXPECTED_TEAM_COUNT);
    for (const [code, id] of seed) {
      expect(insertedTeams.find((team) => team.code === code)?.id).toBe(id);
    }
  });

  it('resolves every inserted teams.abbreviation to a logo alias (migrations → alias coverage)', () => {
    // Non-vacuity first: a reader that parsed nothing, and an extractor that
    // matched nothing, would both make the loop below pass by checking nothing.
    expect(insertedAbbreviations).toHaveLength(MIGRATION_TEAM_COUNT);
    expect(aliasEntries.length).toBeGreaterThan(insertedAbbreviations.length);

    // Every abbreviation a migration inserts into `teams` must also be a
    // resolvable logo alias — 30 current franchises (`00005`), 29 historical
    // identities (`00007`) and PTP (`00021`). A new era code with no alias
    // entry is the drift this catches.
    for (const abbreviation of insertedAbbreviations) {
      expect(aliasEntries).toContain(abbreviation);
    }
  });

  // Owner decision U16 (2026-10-05): the custom form prints the code of the
  // team whose logo the typed text shows, read from each entry's last alias.
  // That is only safe if the table pairs every inserted name with **its own**
  // stored code, and if no normalized alias sits under two entries (the Map
  // would keep the last silently, and the logo and code could then name
  // different teams). Both are pinned against the migrations, not against this file.
  it('pairs every inserted full_name with its own stored code (U16)', () => {
    expect(insertedTeams).toHaveLength(MIGRATION_TEAM_COUNT);
    for (const team of insertedTeams) {
      expect(getAliasTeamCode(team.name)).toBe(team.code);
      expect(getAliasTeamCode(team.code)).toBe(team.code);
    }
    expect(getAliasTeamCode('Team A')).toBe('TMA');
    expect(getAliasTeamCode('Team B')).toBe('TMB');
    expect(getAliasTeamCode('Nowhere FC')).toBeUndefined();
    expect(getAliasTeamCode('')).toBeUndefined();
  });

  it('keeps a bare "Pipers" with Minnesota; "Pittsburgh Pipers" and "PTP" resolve to Pittsburgh (owner decision 2026-10-10, 1a)', () => {
    expect(getAliasTeamCode('Pipers')).toBe('MNP');
    expect(getTeamLogo('Pipers')).toBe(`${BASE_URL}assets/teams/minnesota_pipers_1969.webp`);
    for (const typed of ['Pittsburgh Pipers', 'PTP', 'pittsburgh pipers', 'ptp']) {
      expect(getAliasTeamCode(typed)).toBe('PTP');
      expect(getTeamLogo(typed)).toBe(`${BASE_URL}assets/teams/Pittsburgh_Pipers.gif`);
    }
    expect(warn).not.toHaveBeenCalled();
  });

  it('files no normalized alias under two entries (U16)', () => {
    const normalized = aliasEntries.map((alias) => alias.toLowerCase().replace(/[^a-z0-9]+/g, ''));
    const repeated = normalized.filter((alias, index) => normalized.indexOf(alias) !== index);
    expect(repeated).toEqual([]);
  });

  it('agrees with getTeamLogo on every alias entry, warning nowhere', () => {
    for (const alias of aliasEntries) {
      expect(isRecognizedTeam(alias)).toBe(true);
      expect(getTeamLogo(alias)).toBeDefined();
    }
    expect(warn).not.toHaveBeenCalled();
  });

  it('is side-effect-free on names getTeamLogo would warn about', () => {
    expect(isRecognizedTeam('Nowhere FC')).toBe(false);
    expect(isRecognizedTeam('')).toBe(false);
    expect(isRecognizedTeam('   ')).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it('normalizes the same way getTeamLogo does', () => {
    expect(isRecognizedTeam('  b-o-s ')).toBe(true);
    expect(isRecognizedTeam('MIAMI HEAT')).toBe(true);
  });
});

describe('resolveTeamLogoUrl', () => {
  it('passes absolute and protocol-relative URLs through untouched', () => {
    expect(resolveTeamLogoUrl('https://cdn.example/logo.png')).toBe('https://cdn.example/logo.png');
    expect(resolveTeamLogoUrl('http://cdn.example/logo.png')).toBe('http://cdn.example/logo.png');
    expect(resolveTeamLogoUrl('//cdn.example/logo.png')).toBe('//cdn.example/logo.png');
  });

  it('prefixes relative paths with BASE_URL exactly once', () => {
    expect(resolveTeamLogoUrl('assets/teams/heat.png')).toBe(`${BASE_URL}assets/teams/heat.png`);
    expect(resolveTeamLogoUrl('/assets/teams/heat.png')).toBe(`${BASE_URL}assets/teams/heat.png`);
  });

  it('returns undefined for nullish input', () => {
    expect(resolveTeamLogoUrl(undefined)).toBeUndefined();
    expect(resolveTeamLogoUrl(null)).toBeUndefined();
  });
});
