// One team order on every surface (Story 6.8, owner decision 2026-10-09,
// option C): since `00020` stored order is home-first, so the card's left side
// is `team_a` (the Game 7 host) and its right side `team_b` — never re-sorted.
// The retired E14 rule put the alphabetically-first nickname on the left. This
// file mocks only `renderCard` to read what the build step hands it; the real
// renderer is covered in `card.test.ts`.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SeriesGameScore } from '@/types/types';

const seen = vi.hoisted(() => ({ inputs: [] as unknown[] }));

vi.mock('../../scripts/og/card.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../scripts/og/card.ts')>();
  return {
    ...actual,
    renderCard: vi.fn(async (input: unknown) => {
      seen.inputs.push(input);
      return Buffer.from('png');
    }),
  };
});

import { runOgCards } from '../../scripts/og/render.ts';

const PUBLIC_DIR = resolve(__dirname, '../../public');
const scores = (games: number[]) => games.map((game_number) => ({ game_number }) as SeriesGameScore);

describe('runOgCards — stored (home-first) side order', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
    seen.inputs.length = 0;
  });

  it('puts team_a on the left and team_b on the right, even where the alphabet would swap them', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'og-order-'));
    dirs.push(dir);
    const code = await runOgCards({
      env: { VITE_SUPABASE_URL: 'https://example.invalid', VITE_SUPABASE_ANON_KEY: 'anon' },
      outDir: join(dir, 'og'),
      publicDir: PUBLIC_DIR,
      fetchSeries: async () => [
        {
          // The 2016 Finals as `00020` stores it: Warriors (the Game 7 host) as team_a,
          // the Cavaliers as winner — the home team is not the winner. Alphabetically the
          // Cavaliers come first, so the retired rule would have swapped them.
          id: 'gsw-first',
          year: 2016,
          round: 'Finals',
          winner_team_id: 1,
          team_a: { id: 2, full_name: 'Golden State Warriors', nickname: 'Warriors', abbreviation: 'GSW', logo_url: 'assets/teams/warriors.png' },
          team_b: { id: 1, full_name: 'Cleveland Cavaliers', nickname: 'Cavaliers', abbreviation: 'CLE', logo_url: 'assets/teams/cavaliers.png' },
          series_game_scores: scores([1, 2, 3, 4, 5, 6, 7]),
        },
      ],
      log: () => {},
      logError: () => {},
    });
    expect(code).toBe(0);
    const series = seen.inputs.find((i) => (i as { kind: string }).kind === 'series') as {
      teamA: { abbreviation: string };
      teamB: { abbreviation: string };
    };
    expect([series.teamA.abbreviation, series.teamB.abbreviation]).toEqual(['GSW', 'CLE']);
  }, 30_000);
});
