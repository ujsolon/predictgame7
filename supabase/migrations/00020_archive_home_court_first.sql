-- =========================================================
-- Predict Game 7 — Re-key the archive to home-court first
-- Migration 00020 (Story 6.10)
-- =========================================================
-- Owner decision 2026-10-09: the stored first team of an archived series is
-- the HOME-COURT team, i.e. the real Game 7 host. Before this migration the
-- archive's team_a is a winner slot (00007's winner-first backfill), so in 48
-- archived series team_a is the Game 7 VISITOR:
--   - 42 NBA/BAA series (measured live 2026-10-09) whose Game 7 home_team_id —
--     a real venue since 00016 — is not team_a_id;
--   - 6 ABA series named by supabase/scripts/pipeline/data/aba_game7_venues.csv
--     (Story 6.9), whose game7_home_team is the stored team_b.
--
-- For exactly those 48 series, in this one transaction:
--   - team_a_id <-> team_b_id are exchanged;
--   - games 1-6 exchange home_team_id <-> away_team_id TOGETHER WITH
--     home_score <-> away_score, so every team keeps its own score. Every
--     candidate is a spreadsheet-sourced row whose games 1-6 all name team_a
--     as home (guard candidate_shape), so they still do after the swap;
--   - Game 7 does the same for the 6 ABA series only (their Game 7 rows were
--     winner-fiction and become the real venue). NBA/BAA Game 7 rows are real
--     since 00016 and are not written.
-- Nothing else is written: winner_team_id (both tables), ids, created_at,
-- round, year, league and is_featured are untouched, and the post-condition
-- guards prove it rather than assert it.
--
-- Games 1-6: for the 177 spreadsheet-sourced archive rows the home side is a
-- CONVENTION (home side = team_a), not a measured venue. Pipeline-born series
-- (today only the 2026 Western Conference Finals, stored OKC-first) carry REAL
-- per-game venues, so their games 2-6 alternate (2026 WCF games 3, 4, 6 are
-- SAS-home); they are already home-court first and are never candidates.
-- After this migration, for all 178 archived series: team_a = the Game 7
-- host, the Game 7 venue is real, and game 1's home side is team_a (plan.ts's
-- "team_a is game 1's home team" assertion).
--
-- The pinned counts (178 archived, 160 NBA/BAA, 42 + 6 candidates, 117 and 12
-- home wins) are the 2026-10-09 measurement. They expire when any series is
-- archived, so apply 00020 before 00021 or any newly archived series.
--
-- Idempotent: a second application finds 0 NBA/BAA and 0 ABA candidates,
-- writes nothing, and passes every guard.
--
-- Guard style mirrors 00016 (raise-to-abort, ERRCODE 23514, one BEGIN/COMMIT).
-- Every guard is observed firing under its own tamper in
-- scripts/rehearse-migration-00014.mjs (section 9). The ABA tuples below are
-- pinned to the CSV by tests/pipeline/archive-home-court-first.test.ts.

BEGIN;

-- No pipeline write may interleave with the measurement and the swap.
LOCK TABLE public.series, public.series_game_scores IN SHARE ROW EXCLUSIVE MODE;

-- The six ABA series to re-key, as (year, stored team_a, stored team_b) — the
-- rows of aba_game7_venues.csv whose game7_home_team is team_b. Each is
-- resolved by (year, unordered pair), so a re-apply still finds it (stored
-- the other way round, and therefore not a candidate).
CREATE TEMP TABLE aba_home_court_swap (year integer, team_a text, team_b text) ON COMMIT DROP;
INSERT INTO aba_home_court_swap (year, team_a, team_b) VALUES
  (1971, 'UTS', 'IND'),
  (1972, 'IND', 'UTS'),
  (1972, 'NYN', 'VAS'),
  (1973, 'IND', 'KEN'),
  (1973, 'KEN', 'CAC'),
  (1975, 'IND', 'DEN');

-- Pre-state snapshots for the post-condition guards.
-- (a) per-team scores: the multiset of (series_id, game_number, team_id, score).
CREATE TEMP TABLE pre_00020_team_scores ON COMMIT DROP AS
  SELECT g.series_id, g.game_number, g.home_team_id AS team_id, g.home_score AS score FROM public.series_game_scores g
  UNION ALL
  SELECT g.series_id, g.game_number, g.away_team_id, g.away_score FROM public.series_game_scores g;
-- (b) winners: the series winner and every game row's winner.
CREATE TEMP TABLE pre_00020_winners ON COMMIT DROP AS
  SELECT s.id AS series_id, 0 AS game_number, s.winner_team_id FROM public.series s
  UNION ALL
  SELECT g.series_id, g.game_number, g.winner_team_id FROM public.series_game_scores g;
-- (c) every other column of both tables (ids, created_at, year, round, league,
--     is_featured, ...): the whole row minus the columns this migration may write.
CREATE TEMP TABLE pre_00020_identity ON COMMIT DROP AS
  SELECT to_jsonb(s) - 'team_a_id' - 'team_b_id' - 'winner_team_id' AS row_image FROM public.series s
  UNION ALL
  SELECT to_jsonb(g) - 'home_team_id' - 'away_team_id' - 'home_score' - 'away_score' - 'winner_team_id' FROM public.series_game_scores g;

-- Guard aba_tuple_match: every ABA tuple resolves to exactly one archived ABA
-- series by (year, unordered pair). Zero is a mis-keyed tuple; two is a
-- slot-swapped twin.
DO $guard$
DECLARE
  v_row record;
  v_matches integer;
  v_aba integer;
BEGIN
  FOR v_row IN SELECT t.year, t.team_a, t.team_b FROM aba_home_court_swap t ORDER BY t.year, t.team_a LOOP
    SELECT count(*), count(*) FILTER (WHERE s.league = 'ABA' AND s.winner_team_id IS NOT NULL)
      INTO v_matches, v_aba
      FROM public.series s
      JOIN public.teams ta ON ta.id = s.team_a_id
      JOIN public.teams tb ON tb.id = s.team_b_id
     WHERE s.year = v_row.year
       AND ((ta.abbreviation = v_row.team_a AND tb.abbreviation = v_row.team_b)
         OR (ta.abbreviation = v_row.team_b AND tb.abbreviation = v_row.team_a));
    IF v_matches <> 1 OR v_aba <> 1 THEN
      RAISE EXCEPTION '00020 guard aba_tuple_match: ABA tuple (%, %, %) matches % series (% of them archived ABA) — expected exactly one archived ABA series',
        v_row.year, v_row.team_a, v_row.team_b, v_matches, v_aba
        USING ERRCODE = '23514';
    END IF;
  END LOOP;
END
$guard$;

-- The swap set, computed — never guessed.
CREATE TEMP TABLE home_court_swap_set (series_id uuid PRIMARY KEY, league text NOT NULL) ON COMMIT DROP;

-- NBA/BAA: archived series whose Game 7 host (real since 00016) is not team_a.
INSERT INTO home_court_swap_set (series_id, league)
SELECT s.id, s.league
  FROM public.series s
  JOIN public.series_game_scores g7 ON g7.series_id = s.id AND g7.game_number = 7
 WHERE s.league IN ('NBA', 'BAA')
   AND s.winner_team_id IS NOT NULL
   AND g7.home_team_id <> s.team_a_id;

-- ABA: the tuple's series while it is still stored in the tuple's order
-- (team_a = the Game 7 visitor). Once re-keyed it is stored the other way
-- round and is no longer a candidate — that is what makes a re-apply a no-op.
INSERT INTO home_court_swap_set (series_id, league)
SELECT s.id, s.league
  FROM aba_home_court_swap t
  JOIN public.teams ta ON ta.abbreviation = t.team_a
  JOIN public.teams tb ON tb.abbreviation = t.team_b
  JOIN public.series s ON s.year = t.year AND s.team_a_id = ta.id AND s.team_b_id = tb.id
 WHERE s.league = 'ABA'
   AND s.winner_team_id IS NOT NULL;

-- Guard swap_count: exactly 42 NBA/BAA + 6 ABA candidates on the first apply,
-- or 0 + 0 on a re-apply. Anything else aborts naming both counts.
DO $guard$
DECLARE
  c_expected_nba_baa CONSTANT integer := 42;
  c_expected_aba CONSTANT integer := 6;
  v_nba_baa integer;
  v_aba integer;
BEGIN
  SELECT count(*) FILTER (WHERE league IN ('NBA', 'BAA')), count(*) FILTER (WHERE league = 'ABA')
    INTO v_nba_baa, v_aba
    FROM home_court_swap_set;
  IF (v_nba_baa, v_aba) = (c_expected_nba_baa, c_expected_aba) THEN
    RAISE NOTICE '00020: re-keying % NBA/BAA + % ABA archived series to home-court first', v_nba_baa, v_aba;
  ELSIF (v_nba_baa, v_aba) = (0, 0) THEN
    RAISE NOTICE '00020: 0 NBA/BAA + 0 ABA candidates — the archive is already home-court first; no row is written';
  ELSE
    RAISE EXCEPTION '00020 guard swap_count: found % NBA/BAA and % ABA candidate series — expected exactly % + % (first apply) or 0 + 0 (re-apply). The archive changed since the 2026-10-09 measurement (a newly archived series, or 00021 applied first): re-measure and regenerate this migration before applying — apply 00020 before 00021 or any newly archived series. Do not relax this guard',
      v_nba_baa, v_aba, c_expected_nba_baa, c_expected_aba
      USING ERRCODE = '23514';
  END IF;
END
$guard$;

-- Guard candidate_shape: every candidate arrives in the spreadsheet-sourced
-- fiction shape the swap assumes — games 1-6 ALL home = team_a, and Game 7
-- home = team_b for an NBA/BAA candidate (the real host, since 00016) or
-- team_a for an ABA candidate (the winner-fiction row this migration makes
-- real). Any candidate in another state is refused, never rewritten; the
-- abort names the total count and the first offender.
DO $guard$
DECLARE
  v_bad integer;
  v record;
BEGIN
  CREATE TEMP TABLE candidate_shape_bad ON COMMIT DROP AS
  SELECT s.id, s.year, ta.abbreviation AS a, tb.abbreviation AS b, w.league,
         (SELECT count(*) FROM public.series_game_scores g
           WHERE g.series_id = s.id AND g.game_number BETWEEN 1 AND 6 AND g.home_team_id = s.team_a_id) AS g16_team_a_home,
         h7.abbreviation AS g7_home
    FROM home_court_swap_set w
    JOIN public.series s ON s.id = w.series_id
    JOIN public.teams ta ON ta.id = s.team_a_id
    JOIN public.teams tb ON tb.id = s.team_b_id
    LEFT JOIN public.series_game_scores g7 ON g7.series_id = s.id AND g7.game_number = 7
    LEFT JOIN public.teams h7 ON h7.id = g7.home_team_id
   WHERE (SELECT count(*) FROM public.series_game_scores g
           WHERE g.series_id = s.id AND g.game_number BETWEEN 1 AND 6 AND g.home_team_id = s.team_a_id) <> 6
      OR (w.league IN ('NBA', 'BAA') AND g7.home_team_id IS DISTINCT FROM s.team_b_id)
      OR (w.league = 'ABA' AND g7.home_team_id IS DISTINCT FROM s.team_a_id);
  SELECT count(*) INTO v_bad FROM candidate_shape_bad;
  IF v_bad <> 0 THEN
    SELECT * INTO v FROM candidate_shape_bad ORDER BY year, a LIMIT 1;
    RAISE EXCEPTION '00020 guard candidate_shape: % candidate series are not in the expected pre-swap shape (e.g. series % (% vs %, %): % of games 1-6 home = team_a, Game 7 home %) — expected all 6 of games 1-6 home = team_a and Game 7 home = team_b (NBA/BAA real host) or team_a (ABA winner-fiction); refusing to swap',
      v_bad, v.year, v.a, v.b, v.league, v.g16_team_a_home, coalesce(v.g7_home, '(none)')
      USING ERRCODE = '23514';
  END IF;
END
$guard$;

-- The re-key. Postgres evaluates every SET expression against the pre-update
-- row, so each exchange is atomic within its statement.
UPDATE public.series s
   SET team_a_id = s.team_b_id,
       team_b_id = s.team_a_id
  FROM home_court_swap_set w
 WHERE s.id = w.series_id;

UPDATE public.series_game_scores g
   SET home_team_id = g.away_team_id,
       away_team_id = g.home_team_id,
       home_score = g.away_score,
       away_score = g.home_score
  FROM home_court_swap_set w
 WHERE g.series_id = w.series_id
   AND (g.game_number BETWEEN 1 AND 6
     OR (g.game_number = 7 AND w.league = 'ABA'));

-- ==== 00020 POST-CONDITIONS ====
-- Each guard below aborts the whole transaction. The rehearsal injects a
-- corruption just above this line to observe each one firing.

-- Guard game1_home_is_team_a: for all 178 archived series, game 1's home side
-- is team_a (plan.ts's game-1-home assertion survives the re-key). The 178 is
-- the 2026-10-09 archive size.
DO $guard$
DECLARE
  v_archived integer;
  v_bad integer;
BEGIN
  SELECT count(*) INTO v_archived FROM public.series WHERE winner_team_id IS NOT NULL;
  SELECT count(*) INTO v_bad
    FROM public.series s
   WHERE s.winner_team_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.series_game_scores g
        WHERE g.series_id = s.id AND g.game_number = 1 AND g.home_team_id = s.team_a_id);
  IF v_archived <> 178 OR v_bad <> 0 THEN
    RAISE EXCEPTION '00020 guard game1_home_is_team_a: % of % archived series have a game 1 whose home side is not team_a — expected 0 of exactly 178 archived series. The archive changed since the 2026-10-09 measurement: re-measure and regenerate this migration before applying — apply 00020 before 00021 or any newly archived series',
      v_bad, v_archived
      USING ERRCODE = '23514';
  END IF;
END
$guard$;

-- Guard game7_home_is_team_a: for all 178 archived series, the Game 7 host is
-- team_a — the definition of home-court first.
DO $guard$
DECLARE
  v_archived integer;
  v_bad integer;
BEGIN
  SELECT count(*) INTO v_archived FROM public.series WHERE winner_team_id IS NOT NULL;
  SELECT count(*) INTO v_bad
    FROM public.series s
   WHERE s.winner_team_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.series_game_scores g
        WHERE g.series_id = s.id AND g.game_number = 7 AND g.home_team_id = s.team_a_id);
  IF v_archived <> 178 OR v_bad <> 0 THEN
    RAISE EXCEPTION '00020 guard game7_home_is_team_a: % of % archived series have a Game 7 whose home side is not team_a — expected 0 of exactly 178 archived series. The archive changed since the 2026-10-09 measurement: re-measure and regenerate this migration before applying — apply 00020 before 00021 or any newly archived series',
      v_bad, v_archived
      USING ERRCODE = '23514';
  END IF;
END
$guard$;

-- Guard swapped_games_1_6_home_is_team_a: every re-keyed series has ALL of
-- games 1-6 home = its new team_a (the spreadsheet-row convention, restated
-- for the new slot order). Pipeline-born series with real per-game venues are
-- never candidates, so this reads only the swap set.
DO $guard$
DECLARE
  v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
    FROM home_court_swap_set w
    JOIN public.series s ON s.id = w.series_id
    JOIN public.series_game_scores g ON g.series_id = s.id AND g.game_number BETWEEN 1 AND 6
   WHERE g.home_team_id <> s.team_a_id;
  IF v_bad <> 0 THEN
    RAISE EXCEPTION '00020 guard swapped_games_1_6_home_is_team_a: % game 1-6 rows of re-keyed series do not name the new team_a as home — the swap left a game behind',
      v_bad
      USING ERRCODE = '23514';
  END IF;
END
$guard$;

-- Guard game7_home_win_census: the NBA/BAA Game 7 home-win census is still
-- 117 of 160 (nba.com's published 117-43; 00016's checksum). NBA/BAA Game 7
-- rows are not written, so a move here is a corruption.
DO $guard$
DECLARE
  v_home_wins integer;
  v_population integer;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE g.home_score > g.away_score)
    INTO v_population, v_home_wins
    FROM public.series_game_scores g
    JOIN public.series s ON s.id = g.series_id
   WHERE g.game_number = 7
     AND s.league IN ('NBA', 'BAA')
     AND s.winner_team_id IS NOT NULL;
  IF v_population <> 160 OR v_home_wins <> 117 THEN
    RAISE EXCEPTION '00020 guard game7_home_win_census: NBA/BAA Game 7 home wins = % of %, expected exactly 117 of 160 (a population other than 160 means: The archive changed since the 2026-10-09 measurement: re-measure and regenerate this migration before applying — apply 00020 before 00021 or any newly archived series)',
      v_home_wins, v_population
      USING ERRCODE = '23514';
  END IF;
END
$guard$;

-- Guard aba_game7_home_win_census: the 18 ABA Game 7s, now at their real
-- venues, read 12 home wins of 18 (Story 6.9's 12-6).
DO $guard$
DECLARE
  v_home_wins integer;
  v_population integer;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE g.home_score > g.away_score)
    INTO v_population, v_home_wins
    FROM public.series_game_scores g
    JOIN public.series s ON s.id = g.series_id
   WHERE g.game_number = 7
     AND s.league = 'ABA'
     AND s.winner_team_id IS NOT NULL;
  IF v_population <> 18 OR v_home_wins <> 12 THEN
    RAISE EXCEPTION '00020 guard aba_game7_home_win_census: ABA Game 7 home wins = % of %, expected exactly 12 of 18 (Story 6.9: 12-6 at the real venues). A population other than 18 means: The archive changed since the 2026-10-09 measurement: re-measure and regenerate this migration before applying — apply 00020 before 00021 or any newly archived series',
      v_home_wins, v_population
      USING ERRCODE = '23514';
  END IF;
END
$guard$;

-- Guard team_scores_unchanged: the multiset of (series_id, game_number,
-- team_id, score) is identical before and after — every team keeps its score.
DO $guard$
DECLARE
  v_lost integer;
  v_gained integer;
BEGIN
  SELECT count(*) INTO v_lost FROM (
    SELECT series_id, game_number, team_id, score FROM pre_00020_team_scores
    EXCEPT ALL
    (SELECT g.series_id, g.game_number, g.home_team_id, g.home_score FROM public.series_game_scores g
     UNION ALL
     SELECT g.series_id, g.game_number, g.away_team_id, g.away_score FROM public.series_game_scores g)
  ) d;
  SELECT count(*) INTO v_gained FROM (
    (SELECT g.series_id, g.game_number, g.home_team_id, g.home_score FROM public.series_game_scores g
     UNION ALL
     SELECT g.series_id, g.game_number, g.away_team_id, g.away_score FROM public.series_game_scores g)
    EXCEPT ALL
    SELECT series_id, game_number, team_id, score FROM pre_00020_team_scores
  ) d;
  IF v_lost <> 0 OR v_gained <> 0 THEN
    RAISE EXCEPTION '00020 guard team_scores_unchanged: the per-team score multiset changed (% (series, game, team, score) entries lost, % gained) — a swap moved a score without its team',
      v_lost, v_gained
      USING ERRCODE = '23514';
  END IF;
END
$guard$;

-- Guard winners_unchanged: every series winner and every game row's winner is
-- what it was (winner counts included) — this migration never writes a winner.
DO $guard$
DECLARE
  v_diff integer;
BEGIN
  SELECT count(*) INTO v_diff FROM (
    (SELECT series_id, game_number, winner_team_id FROM pre_00020_winners
     EXCEPT ALL
     (SELECT s.id, 0, s.winner_team_id FROM public.series s
      UNION ALL
      SELECT g.series_id, g.game_number, g.winner_team_id FROM public.series_game_scores g))
    UNION ALL
    ((SELECT s.id, 0, s.winner_team_id FROM public.series s
      UNION ALL
      SELECT g.series_id, g.game_number, g.winner_team_id FROM public.series_game_scores g)
     EXCEPT ALL
     SELECT series_id, game_number, winner_team_id FROM pre_00020_winners)
  ) d;
  IF v_diff <> 0 THEN
    RAISE EXCEPTION '00020 guard winners_unchanged: % winner entries (series or game rows) differ from the pre-migration state — winner_team_id must never be written',
      v_diff
      USING ERRCODE = '23514';
  END IF;
END
$guard$;

-- Guard identity_unchanged: every column this migration does not own — ids,
-- created_at, year, round, league, is_featured, game_number, … — is unchanged
-- on every row of both tables.
DO $guard$
DECLARE
  v_diff integer;
BEGIN
  SELECT count(*) INTO v_diff FROM (
    (SELECT row_image FROM pre_00020_identity
     EXCEPT ALL
     (SELECT to_jsonb(s) - 'team_a_id' - 'team_b_id' - 'winner_team_id' FROM public.series s
      UNION ALL
      SELECT to_jsonb(g) - 'home_team_id' - 'away_team_id' - 'home_score' - 'away_score' - 'winner_team_id' FROM public.series_game_scores g))
    UNION ALL
    ((SELECT to_jsonb(s) - 'team_a_id' - 'team_b_id' - 'winner_team_id' FROM public.series s
      UNION ALL
      SELECT to_jsonb(g) - 'home_team_id' - 'away_team_id' - 'home_score' - 'away_score' - 'winner_team_id' FROM public.series_game_scores g)
     EXCEPT ALL
     SELECT row_image FROM pre_00020_identity)
  ) d;
  IF v_diff <> 0 THEN
    RAISE EXCEPTION '00020 guard identity_unchanged: % row images (outside the team/score columns this migration owns) differ from the pre-migration state',
      v_diff
      USING ERRCODE = '23514';
  END IF;
END
$guard$;

COMMIT;
