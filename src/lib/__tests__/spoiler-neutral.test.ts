import { describe, expect, it } from 'vitest';

import { neutralPair, shouldSwapForNeutralOrder } from '@/lib/spoiler-neutral';
import { spoilerNeutralView, type SeriesView } from '@/pages/series/series-view';

const cavs = { id: 1, full_name: 'Cleveland Cavaliers', nickname: 'Cavaliers' };
const warriors = { id: 2, full_name: 'Golden State Warriors', nickname: 'Warriors' };

describe('spoiler-neutral team order (owner decision 2026-10-07)', () => {
  it('orders by nickname, case-insensitively, whatever the stored order', () => {
    expect(neutralPair(warriors, cavs)).toEqual([cavs, warriors]);
    expect(neutralPair(cavs, warriors)).toEqual([cavs, warriors]);
    expect(shouldSwapForNeutralOrder({ id: 3, full_name: 'X', nickname: 'spurs' }, { id: 4, full_name: 'Y', nickname: 'Thunder' })).toBe(false);
  });

  it('falls back to full name, then id, so the order is total', () => {
    const a = { id: 'b', full_name: 'Alpha Nets', nickname: 'Nets' };
    const b = { id: 'a', full_name: 'Beta Nets', nickname: 'Nets' };
    expect(neutralPair(b, a)).toEqual([a, b]);
    const c = { id: 'z', full_name: 'Same', nickname: null };
    const d = { id: 'y', full_name: 'Same', nickname: null };
    expect(neutralPair(c, d)).toEqual([d, c]);
  });

  it('swaps scores and per-game winners together with the teams', () => {
    const stored = {
      id: 's', year: 2016, round: 'Finals', league: 'NBA', phase: 'archive',
      teamA: warriors, teamB: cavs, winner: warriors, loser: cavs,
      games: [{ number: 1, scoreA: 104, scoreB: 89, winner: 'a' }],
    } as unknown as SeriesView;
    const v = spoilerNeutralView(stored);
    expect(v.teamA).toBe(cavs);
    expect(v.games[0]).toEqual({ number: 1, scoreA: 89, scoreB: 104, winner: 'b' });
    // Already-neutral input is returned untouched.
    expect(spoilerNeutralView(v)).toBe(v);
  });
});
