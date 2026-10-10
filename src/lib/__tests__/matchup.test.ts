import { describe, expect, it } from 'vitest';
import { homeFirstPair, matchupLabel } from '@/lib/matchup';

// Story 6.8: stored order (team_a first) is home-first since `00020`, and no
// surface re-sorts it. The pairs below are deliberately the ones the retired
// alphabetical rule would have swapped.
describe('matchup — one team order, home team first (Story 6.8)', () => {
  it('labels the two teams in the order given, never alphabetically', () => {
    expect(matchupLabel('Golden State Warriors', 'Cleveland Cavaliers')).toBe('Golden State Warriors vs Cleveland Cavaliers');
    expect(matchupLabel('Thunder', 'Spurs')).toBe('Thunder vs Spurs');
    expect(matchupLabel('OKC', 'SAS')).toBe('OKC vs SAS');
  });

  it('pairs a row as stored: team_a then team_b', () => {
    const gsw = { abbreviation: 'GSW' };
    const cle = { abbreviation: 'CLE' };
    expect(homeFirstPair({ team_a: gsw, team_b: cle })).toEqual([gsw, cle]);
    expect(homeFirstPair({ team_a: cle, team_b: gsw })).toEqual([cle, gsw]);
  });
});
