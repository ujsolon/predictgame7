-- =========================================================
-- Predict Game 7 — Add the 1968 ABA Finals to the archive
-- Migration 00021 (Story 6.11)
-- =========================================================
-- Owner decision 2026-10-09: the 1968 ABA Finals (Pittsburgh Pipers 4, New
-- Orleans Buccaneers 3) went seven games and is missing from the archive
-- (found by the Story 6.9 spike; no 1968 ABA series exists live). This migration
-- adds, in this one transaction:
--   - a teams row for the Pittsburgh Pipers: id 61, 'PTP' (a different
--     franchise row from 'MNP' Minnesota Pipers, id 44 — never reused), logo
--     assets/teams/Pittsburgh_Pipers.gif (owner-supplied), espn_code NULL;
--   - one series row: 1968, 'Finals', league 'ABA', team_a = PTP (the
--     home-court team, i.e. the Game 1 and Game 7 host — the archive's
--     home-court-first order since 00020), team_b = NOB, winner PTP,
--     is_featured false;
--   - its seven series_game_scores rows at their REAL venues (all seven games,
--     not the games 1-6 convention of the spreadsheet-sourced rows), each
--     game's winner_team_id derived from its score.
-- The game literals below are pinned to
-- supabase/scripts/pipeline/data/aba_1968_finals.csv (basketball-reference,
-- cross-checked against Wikipedia, 7 of 7 agreeing) by
-- tests/pipeline/aba-1968-finals.test.ts.
--
-- Order: apply AFTER 00020 (applied to production 2026-10-09, so in practice
-- `npx supabase db push` applies 00021 alone). The pre-guard archive_state
-- requires 00020 applied (0 archived NBA/BAA series whose Game 7 host is not
-- team_a; 42 = 00020 not applied) and, on the FIRST apply, the archive to be
-- exactly the 178 series of the 2026-10-09 measurement. Like 00020's own
-- 178s, that first-apply count is pinned to the 2026-10-09 archive size and
-- expires when any series is archived: re-measure and regenerate, never relax.
--
-- Idempotent: if the PTP row and the series (with its seven games) already
-- exist exactly as specified, nothing is written and every guard passes —
-- including after the archive has grown past 179 (the no-op path accepts
-- >= 179 archived series; the post-guard archived_count is then skipped,
-- since nothing was inserted). Any other state of PTP / id 61 / the name
-- 'Pittsburgh Pipers' / the 1968 PTP-NOB series aborts.
--
-- Guard style mirrors 00020 (raise-to-abort, ERRCODE 23514, one BEGIN/COMMIT).
-- Every guard is observed firing under its own tamper in
-- scripts/rehearse-migration-00014.mjs (section 10).

BEGIN;

-- No pipeline write may interleave with the measurement and the insert.
LOCK TABLE public.teams, public.series, public.series_game_scores IN SHARE ROW EXCLUSIVE MODE;

-- The seven games, as (game_number, home, away, home_score, away_score) by
-- teams.abbreviation — the rows of aba_1968_finals.csv, real venues.
CREATE TEMP TABLE aba_1968_finals_games (game_number integer, home text, away text, home_score integer, away_score integer) ON COMMIT DROP;
INSERT INTO aba_1968_finals_games (game_number, home, away, home_score, away_score) VALUES
  (1, 'PTP', 'NOB', 120, 112),
  (2, 'PTP', 'NOB', 100, 109),
  (3, 'NOB', 'PTP', 109, 101),
  (4, 'NOB', 'PTP', 105, 106),
  (5, 'PTP', 'NOB', 108, 111),
  (6, 'NOB', 'PTP', 112, 118),
  (7, 'PTP', 'NOB', 122, 113);

-- The run's mode, decided by the pre-guards: 'apply' or 'noop'.
CREATE TEMP TABLE m00021_mode (mode text NOT NULL) ON COMMIT DROP;

-- Guard team_slot: 'PTP', id 61 and the full_name 'Pittsburgh Pipers' (a
-- UNIQUE column) are either all absent (apply) or the one exact row this
-- migration writes (re-apply). Anything else — PTP under another id or other
-- columns, id 61 held by another team, the name under another id — aborts
-- naming it, rather than failing on teams_full_name_key with no named guard.
-- Guard nob_present: the opponent row exists exactly once.
-- Guard series_slot: the 1968 PTP-NOB series is absent (apply, with PTP
-- absent) or present exactly as specified with its seven games (re-apply,
-- with the exact PTP row). A partial state aborts.
-- Guard archive_state: apply needs exactly 178 archived series with 00020
-- applied; a re-apply (no-op) needs at least 179 with 00020 applied.
DO $guard$
DECLARE
  v_ptp_rows integer;
  v_id61_rows integer;
  v_name_rows integer;
  v_team_exact integer;
  v_team_desc text;
  v_nob integer;
  v_series integer;
  v_series_exact integer;
  v_games integer;
  v_games_exact integer;
  v_series_desc text;
  v_team_state text;
  v_series_state text;
  v_archived integer;
  v_not_home_first integer;
  v_expected_archived integer;
BEGIN
  SELECT count(*) INTO v_ptp_rows FROM public.teams WHERE abbreviation = 'PTP';
  SELECT count(*) INTO v_id61_rows FROM public.teams WHERE id = 61;
  SELECT count(*) INTO v_name_rows FROM public.teams WHERE full_name = 'Pittsburgh Pipers';
  SELECT count(*) INTO v_team_exact FROM public.teams
   WHERE id = 61 AND full_name = 'Pittsburgh Pipers' AND abbreviation = 'PTP' AND city = 'Pittsburgh'
     AND nickname = 'Pipers' AND logo_url = 'assets/teams/Pittsburgh_Pipers.gif' AND espn_code IS NULL;
  SELECT string_agg(id || ' ' || abbreviation || ' ' || full_name, '; ' ORDER BY id) INTO v_team_desc
    FROM public.teams WHERE abbreviation = 'PTP' OR id = 61 OR full_name = 'Pittsburgh Pipers';

  IF v_ptp_rows = 0 AND v_id61_rows = 0 AND v_name_rows = 0 THEN
    v_team_state := 'absent';
  ELSIF v_ptp_rows = 1 AND v_id61_rows = 1 AND v_name_rows = 1 AND v_team_exact = 1 THEN
    v_team_state := 'exact';
  ELSE
    RAISE EXCEPTION '00021 guard team_slot: PTP, id 61 or the name Pittsburgh Pipers is taken by a row this migration did not write (%) — expected all absent, or exactly (61, Pittsburgh Pipers, PTP, Pittsburgh, Pipers, assets/teams/Pittsburgh_Pipers.gif, espn_code NULL). Re-measure the teams table and resolve with the owner before applying; do not relax this guard',
      v_team_desc
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_nob FROM public.teams WHERE abbreviation = 'NOB';
  IF v_nob <> 1 THEN
    RAISE EXCEPTION '00021 guard nob_present: % teams rows carry abbreviation NOB — expected exactly one (New Orleans Buccaneers, id 46). Re-measure the teams table before applying',
      v_nob
      USING ERRCODE = '23514';
  END IF;

  -- The 1968 series on the PTP-NOB pair, stored in either order.
  SELECT count(*),
         count(*) FILTER (WHERE ta.abbreviation = 'PTP' AND tb.abbreviation = 'NOB' AND s.round = 'Finals'
                            AND s.league = 'ABA' AND s.winner_team_id = ta.id AND s.is_featured = false),
         string_agg(s.year || ' ' || s.round || ' ' || ta.abbreviation || '/' || tb.abbreviation || ' ' || s.league
                    || ' winner ' || coalesce(s.winner_team_id::text, 'NULL'), '; ')
    INTO v_series, v_series_exact, v_series_desc
    FROM public.series s
    JOIN public.teams ta ON ta.id = s.team_a_id
    JOIN public.teams tb ON tb.id = s.team_b_id
   WHERE s.year = 1968
     AND ((ta.abbreviation = 'PTP' AND tb.abbreviation = 'NOB') OR (ta.abbreviation = 'NOB' AND tb.abbreviation = 'PTP'));

  IF v_series = 0 THEN
    v_series_state := 'absent';
  ELSIF v_series = 1 AND v_series_exact = 1 THEN
    SELECT count(*),
           count(*) FILTER (WHERE th.abbreviation = l.home AND tw.abbreviation = l.away
                              AND g.home_score = l.home_score AND g.away_score = l.away_score
                              AND g.winner_team_id = CASE WHEN l.home_score > l.away_score THEN th.id ELSE tw.id END)
      INTO v_games, v_games_exact
      FROM public.series_game_scores g
      JOIN public.series s ON s.id = g.series_id
      JOIN public.teams ta ON ta.id = s.team_a_id
      JOIN public.teams tb ON tb.id = s.team_b_id
      JOIN public.teams th ON th.id = g.home_team_id
      JOIN public.teams tw ON tw.id = g.away_team_id
      LEFT JOIN aba_1968_finals_games l ON l.game_number = g.game_number
     WHERE s.year = 1968 AND ta.abbreviation = 'PTP' AND tb.abbreviation = 'NOB';
    IF v_games = 7 AND v_games_exact = 7 THEN
      v_series_state := 'exact';
    ELSE
      RAISE EXCEPTION '00021 guard series_slot: the 1968 PTP/NOB series exists but its game rows differ from this migration''s (% rows, % matching the seven literals) — refusing to overwrite. Re-measure and resolve with the owner',
        v_games, v_games_exact
        USING ERRCODE = '23514';
    END IF;
  ELSE
    RAISE EXCEPTION '00021 guard series_slot: % 1968 PTP/NOB series exist (%) and % match this migration exactly — expected none (first apply) or exactly one as specified (re-apply). Re-measure and resolve with the owner',
      v_series, v_series_desc, v_series_exact
      USING ERRCODE = '23514';
  END IF;

  IF v_team_state = 'absent' AND v_series_state = 'absent' THEN
    v_expected_archived := 178;
    INSERT INTO m00021_mode (mode) VALUES ('apply');
  ELSIF v_team_state = 'exact' AND v_series_state = 'exact' THEN
    v_expected_archived := 179;
    INSERT INTO m00021_mode (mode) VALUES ('noop');
  ELSE
    RAISE EXCEPTION '00021 guard series_slot: partial state — the PTP team row is % and the 1968 PTP/NOB series is % (expected both absent, or both present exactly as specified). Re-measure and resolve with the owner',
      v_team_state, v_series_state
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_archived FROM public.series WHERE winner_team_id IS NOT NULL;
  SELECT count(*) INTO v_not_home_first
    FROM public.series s
    JOIN public.series_game_scores g7 ON g7.series_id = s.id AND g7.game_number = 7
   WHERE s.league IN ('NBA', 'BAA')
     AND s.winner_team_id IS NOT NULL
     AND g7.home_team_id <> s.team_a_id;
  IF v_not_home_first <> 0 THEN
    RAISE EXCEPTION '00021 guard archive_state: % archived NBA/BAA series have a Game 7 host that is not team_a — 00020 is not applied (42 = not applied, 0 = applied). Apply 00020 first, then 00021',
      v_not_home_first
      USING ERRCODE = '23514';
  END IF;
  -- First apply: exactly the 2026-10-09 size. Re-apply (no-op): at least 179,
  -- so a later archived series does not turn the no-op into an abort.
  IF (v_expected_archived = 178 AND v_archived <> 178) OR (v_expected_archived = 179 AND v_archived < 179) THEN
    RAISE EXCEPTION '00021 guard archive_state: % archived series, expected % (% run). The archive changed since the 2026-10-09 measurement: re-measure and regenerate this migration before applying. Do not relax this guard',
      v_archived, CASE WHEN v_expected_archived = 178 THEN 'exactly 178' ELSE 'at least 179' END,
      CASE WHEN v_expected_archived = 178 THEN 'first' ELSE 're-apply' END
      USING ERRCODE = '23514';
  END IF;

  IF v_expected_archived = 178 THEN
    RAISE NOTICE '00021: adding PTP (id 61) and the 1968 ABA Finals with its seven games to the 178-series archive';
  ELSE
    RAISE NOTICE '00021: PTP and the 1968 ABA Finals are already present exactly as specified; no row is written';
  END IF;
END
$guard$;

-- Pre-state of every row this migration does not own: all teams but PTP, all
-- series but the exact (1968, team_a PTP, team_b NOB) row, and their game
-- rows — whole-row images. Any other 1968 series, PTP's included, is covered.
CREATE TEMP TABLE pre_00021_other_rows ON COMMIT DROP AS
  SELECT 'teams' AS tbl, to_jsonb(t)::text AS row_image FROM public.teams t
   WHERE t.abbreviation <> 'PTP' AND t.id <> 61
  UNION ALL
  SELECT 'series', to_jsonb(s)::text FROM public.series s
   WHERE NOT coalesce(s.year = 1968
                     AND s.team_a_id = (SELECT p.id FROM public.teams p WHERE p.abbreviation = 'PTP')
                     AND s.team_b_id = (SELECT n.id FROM public.teams n WHERE n.abbreviation = 'NOB'), false)
  UNION ALL
  SELECT 'games', to_jsonb(g)::text FROM public.series_game_scores g
    JOIN public.series s ON s.id = g.series_id
   WHERE NOT coalesce(s.year = 1968
                     AND s.team_a_id = (SELECT p.id FROM public.teams p WHERE p.abbreviation = 'PTP')
                     AND s.team_b_id = (SELECT n.id FROM public.teams n WHERE n.abbreviation = 'NOB'), false);

-- The insert (apply mode only).
INSERT INTO public.teams (id, full_name, abbreviation, city, nickname, logo_url, espn_code)
SELECT 61, 'Pittsburgh Pipers', 'PTP', 'Pittsburgh', 'Pipers', 'assets/teams/Pittsburgh_Pipers.gif', NULL
 WHERE (SELECT mode FROM m00021_mode) = 'apply';

INSERT INTO public.series (year, round, league, team_a_id, team_b_id, winner_team_id, is_featured)
SELECT 1968, 'Finals', 'ABA', ptp.id, nob.id, ptp.id, false
  FROM public.teams ptp, public.teams nob
 WHERE ptp.abbreviation = 'PTP' AND nob.abbreviation = 'NOB'
   AND (SELECT mode FROM m00021_mode) = 'apply';

INSERT INTO public.series_game_scores (series_id, game_number, home_team_id, away_team_id, home_score, away_score, winner_team_id)
SELECT s.id, l.game_number, th.id, tw.id, l.home_score, l.away_score,
       CASE WHEN l.home_score > l.away_score THEN th.id ELSE tw.id END
  FROM aba_1968_finals_games l
  JOIN public.teams th ON th.abbreviation = l.home
  JOIN public.teams tw ON tw.abbreviation = l.away
  JOIN public.teams ptp ON ptp.abbreviation = 'PTP'
  JOIN public.teams nob ON nob.abbreviation = 'NOB'
  JOIN public.series s ON s.year = 1968 AND s.team_a_id = ptp.id AND s.team_b_id = nob.id
 WHERE (SELECT mode FROM m00021_mode) = 'apply';

-- ==== 00021 POST-CONDITIONS ====
-- Each guard below aborts the whole transaction. The rehearsal injects a
-- corruption just above this line to observe each one firing.

-- Guard archived_count: exactly 179 archived series after an insert (the 178
-- of the 2026-10-09 measurement + the 1968 ABA Finals); at least 179 on a
-- no-op re-apply, which inserted nothing.
DO $guard$
DECLARE
  v_archived integer;
  v_mode text;
BEGIN
  SELECT count(*) INTO v_archived FROM public.series WHERE winner_team_id IS NOT NULL;
  SELECT mode INTO v_mode FROM m00021_mode;
  IF (v_mode = 'apply' AND v_archived <> 179) OR (v_mode = 'noop' AND v_archived < 179) THEN
    RAISE EXCEPTION '00021 guard archived_count: % archived series after the % run, expected %. The archive changed since the 2026-10-09 measurement: re-measure and regenerate this migration before applying',
      v_archived, CASE WHEN v_mode = 'apply' THEN 'insert' ELSE 'no-op' END,
      CASE WHEN v_mode = 'apply' THEN 'exactly 179' ELSE 'at least 179' END
      USING ERRCODE = '23514';
  END IF;
END
$guard$;

-- Guard new_series_archive: the new series derives phase archive — winner
-- set (PTP), exactly one row, and exactly games 1-7.
DO $guard$
DECLARE
  v_series integer;
  v_winner text;
  v_games integer;
  v_distinct integer;
  v_min integer;
  v_max integer;
BEGIN
  SELECT count(*), max(w.abbreviation) INTO v_series, v_winner
    FROM public.series s
    JOIN public.teams ta ON ta.id = s.team_a_id
    JOIN public.teams tb ON tb.id = s.team_b_id
    LEFT JOIN public.teams w ON w.id = s.winner_team_id
   WHERE s.year = 1968 AND ta.abbreviation = 'PTP' AND tb.abbreviation = 'NOB';
  SELECT count(*), count(DISTINCT g.game_number), min(g.game_number), max(g.game_number)
    INTO v_games, v_distinct, v_min, v_max
    FROM public.series_game_scores g
    JOIN public.series s ON s.id = g.series_id
    JOIN public.teams ta ON ta.id = s.team_a_id
    JOIN public.teams tb ON tb.id = s.team_b_id
   WHERE s.year = 1968 AND ta.abbreviation = 'PTP' AND tb.abbreviation = 'NOB';
  IF v_series <> 1 OR v_winner IS DISTINCT FROM 'PTP' OR v_games <> 7 OR v_distinct <> 7 OR v_min <> 1 OR v_max <> 7 THEN
    RAISE EXCEPTION '00021 guard new_series_archive: the 1968 PTP/NOB series reads % row(s), winner %, % game rows (% distinct, % to %) — expected one archived series won by PTP with exactly games 1-7',
      v_series, coalesce(v_winner, 'NULL'), v_games, v_distinct, coalesce(v_min::text, '-'), coalesce(v_max::text, '-')
      USING ERRCODE = '23514';
  END IF;
END
$guard$;

-- Guard series_score: every game's winner is its higher scorer, the series
-- reads 4-3 PTP, and 3-3 after six (a real Game 7).
DO $guard$
DECLARE
  v_bad_winner integer;
  v_ptp integer;
  v_nob integer;
  v_ptp6 integer;
  v_nob6 integer;
BEGIN
  SELECT count(*) FILTER (WHERE g.winner_team_id IS DISTINCT FROM CASE WHEN g.home_score > g.away_score THEN g.home_team_id ELSE g.away_team_id END
                            OR g.home_score = g.away_score),
         count(*) FILTER (WHERE g.winner_team_id = s.team_a_id),
         count(*) FILTER (WHERE g.winner_team_id = s.team_b_id),
         count(*) FILTER (WHERE g.winner_team_id = s.team_a_id AND g.game_number <= 6),
         count(*) FILTER (WHERE g.winner_team_id = s.team_b_id AND g.game_number <= 6)
    INTO v_bad_winner, v_ptp, v_nob, v_ptp6, v_nob6
    FROM public.series_game_scores g
    JOIN public.series s ON s.id = g.series_id
    JOIN public.teams ta ON ta.id = s.team_a_id
    JOIN public.teams tb ON tb.id = s.team_b_id
   WHERE s.year = 1968 AND ta.abbreviation = 'PTP' AND tb.abbreviation = 'NOB';
  IF v_bad_winner <> 0 OR v_ptp <> 4 OR v_nob <> 3 OR v_ptp6 <> 3 OR v_nob6 <> 3 THEN
    RAISE EXCEPTION '00021 guard series_score: the 1968 Finals reads PTP % - NOB % (% - % after six), % game winner(s) not the higher scorer — expected 4-3 PTP, 3-3 after six, every winner by score',
      v_ptp, v_nob, v_ptp6, v_nob6, v_bad_winner
      USING ERRCODE = '23514';
  END IF;
END
$guard$;

-- Guard hosts_are_team_a: Game 1 and Game 7 are hosted by team_a (PTP) —
-- home-court first, as every archived series is after 00020.
DO $guard$
DECLARE
  v_hosts text;
BEGIN
  SELECT string_agg(g.game_number || '=' || th.abbreviation, ',' ORDER BY g.game_number) INTO v_hosts
    FROM public.series_game_scores g
    JOIN public.series s ON s.id = g.series_id
    JOIN public.teams ta ON ta.id = s.team_a_id
    JOIN public.teams tb ON tb.id = s.team_b_id
    JOIN public.teams th ON th.id = g.home_team_id
   WHERE s.year = 1968 AND ta.abbreviation = 'PTP' AND tb.abbreviation = 'NOB' AND g.game_number IN (1, 7)
     AND g.home_team_id = s.team_a_id;
  IF v_hosts IS DISTINCT FROM '1=PTP,7=PTP' THEN
    RAISE EXCEPTION '00021 guard hosts_are_team_a: Game 1 / Game 7 hosted by team_a reads "%" — expected both games hosted by PTP (team_a)',
      coalesce(v_hosts, '')
      USING ERRCODE = '23514';
  END IF;
END
$guard$;

-- Guard games_match_literals: the seven stored rows are exactly the seven
-- literals (venue, both scores), no more and no fewer.
DO $guard$
DECLARE
  v_diff integer;
BEGIN
  SELECT count(*) INTO v_diff FROM (
    (SELECT game_number, home, away, home_score, away_score FROM aba_1968_finals_games
     EXCEPT ALL
     SELECT g.game_number, th.abbreviation, tw.abbreviation, g.home_score, g.away_score
       FROM public.series_game_scores g
       JOIN public.series s ON s.id = g.series_id
       JOIN public.teams ta ON ta.id = s.team_a_id
       JOIN public.teams tb ON tb.id = s.team_b_id
       JOIN public.teams th ON th.id = g.home_team_id
       JOIN public.teams tw ON tw.id = g.away_team_id
      WHERE s.year = 1968 AND ta.abbreviation = 'PTP' AND tb.abbreviation = 'NOB')
    UNION ALL
    (SELECT g.game_number, th.abbreviation, tw.abbreviation, g.home_score, g.away_score
       FROM public.series_game_scores g
       JOIN public.series s ON s.id = g.series_id
       JOIN public.teams ta ON ta.id = s.team_a_id
       JOIN public.teams tb ON tb.id = s.team_b_id
       JOIN public.teams th ON th.id = g.home_team_id
       JOIN public.teams tw ON tw.id = g.away_team_id
      WHERE s.year = 1968 AND ta.abbreviation = 'PTP' AND tb.abbreviation = 'NOB'
     EXCEPT ALL
     SELECT game_number, home, away, home_score, away_score FROM aba_1968_finals_games)
  ) d;
  IF v_diff <> 0 THEN
    RAISE EXCEPTION '00021 guard games_match_literals: % game rows of the 1968 Finals differ from the seven literals (venue or score)',
      v_diff
      USING ERRCODE = '23514';
  END IF;
END
$guard$;

-- Guard other_rows_unchanged: every teams row but PTP, every series but the
-- 1968 Finals and all their game rows are byte-identical to the pre-state.
DO $guard$
DECLARE
  v_lost integer;
  v_gained integer;
BEGIN
  CREATE TEMP TABLE post_00021_other_rows ON COMMIT DROP AS
    SELECT 'teams' AS tbl, to_jsonb(t)::text AS row_image FROM public.teams t
     WHERE t.abbreviation <> 'PTP' AND t.id <> 61
    UNION ALL
    SELECT 'series', to_jsonb(s)::text FROM public.series s
     WHERE NOT coalesce(s.year = 1968
                     AND s.team_a_id = (SELECT p.id FROM public.teams p WHERE p.abbreviation = 'PTP')
                     AND s.team_b_id = (SELECT n.id FROM public.teams n WHERE n.abbreviation = 'NOB'), false)
    UNION ALL
    SELECT 'games', to_jsonb(g)::text FROM public.series_game_scores g
      JOIN public.series s ON s.id = g.series_id
     WHERE NOT coalesce(s.year = 1968
                     AND s.team_a_id = (SELECT p.id FROM public.teams p WHERE p.abbreviation = 'PTP')
                     AND s.team_b_id = (SELECT n.id FROM public.teams n WHERE n.abbreviation = 'NOB'), false);
  SELECT count(*) INTO v_lost FROM (
    SELECT tbl, row_image FROM pre_00021_other_rows EXCEPT ALL SELECT tbl, row_image FROM post_00021_other_rows) d;
  SELECT count(*) INTO v_gained FROM (
    SELECT tbl, row_image FROM post_00021_other_rows EXCEPT ALL SELECT tbl, row_image FROM pre_00021_other_rows) d;
  IF v_lost <> 0 OR v_gained <> 0 THEN
    RAISE EXCEPTION '00021 guard other_rows_unchanged: % row images of the earlier archive (teams, series, game rows) lost and % gained — this migration may write only PTP and the 1968 Finals',
      v_lost, v_gained
      USING ERRCODE = '23514';
  END IF;
END
$guard$;

COMMIT;
