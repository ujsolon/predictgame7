import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EXPECTED_TEAM_COUNT, parseTeamsSeed } from '../../../supabase/scripts/pipeline/venueBackfill.ts';
import { getTeamLogo, isRecognizedTeam, resolveTeamLogoUrl } from '@/lib/team-logos';

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
  // seed migrations are the other source, which is exactly the agreement this
  // guard exists to protect: re-keying onto `TEAM_LOGO_ENTRIES` instead would be
  // circular, because the extractor two lines above reads its list out of that
  // same file, so a loop over it would assert a file agrees with itself.
  // `parseTeamsSeed` is the shared reader (deferred-work.md:343): the venue
  // probe and `00016`'s generator call the same function this test asserts, so
  // one regex serves all three and drift between copies cannot go unnoticed.
  const teamsSeedText =
    readFileSync(
      fileURLToPath(new URL('../../../supabase/migrations/00005_release_1_data_model.sql', import.meta.url)),
      'utf8'
    ) +
    readFileSync(
      fileURLToPath(new URL('../../../supabase/migrations/00007_backfill_missing_historical_series.sql', import.meta.url)),
      'utf8'
    );
  const seededAbbreviations = [...parseTeamsSeed(teamsSeedText, '00005 + 00007 teams seed').keys()];

  it('extracts every alias entry from the source (guards the regex harness itself)', () => {
    // Non-vacuity first: a reader that parsed nothing, and an extractor that
    // matched nothing, would both make the loop below pass by checking nothing.
    expect(seededAbbreviations).toHaveLength(EXPECTED_TEAM_COUNT);
    expect(aliasEntries.length).toBeGreaterThan(seededAbbreviations.length);

    // Every abbreviation the `teams` table seeds must also be a resolvable logo
    // alias — 30 current franchises (`00005`) plus 29 historical identities
    // (`00007`). A new era code with no alias entry is the drift this catches.
    for (const abbreviation of seededAbbreviations) {
      expect(aliasEntries).toContain(abbreviation);
    }
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
