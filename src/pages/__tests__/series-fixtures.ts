// Real-shaped `SERIES_SELECT` rows for the Story 4.3 series-page suites.
// Most archived rows here predate the `00020` re-key and keep the old stored
// convention (a games 1–6 `home_team_id` naming the `team_a` slot, not a
// venue) — which is exactly why the pages map scores by team id and never
// print a venue. The pages show every row in stored order, `team_a` first
// (Story 6.8), so these rows exercise that order whatever it is;
// `flagship2016HomeFirst` is the 2016 Finals as `00020` actually stores it.
import type { Series, SeriesContentRow, SeriesGameScore, Team } from '@/types/types';

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

function series(
  id: string,
  year: number,
  round: string,
  league: string,
  a: Team,
  b: Team,
  winner: Team | null,
  games: Game[],
  isFeatured = false
): Series {
  return {
    id,
    year,
    round,
    league,
    team_a_id: a.id,
    team_b_id: b.id,
    winner_team_id: winner?.id ?? null,
    is_featured: isFeatured,
    created_at: '2026-09-22T00:00:00+00:00',
    updated_at: null,
    team_a: a,
    team_b: b,
    winner_team: winner ?? undefined,
    // Unordered on purpose: the page sorts by game number.
    series_game_scores: scores(id, games).reverse(),
  };
}

/** Flagship (`is_featured`): 2016 Finals. `team_a` = Cavaliers, every row's home side the team_a slot. */
export const FLAGSHIP_2016_ID = '06715a85-ec33-46a4-8383-d058055eefe6';
export const flagship2016 = series(
  FLAGSHIP_2016_ID,
  2016,
  'Finals',
  'NBA',
  CAVALIERS,
  WARRIORS,
  CAVALIERS,
  [
    [CAVALIERS, 89, WARRIORS, 104],
    [CAVALIERS, 77, WARRIORS, 110],
    [CAVALIERS, 120, WARRIORS, 90],
    [CAVALIERS, 97, WARRIORS, 108],
    [CAVALIERS, 112, WARRIORS, 97],
    [CAVALIERS, 115, WARRIORS, 101],
    [CAVALIERS, 93, WARRIORS, 89],
  ],
  true
);
/** The Game 7 score a preview must never carry. */
export const FLAGSHIP_2016_GAME7 = { cle: 93, gsw: 89 };

/**
 * The 2016 Finals as production stores it since `00020` (Story 6.10): the
 * Warriors — the Game 7 host — as `team_a`, every game's home side `team_a`
 * (games 1–6 by convention, Game 7 a real venue). Same scores per team as
 * `flagship2016`, on its own id. Alphabetically the Cavaliers come first, so
 * this row tells stored order from the retired E14 order (Story 6.8).
 */
export const FLAGSHIP_2016_HOME_FIRST_ID = '4f3e2d1c-0b9a-4c8d-9e7f-6a5b4c3d2e1f';
export const flagship2016HomeFirst = series(
  FLAGSHIP_2016_HOME_FIRST_ID,
  2016,
  'Finals',
  'NBA',
  WARRIORS,
  CAVALIERS,
  CAVALIERS,
  [
    [WARRIORS, 104, CAVALIERS, 89],
    [WARRIORS, 110, CAVALIERS, 77],
    [WARRIORS, 90, CAVALIERS, 120],
    [WARRIORS, 108, CAVALIERS, 97],
    [WARRIORS, 97, CAVALIERS, 112],
    [WARRIORS, 101, CAVALIERS, 115],
    [WARRIORS, 89, CAVALIERS, 93],
  ],
  true
);

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
 * Pending (no winner, certified 3–3) and `is_featured` — the 2026 Western
 * Conference Finals as its row was before its Game 7: the preview has no
 * reveal and `/result` is the 404 even for a featured series.
 */
export const PENDING_ID = '6ecb170c-e781-47f8-b7ee-881ba719d6d5';
export const pending2026 = series(
  PENDING_ID,
  2026,
  'Western Conference Finals',
  'NBA',
  THUNDER,
  SPURS,
  null,
  [
    [THUNDER, 122, SPURS, 116],
    [THUNDER, 101, SPURS, 108],
    [SPURS, 114, THUNDER, 106],
    [SPURS, 99, THUNDER, 105],
    [THUNDER, 117, SPURS, 102],
    [SPURS, 118, THUNDER, 110],
  ],
  true
);

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
 * Non-reconciling and **featured** (spread from the 2016 flagship, so
 * `is_featured` is true). `/result` answers a series that is not featured
 * with the plain 404 before looking at its phase, so only a featured row
 * that does not reconcile exercises `SeriesResultRoute`'s reported 404.
 */
export const BROKEN_FLAGSHIP_ID = 'dd4e81bc-0e10-4ad2-b2eb-8b1fbd8c5e0a';
export const brokenFlagship = {
  ...flagship2016,
  id: BROKEN_FLAGSHIP_ID,
  series_game_scores: flagship2016.series_game_scores?.slice(1),
};

// ---------------------------------------------------------------------------
// Story 4.5 · editorial content fixtures. Every string a test looks for is
// unique, so "absent from the page / file" is a plain substring check.

export const BEFORE_HEADLINE = 'Before-part headline: the Bay waits';
export const BEFORE_BODY_TEXT = 'Before-part write-up about games one through six.';
export const BEFORE_VIDEO_ID = 'BeforeVid01';
export const RESOLUTION_HEADLINE = 'Resolution-part headline: the block';
export const RESOLUTION_BODY_TEXT = 'Resolution-part write-up about the final minute.';
export const RESOLUTION_VIDEO_ID = 'ResolvVid02';

export function contentRows(seriesId: string): SeriesContentRow[] {
  return [
    {
      series_id: seriesId,
      part: 'before',
      headline: BEFORE_HEADLINE,
      body_md: `${BEFORE_BODY_TEXT}

![Game six huddle](editorial/before-huddle.jpg "Game 6 huddle")

See [the box scores](https://www.basketball-reference.com/).`,
      videos: [{ youtube_id: BEFORE_VIDEO_ID, title: 'Before-part video title', credit: 'Before Channel' }],
      updated_at: '2026-10-08T00:00:00+00:00',
    },
    {
      series_id: seriesId,
      part: 'resolution',
      headline: RESOLUTION_HEADLINE,
      body_md: RESOLUTION_BODY_TEXT,
      videos: [
        {
          youtube_id: RESOLUTION_VIDEO_ID,
          title: 'Resolution-part video title',
          credit: 'Resolution Channel',
          credit_url: 'https://www.youtube.com/@resolution',
        },
      ],
      updated_at: '2026-10-08T00:00:00+00:00',
    },
  ];
}

/** A featured archive series with both parts (the 2016 Finals, on its own id). */
export const CONTENT_FLAGSHIP_ID = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
export const contentFlagship: Series = { ...flagship2016, id: CONTENT_FLAGSHIP_ID, series_content: contentRows(CONTENT_FLAGSHIP_ID) };

/** A record (not featured) series with both parts (the 2018 ECF, on its own id). */
export const CONTENT_RECORD_ID = '8b2c3d4e-5f6a-4b7c-9d8e-0f1a2b3c4d5e';
export const contentRecord: Series = { ...nonFlagship2018, id: CONTENT_RECORD_ID, series_content: contentRows(CONTENT_RECORD_ID) };

/** A record series whose `before` part is invalid (bad youtube_id) and whose `resolution` is valid. */
export const INVALID_CONTENT_ID = '9c3d4e5f-6a7b-4c8d-8e9f-1a2b3c4d5e6f';
export const BAD_YOUTUBE_ID = 'not-an-id';
export const invalidContent: Series = {
  ...nonFlagship2018,
  id: INVALID_CONTENT_ID,
  series_content: contentRows(INVALID_CONTENT_ID).map((row) =>
    row.part === 'before' ? { ...row, videos: [{ youtube_id: BAD_YOUTUBE_ID, title: 'Broken video' }] } : row
  ),
};

export const FIXTURES: Record<string, Series> = {
  [FLAGSHIP_2016_ID]: flagship2016,
  [FLAGSHIP_2016_HOME_FIRST_ID]: flagship2016HomeFirst,
  [CONTENT_FLAGSHIP_ID]: contentFlagship,
  [CONTENT_RECORD_ID]: contentRecord,
  [INVALID_CONTENT_ID]: invalidContent,
  [NON_FLAGSHIP_ID]: nonFlagship2018,
  [ABA_ID]: aba1970,
  [PENDING_ID]: pending2026,
  [PENDING_NON_FLAGSHIP_ID]: pendingNonFlagship,
  [BROKEN_ID]: broken,
  [BROKEN_FLAGSHIP_ID]: brokenFlagship,
};
