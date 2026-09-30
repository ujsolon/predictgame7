-- =========================================================
-- Predict Game 7 — Pipeline birth/completion RPCs
-- Migration 00015 (Story 2.3, Decision 2)
-- =========================================================
-- Completion atomicity for the pipeline runner
-- (supabase/scripts/pipeline/). Birth and completion each execute as ONE
-- function call, so their statements share one transaction and the
-- "in one transaction" AC is literally met. The identity key remains
-- (year, team_a_id, team_b_id) (series_year_team_pair_key, 00014) and the
-- scores key remains (series_id, game_number) (unique_series_game, 00005:55);
-- the ON CONFLICT targets move from the client into SQL here.
--
-- Both functions assert AD-4's derivation invariant in SQL before writing —
-- a birth carries exactly the six games {1..6}, decided and split 3-3; a
-- completion lands on a pending row whose games 1..6 are a certified 3-3 and
-- appends game 7 plus the winner — and birth asserts AD-5's identity rule in
-- either slot order, which the UNIQUE constraint cannot enforce (the
-- team_a = game-1-home convention is a convention; Story 2.1 measured
-- team_a_id > team_b_id in 80 of 178).
--
-- SECURITY DEFINER, search_path pinned. EXECUTE is granted to service_role
-- only and revoked from public/anon/authenticated (NFR-S1/AD-8: the pipeline
-- is the only writer, and it writes through these two calls). No step writes
-- series.status — the column is gone as of 00014.
--
-- The agent never applies this migration; rehearsal runs in the throwaway
-- Docker Postgres (scripts/rehearse-migration-00014.mjs replays every
-- migration in order and exercises these functions with psql), and the owner
-- holds the production apply command, exactly as with 00014.

BEGIN;

-- ---------------------------------------------------------
-- pipeline_birth_series: AD-4 atomic birth at a certified 3-3
-- ---------------------------------------------------------
-- p_scores: jsonb array of exactly six objects
--   { game_number, home_team_id, away_team_id, home_score, away_score }
-- covering {1..6}, every game decided, wins split 3-3. The row is born with
-- winner_team_id NULL (pending); game 7 never rides in a birth.
CREATE OR REPLACE FUNCTION public.pipeline_birth_series(
  p_year integer,
  p_round text,
  p_team_a_id integer,
  p_team_b_id integer,
  p_scores jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_series_id uuid;
  v_rows integer;
  v_distinct integer;
  v_bad integer;
  v_team_a_wins integer;
BEGIN
  IF p_year IS NULL OR p_round IS NULL OR p_team_a_id IS NULL OR p_team_b_id IS NULL OR p_scores IS NULL THEN
    RAISE EXCEPTION 'pipeline_birth_series: all arguments are required (year=%, pair %/%, scores %)',
      p_year, p_team_a_id, p_team_b_id, CASE WHEN p_scores IS NULL THEN 'NULL' ELSE 'set' END
      USING ERRCODE = '22023';
  END IF;
  IF p_team_a_id = p_team_b_id THEN
    RAISE EXCEPTION 'pipeline_birth_series: team slots hold the same team (%) for year %', p_team_b_id, p_year
      USING ERRCODE = '23514';
  END IF;
  IF btrim(p_round) = '' THEN
    RAISE EXCEPTION 'pipeline_birth_series: p_round must be a non-empty display label for (%, %, %)',
      p_year, p_team_a_id, p_team_b_id
      USING ERRCODE = '22023';
  END IF;

  -- AD-5 identity assertion: the (year, pair) must be absent in EITHER slot
  -- order. A slot-swapped twin on the table is the shape the UNIQUE cannot
  -- catch (the constraint guards the pair as stored); refuse loudly.
  IF EXISTS (
    SELECT 1 FROM public.series s
    WHERE s.year = p_year AND s.team_a_id = p_team_b_id AND s.team_b_id = p_team_a_id
  ) THEN
    RAISE EXCEPTION
      'pipeline_birth_series: identity assertion failed — series % already holds (%, %, %) with the slots swapped; refusing to write the pair in the other order',
      (SELECT s.id FROM public.series s WHERE s.year = p_year AND s.team_a_id = p_team_b_id AND s.team_b_id = p_team_a_id LIMIT 1),
      p_year, p_team_b_id, p_team_a_id
      USING ERRCODE = '23514';
  END IF;

  IF jsonb_typeof(p_scores) <> 'array' THEN
    RAISE EXCEPTION 'pipeline_birth_series: p_scores must be a jsonb array (got %)', jsonb_typeof(p_scores)
      USING ERRCODE = '22023';
  END IF;

  -- The length is checked on the raw array, before the well-formed-element
  -- count below: an element missing one of the five keys would drop out of
  -- that count and reach the INSERT as a NULL, failing on a bare NOT NULL
  -- violation instead of naming the birth rule it broke.
  IF jsonb_array_length(p_scores) <> 6 THEN
    RAISE EXCEPTION 'pipeline_birth_series: a birth carries exactly six game objects, p_scores holds % for (%, %, %)',
      jsonb_array_length(p_scores), p_year, p_team_a_id, p_team_b_id
      USING ERRCODE = '23514';
  END IF;

  -- AD-4 invariant, asserted before any write: exactly six games, distinct
  -- numbers covering {1..6}, both slots only, no ties, non-negative scores,
  -- and a 3-3 split. (The six-games/one-identity shape a birth may NOT carry
  -- is game 7 — see pipeline_complete_series.)
  SELECT count(*), count(DISTINCT (g ->> 'game_number')::smallint)
    INTO v_rows, v_distinct
    FROM jsonb_array_elements(p_scores) AS g
   WHERE jsonb_typeof(g) = 'object'
     AND g ?& array['game_number', 'home_team_id', 'away_team_id', 'home_score', 'away_score'];
  IF v_rows <> 6 OR v_distinct <> 6 THEN
    RAISE EXCEPTION
      'pipeline_birth_series: a birth carries exactly the six decided games 1..6, got % row(s) with % distinct game_number(s) for (%, %, %)',
      v_rows, v_distinct, p_year, p_team_a_id, p_team_b_id
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*)
    INTO v_bad
    FROM jsonb_array_elements(p_scores) AS g
   WHERE (g ->> 'game_number')::smallint NOT BETWEEN 1 AND 6
      OR (g ->> 'home_team_id')::integer NOT IN (p_team_a_id, p_team_b_id)
      OR (g ->> 'away_team_id')::integer NOT IN (p_team_a_id, p_team_b_id)
      OR (g ->> 'home_team_id')::integer = (g ->> 'away_team_id')::integer
      OR (g ->> 'home_score')::integer < 0
      OR (g ->> 'away_score')::integer < 0
      OR (g ->> 'home_score')::integer = (g ->> 'away_score')::integer;
  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'pipeline_birth_series: impossible shape for (%, %, %) — % game row(s) fail the birth rules (games 1..6, both slots, decided, non-negative)',
      p_year, p_team_a_id, p_team_b_id, v_bad
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*)
    INTO v_team_a_wins
    FROM jsonb_array_elements(p_scores) AS g
   WHERE CASE
           WHEN (g ->> 'home_score')::integer > (g ->> 'away_score')::integer
           THEN (g ->> 'home_team_id')::integer
           ELSE (g ->> 'away_team_id')::integer
         END = p_team_a_id;
  IF v_team_a_wins <> 3 THEN
    RAISE EXCEPTION
      'pipeline_birth_series: not a certified 3-3 for (%, %, %) — team_a has % win(s) over the six source games',
      p_year, p_team_a_id, p_team_b_id, v_team_a_wins
      USING ERRCODE = '23514';
  END IF;

  -- Birth: the series row and its six score rows, one transaction per call.
  -- A racing duplicate run resolves through the same conflict targets the
  -- client used to name: series_year_team_pair_key and unique_series_game.
  INSERT INTO public.series (year, round, team_a_id, team_b_id)
  VALUES (p_year, p_round, p_team_a_id, p_team_b_id)
  ON CONFLICT ON CONSTRAINT series_year_team_pair_key DO NOTHING
  RETURNING id INTO v_series_id;

  IF v_series_id IS NULL THEN
    SELECT s.id INTO v_series_id
      FROM public.series s
     WHERE s.year = p_year AND s.team_a_id = p_team_a_id AND s.team_b_id = p_team_b_id;
  END IF;

  INSERT INTO public.series_game_scores
    (series_id, game_number, home_team_id, away_team_id, home_score, away_score, winner_team_id)
  SELECT v_series_id,
         (g ->> 'game_number')::smallint,
         (g ->> 'home_team_id')::integer,
         (g ->> 'away_team_id')::integer,
         (g ->> 'home_score')::integer,
         (g ->> 'away_score')::integer,
         CASE
           WHEN (g ->> 'home_score')::integer > (g ->> 'away_score')::integer
           THEN (g ->> 'home_team_id')::integer
           ELSE (g ->> 'away_team_id')::integer
         END
    FROM jsonb_array_elements(p_scores) AS g
  ON CONFLICT ON CONSTRAINT unique_series_game DO NOTHING;

  RETURN v_series_id;
END;
$fn$;

-- ---------------------------------------------------------
-- pipeline_complete_series: AD-4 atomic completion
-- ---------------------------------------------------------
-- p_game: jsonb object { game_number (= 7), home_team_id, away_team_id,
--         home_score, away_score }. Appends game 7 AND fills winner_team_id
-- in this one call — both statements land, or neither does.
CREATE OR REPLACE FUNCTION public.pipeline_complete_series(
  p_series_id uuid,
  p_game jsonb,
  p_winner_team_id integer
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_series public.series%ROWTYPE;
  v_game jsonb;
  v_home integer;
  v_away integer;
  v_home_score integer;
  v_away_score integer;
  v_game_winner integer;
  v_six integer;
  v_sevens integer;
  v_ties integer;
  v_team_a_wins integer;
  v_existing integer;
BEGIN
  SELECT * INTO v_series
    FROM public.series s
   WHERE s.id = p_series_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pipeline_complete_series: no series %', p_series_id
      USING ERRCODE = 'P0001';
  END IF;

  IF p_game IS NULL OR p_winner_team_id IS NULL OR jsonb_typeof(p_game) <> 'object'
     OR NOT p_game ?& array['game_number', 'home_team_id', 'away_team_id', 'home_score', 'away_score'] THEN
    RAISE EXCEPTION
      'pipeline_complete_series: p_game must be an object with game_number/home_team_id/away_team_id/home_score/away_score (series %)',
      p_series_id
      USING ERRCODE = '22023';
  END IF;

  v_game := p_game;
  IF (v_game ->> 'game_number')::smallint <> 7 THEN
    RAISE EXCEPTION 'pipeline_complete_series: a completion appends game 7, got game % (series %)',
      (v_game ->> 'game_number'), p_series_id
      USING ERRCODE = '23514';
  END IF;
  v_home := (v_game ->> 'home_team_id')::integer;
  v_away := (v_game ->> 'away_team_id')::integer;
  v_home_score := (v_game ->> 'home_score')::integer;
  v_away_score := (v_game ->> 'away_score')::integer;
  IF v_home NOT IN (v_series.team_a_id, v_series.team_b_id)
     OR v_away NOT IN (v_series.team_a_id, v_series.team_b_id)
     OR v_home = v_away
     OR v_home_score < 0
     OR v_away_score < 0
     OR v_home_score = v_away_score THEN
    RAISE EXCEPTION
      'pipeline_complete_series: game 7 % is not a decided game between the series pair %/% (series %)',
      v_game, v_series.team_a_id, v_series.team_b_id, p_series_id
      USING ERRCODE = '23514';
  END IF;
  v_game_winner := CASE WHEN v_home_score > v_away_score THEN v_home ELSE v_away END;
  IF v_game_winner <> p_winner_team_id THEN
    RAISE EXCEPTION
      'pipeline_complete_series: winner_team_id % does not match game 7''s winner % (series %)',
      p_winner_team_id, v_game_winner, p_series_id
      USING ERRCODE = '23514';
  END IF;

  IF v_series.winner_team_id IS NOT NULL THEN
    -- Already completed. Idempotent replay (racing runs, re-runs) is allowed
    -- only when the stored archive agrees with this exact call; anything
    -- else is a rewrite of an archived outcome, which the runner never does.
    IF v_series.winner_team_id <> p_winner_team_id THEN
      RAISE EXCEPTION
        'pipeline_complete_series: series % is archived with winner %; refusing to overwrite it with %',
        p_series_id, v_series.winner_team_id, p_winner_team_id
        USING ERRCODE = '23514';
    END IF;
    SELECT count(*) INTO v_existing
      FROM public.series_game_scores s
     WHERE s.series_id = p_series_id
       AND s.game_number = 7
       AND s.home_team_id = v_home
       AND s.away_team_id = v_away
       AND s.home_score = v_home_score
       AND s.away_score = v_away_score;
    IF v_existing <> 1 THEN
      RAISE EXCEPTION
        'pipeline_complete_series: series % already has a game 7 that differs from this request; the runner never rewrites archived games',
        p_series_id
        USING ERRCODE = '23514';
    END IF;
    RETURN p_series_id;
  END IF;

  -- AD-4 pre-state: a pending row means games 1..6, decided, split 3-3.
  -- A pre-existing game 7 row is tolerated ONLY when it matches this request
  -- exactly — the repair of a half-written row from a failed earlier call.
  SELECT count(*) FILTER (WHERE s.game_number BETWEEN 1 AND 6),
         count(*) FILTER (WHERE s.game_number = 7),
         count(*) FILTER (WHERE s.game_number BETWEEN 1 AND 6 AND s.home_score = s.away_score),
         count(*) FILTER (
           WHERE s.game_number BETWEEN 1 AND 6
             AND CASE WHEN s.home_score > s.away_score THEN s.home_team_id ELSE s.away_team_id END = v_series.team_a_id
         )
    INTO v_six, v_sevens, v_ties, v_team_a_wins
    FROM public.series_game_scores s
   WHERE s.series_id = p_series_id;
  IF v_six <> 6 OR v_ties <> 0 OR v_sevens > 1 THEN
    RAISE EXCEPTION
      'pipeline_complete_series: series % is not a certified 3-3 pending row (games 1..6 count %, ties %, game-7 count %)',
      p_series_id, v_six, v_ties, v_sevens
      USING ERRCODE = '23514';
  END IF;
  IF v_team_a_wins <> 3 THEN
    RAISE EXCEPTION
      'pipeline_complete_series: series % does not split its first six games 3-3 (team_a has % win(s) on the table)',
      p_series_id, v_team_a_wins
      USING ERRCODE = '23514';
  END IF;
  IF v_sevens = 1 THEN
    SELECT count(*) INTO v_existing
      FROM public.series_game_scores s
     WHERE s.series_id = p_series_id
       AND s.game_number = 7
       AND s.home_team_id = v_home
       AND s.away_team_id = v_away
       AND s.home_score = v_home_score
       AND s.away_score = v_away_score;
    IF v_existing <> 1 THEN
      RAISE EXCEPTION
        'pipeline_complete_series: series % already holds a different game 7; refusing to rewrite it',
        p_series_id
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- The two statements of one completion, inside this one function call:
  -- append (or repair) game 7, then fill the winner. One transaction.
  INSERT INTO public.series_game_scores
    (series_id, game_number, home_team_id, away_team_id, home_score, away_score, winner_team_id)
  VALUES
    (p_series_id, 7, v_home, v_away, v_home_score, v_away_score, v_game_winner)
  ON CONFLICT ON CONSTRAINT unique_series_game
  DO UPDATE
     SET home_team_id = EXCLUDED.home_team_id,
         away_team_id = EXCLUDED.away_team_id,
         home_score = EXCLUDED.home_score,
         away_score = EXCLUDED.away_score,
         winner_team_id = EXCLUDED.winner_team_id;

  UPDATE public.series
     SET winner_team_id = p_winner_team_id,
         updated_at = NOW()
   WHERE id = p_series_id;

  RETURN p_series_id;
END;
$fn$;

-- Execution surface: service_role only (the pipeline). public/anon/authenticated
-- get nothing; reads stay RLS-governed SELECTs on the tables themselves.
REVOKE ALL ON FUNCTION public.pipeline_birth_series(integer, text, integer, integer, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pipeline_birth_series(integer, text, integer, integer, jsonb)
  TO service_role;

REVOKE ALL ON FUNCTION public.pipeline_complete_series(uuid, jsonb, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pipeline_complete_series(uuid, jsonb, integer)
  TO service_role;

COMMIT;
