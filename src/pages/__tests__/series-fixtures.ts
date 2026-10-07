// Real-shaped `SERIES_SELECT` rows for the Story 4.3 series-page suites.
// Archived rows follow the stored convention: outside Game 7 of an NBA/BAA
// series, `home_team_id` is a winner-slot fiction (AGENTS.md, migration
// `00016`) — which is exactly why the pages map scores by team id and never
// print a venue.
import type { Series, SeriesGameScore, Team } from '@/types/types';

function team(id: number, full_name: string, nickname: string, abbreviation: string, city: string): Team {
  return { id, full_name, nickname, abbreviation, city, logo_url: null, created_at: '2026-09-22T00:00:00+00:00', updated_at: null };
}

export const CAVALIERS = team(5, 'Cleveland Cavaliers', 'Cavaliers', 'CLE', 'Cleveland');
export const WARRIORS = team(10, 'Golden State Warriors', 'Warriors', 'GSW', 'Golden State');
export const CELTICS = team(2, 'Boston Celtics', 'Celtics', 'BOS', 'Boston');
export const THUNDER = team(21, 'Oklahoma City Thunder', 'Thunder', 'OKC', 'Oklahoma City');
export const SPURS = team(27, 'San Antonio Spurs', 'Spurs', 'SAS', 'San Antonio');
export const ROCKETS = team(140, 'Denver Rockets', 'Rockets', 'DNR', 'Denver');
export const CAPS = team(141, 'Washington Caps', 'Caps', 'WSC', 'Washington');

type Game = [home: Team, homeScore: number, away: Team, awayScore: number];

function scores(seriesId: string, games: Game[]): SeriesGameScore[] {
  return games.map(([home, homeScore, away, awayScore], i) => ({
    id: `${seriesId.slice(0, 8)}-g${i + 1}`,
    series_id: seriesId,
    game_number: i + 1,
    home_team_id: home.id,
    away_team_id: away.id,
    home_score: homeScore,
    away_score: awayScore,
    winner_team_id: homeScore > awayScore ? home.id : away.id,
    created_at: '2026-09-22T00:00:00+00:00',
  }));
}

function series(id: string, year: number, round: string, league: string, a: Team, b: Team, winner: Team | null, games: Game[]): Series {
  return {
    id,
    year,
    round,
    league,
    team_a_id: a.id,
    team_b_id: b.id,
    winner_team_id: winner?.id ?? null,
    created_at: '2026-09-22T00:00:00+00:00',
    updated_at: null,
    team_a: a,
    team_b: b,
    winner_team: winner ?? undefined,
    // Unordered on purpose: the page sorts by game number.
    series_game_scores: scores(id, games).reverse(),
  };
}

/** Flagship (pinned): 2016 Finals. `team_a` = Cavaliers, every row's home side the team_a slot. */
export const FLAGSHIP_2016_ID = '06715a85-ec33-46a4-8383-d058055eefe6';
export const flagship2016 = series(FLAGSHIP_2016_ID, 2016, 'Finals', 'NBA', CAVALIERS, WARRIORS, CAVALIERS, [
  [CAVALIERS, 89, WARRIORS, 104],
  [CAVALIERS, 77, WARRIORS, 110],
  [CAVALIERS, 120, WARRIORS, 90],
  [CAVALIERS, 97, WARRIORS, 108],
  [CAVALIERS, 112, WARRIORS, 97],
  [CAVALIERS, 115, WARRIORS, 101],
  [CAVALIERS, 93, WARRIORS, 89],
]);
/** The Game 7 score a preview must never carry. */
export const FLAGSHIP_2016_GAME7 = { cle: 93, gsw: 89 };

/**
 * Non-flagship archive: 2018 Eastern Conference Finals, Cavaliers over
 * Celtics. `team_a` is the LOSER here and home sides alternate, so the
 * score-by-team-id mapping is exercised in both directions.
 */
export const NON_FLAGSHIP_ID = '3c1d2e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
export const nonFlagship2018 = series(NON_FLAGSHIP_ID, 2018, 'Eastern Conference Finals', 'NBA', CELTICS, CAVALIERS, CAVALIERS, [
  [CELTICS, 108, CAVALIERS, 83],
  [CELTICS, 107, CAVALIERS, 94],
  [CAVALIERS, 116, CELTICS, 86],
  [CAVALIERS, 111, CELTICS, 102],
  [CELTICS, 96, CAVALIERS, 83],
  [CAVALIERS, 109, CELTICS, 99],
  [CELTICS, 79, CAVALIERS, 87],
]);

/** ABA archive (non-flagship): 1970 Western Division Semifinals. */
export const ABA_ID = '9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d';
export const aba1970 = series(ABA_ID, 1970, 'Western Division Semifinals', 'ABA', ROCKETS, CAPS, ROCKETS, [
  [ROCKETS, 130, CAPS, 111],
  [ROCKETS, 128, CAPS, 116],
  [ROCKETS, 112, CAPS, 125],
  [ROCKETS, 118, CAPS, 121],
  [ROCKETS, 131, CAPS, 113],
  [ROCKETS, 109, CAPS, 127],
  [ROCKETS, 143, CAPS, 119],
]);

/**
 * Pending (no winner, certified 3–3) — using a pinned flagship id, as the
 * 2026 Western Conference Finals row was before its Game 7: the preview has
 * no reveal and `/result` is the 404 even for a flagship.
 */
export const PENDING_ID = '6ecb170c-e781-47f8-b7ee-881ba719d6d5';
export const pending2026 = series(PENDING_ID, 2026, 'Western Conference Finals', 'NBA', THUNDER, SPURS, null, [
  [THUNDER, 122, SPURS, 116],
  [THUNDER, 101, SPURS, 108],
  [SPURS, 114, THUNDER, 106],
  [SPURS, 99, THUNDER, 105],
  [THUNDER, 117, SPURS, 102],
  [SPURS, 118, THUNDER, 110],
]);

/** Pending (no winner, certified 3–3) on a NON-flagship id: preview without a reveal, `/result` 404 with no request. */
export const PENDING_NON_FLAGSHIP_ID = '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a';
export const pendingNonFlagship = series(PENDING_NON_FLAGSHIP_ID, 2027, 'Eastern Conference First Round', 'NBA', CELTICS, CAVALIERS, null, [
  [CELTICS, 110, CAVALIERS, 101],
  [CELTICS, 98, CAVALIERS, 104],
  [CAVALIERS, 112, CELTICS, 107],
  [CAVALIERS, 95, CELTICS, 103],
  [CELTICS, 118, CAVALIERS, 109],
  [CAVALIERS, 106, CELTICS, 99],
]);

/** Non-reconciling: a winner with only six score rows (`deriveSeriesPhase` → null). */
export const BROKEN_ID = '1f2e3d4c-5b6a-4978-8a9b-0c1d2e3f4a5b';
export const broken = { ...nonFlagship2018, id: BROKEN_ID, series_game_scores: nonFlagship2018.series_game_scores?.slice(1) };

/**
 * Non-reconciling on a **flagship** id (the pinned 2013 Finals). `BROKEN_ID`
 * is non-flagship, so `/result` short-circuits before any request and never
 * reaches `SeriesResultRoute`'s unshowable branch — only a flagship id fetches
 * there, and only a flagship row that does not reconcile exercises its report.
 */
export const BROKEN_FLAGSHIP_ID = 'dd4e81bc-0e10-4ad2-b2eb-8b1fbd8c5e0a';
export const brokenFlagship = {
  ...flagship2016,
  id: BROKEN_FLAGSHIP_ID,
  series_game_scores: flagship2016.series_game_scores?.slice(1),
};

export const FIXTURES: Record<string, Series> = {
  [FLAGSHIP_2016_ID]: flagship2016,
  [NON_FLAGSHIP_ID]: nonFlagship2018,
  [ABA_ID]: aba1970,
  [PENDING_ID]: pending2026,
  [PENDING_NON_FLAGSHIP_ID]: pendingNonFlagship,
  [BROKEN_ID]: broken,
  [BROKEN_FLAGSHIP_ID]: brokenFlagship,
};
