-- =========================================================
-- Predict Game 7 — Archive league identity + Game 7 venue backfill
-- Migration 00016 (Story 2.8)
-- =========================================================
-- GENERATED FILE — owned by supabase/scripts/pipeline/venueBackfill.ts.
-- Do not hand-edit: regenerate with
--   node supabase/scripts/pipeline/venueBackfill.ts
-- and prove agreement with
--   node supabase/scripts/pipeline/venueBackfill.ts --check
-- Source: supabase/scripts/pipeline/data/game7_venues_curated.csv
-- (178 curated rows: 160 NBA/BAA venues + 18 ABA rows, venue blank by scope).
-- Applies the one-time, owner-approved lift of the archive freeze for Game-7
-- venues of the NBA/BAA series (sprint-change-proposal-2026-10-01.md, Calls
-- 1-2-4). The 18 ABA game-7 rows and every games-1-6 row stay untouched.

-- Ordered in exactly the spec'd sequence: league added nullable -> backfilled
-- -> SET NOT NULL -> DEFAULT 'NBA' -> CHECK. NOT NULL before the backfill
-- would strand the rows; the default after it keeps every one of the 178
-- archived values coming from the curated file, not the default (Call 4: the
-- default serves rows the ongoing pipeline writes, and both shipped adapters
-- write NBA-only seasons).
--
-- Series resolution is (year, unordered team pair) through teams.abbreviation
-- — the identity 00014 made enforceable — never round (17 era spellings).
-- Game-7 rows only: every statement below names game_number = 7, and the
-- swap exchanges (home_team_id, away_team_id) together with
-- (home_score, away_score) in ONE UPDATE so winner-vs-score consistency
-- survives whatever orientation the row arrives in. winner_team_id (both
-- tables) is never written.
--
-- The guards use 00015:80-85's raise-to-abort style. Every one of them is
-- executed against a fixture archive of the real shape (178 series x 7 rows)
-- by scripts/rehearse-migration-00014.mjs, each with a tamper that makes it
-- fire — a guard that cannot fail is not a guard.

BEGIN;

-- The curated list, once per concern, so each guard reads one shape.
CREATE TEMP TABLE curated_league (year integer, team_a text, team_b text, league text) ON COMMIT DROP;
INSERT INTO curated_league (year, team_a, team_b, league) VALUES
  (1948, 'PHW', 'SLB', 'BAA'),
  (1951, 'ROR', 'NYK', 'NBA'),
  (1952, 'MPL', 'NYK', 'NBA'),
  (1954, 'MPL', 'SYR', 'NBA'),
  (1955, 'SYR', 'FWP', 'NBA'),
  (1957, 'BOS', 'SLH', 'NBA'),
  (1959, 'BOS', 'SYR', 'NBA'),
  (1960, 'BOS', 'SLH', 'NBA'),
  (1960, 'SLH', 'MPL', 'NBA'),
  (1961, 'SLH', 'LAL', 'NBA'),
  (1962, 'BOS', 'LAL', 'NBA'),
  (1962, 'BOS', 'PHW', 'NBA'),
  (1963, 'BOS', 'CNR', 'NBA'),
  (1963, 'LAL', 'SLH', 'NBA'),
  (1964, 'SFW', 'SLH', 'NBA'),
  (1965, 'BOS', 'PHI', 'NBA'),
  (1966, 'BOS', 'LAL', 'NBA'),
  (1966, 'LAL', 'SLH', 'NBA'),
  (1968, 'BOS', 'PHI', 'NBA'),
  (1969, 'BOS', 'LAL', 'NBA'),
  (1969, 'IND', 'KEN', 'ABA'),
  (1969, 'MFL', 'MNP', 'ABA'),
  (1969, 'NOB', 'DCH', 'ABA'),
  (1969, 'OAK', 'DNR', 'ABA'),
  (1970, 'DNR', 'WSC', 'ABA'),
  (1970, 'KEN', 'NYN', 'ABA'),
  (1970, 'LAL', 'PHX', 'NBA'),
  (1970, 'NYK', 'BLB', 'NBA'),
  (1970, 'NYK', 'LAL', 'NBA'),
  (1971, 'BLB', 'NYK', 'NBA'),
  (1971, 'BLB', 'PHI', 'NBA'),
  (1971, 'LAL', 'CHI', 'NBA'),
  (1971, 'UTS', 'IND', 'ABA'),
  (1971, 'UTS', 'KEN', 'ABA'),
  (1972, 'IND', 'DNR', 'ABA'),
  (1972, 'IND', 'UTS', 'ABA'),
  (1972, 'NYN', 'VAS', 'ABA'),
  (1973, 'IND', 'KEN', 'ABA'),
  (1973, 'KEN', 'CAC', 'ABA'),
  (1973, 'LAL', 'CHI', 'NBA'),
  (1973, 'NYK', 'BOS', 'NBA'),
  (1974, 'BOS', 'MIL', 'NBA'),
  (1974, 'CHI', 'DET', 'NBA'),
  (1974, 'IND', 'SAS', 'ABA'),
  (1974, 'NYK', 'CPB', 'NBA'),
  (1974, 'UTS', 'IND', 'ABA'),
  (1975, 'GSW', 'CHI', 'NBA'),
  (1975, 'IND', 'DEN', 'ABA'),
  (1975, 'WSB', 'BUF', 'NBA'),
  (1976, 'CLE', 'WSB', 'NBA'),
  (1976, 'DEN', 'KEN', 'ABA'),
  (1976, 'NYN', 'SAS', 'ABA'),
  (1976, 'PHX', 'GSW', 'NBA'),
  (1977, 'LAL', 'GSW', 'NBA'),
  (1977, 'PHI', 'BOS', 'NBA'),
  (1978, 'DEN', 'MIL', 'NBA'),
  (1978, 'WSB', 'SEA', 'NBA'),
  (1979, 'SAS', 'PHI', 'NBA'),
  (1979, 'SEA', 'PHX', 'NBA'),
  (1979, 'WSB', 'ATL', 'NBA'),
  (1979, 'WSB', 'SAS', 'NBA'),
  (1980, 'SEA', 'MIL', 'NBA'),
  (1981, 'BOS', 'PHI', 'NBA'),
  (1981, 'HOU', 'SAS', 'NBA'),
  (1981, 'KCK', 'PHX', 'NBA'),
  (1981, 'PHI', 'MIL', 'NBA'),
  (1982, 'PHI', 'BOS', 'NBA'),
  (1984, 'BOS', 'LAL', 'NBA'),
  (1984, 'BOS', 'NYK', 'NBA'),
  (1986, 'MIL', 'PHI', 'NBA'),
  (1987, 'BOS', 'DET', 'NBA'),
  (1987, 'BOS', 'MIL', 'NBA'),
  (1988, 'BOS', 'ATL', 'NBA'),
  (1988, 'LAL', 'DAL', 'NBA'),
  (1988, 'LAL', 'DET', 'NBA'),
  (1988, 'LAL', 'UTA', 'NBA'),
  (1990, 'DET', 'CHI', 'NBA'),
  (1990, 'POR', 'SAS', 'NBA'),
  (1992, 'CHI', 'NYK', 'NBA'),
  (1992, 'CLE', 'BOS', 'NBA'),
  (1993, 'PHX', 'SEA', 'NBA'),
  (1993, 'SEA', 'HOU', 'NBA'),
  (1994, 'HOU', 'NYK', 'NBA'),
  (1994, 'HOU', 'PHX', 'NBA'),
  (1994, 'NYK', 'CHI', 'NBA'),
  (1994, 'NYK', 'IND', 'NBA'),
  (1994, 'UTA', 'DEN', 'NBA'),
  (1995, 'HOU', 'PHX', 'NBA'),
  (1995, 'IND', 'NYK', 'NBA'),
  (1995, 'ORL', 'IND', 'NBA'),
  (1996, 'SEA', 'UTA', 'NBA'),
  (1997, 'HOU', 'SEA', 'NBA'),
  (1997, 'MIA', 'NYK', 'NBA'),
  (1998, 'CHI', 'IND', 'NBA'),
  (2000, 'LAL', 'POR', 'NBA'),
  (2000, 'NYK', 'MIA', 'NBA'),
  (2001, 'MIL', 'CHA', 'NBA'),
  (2001, 'PHI', 'MIL', 'NBA'),
  (2001, 'PHI', 'TOR', 'NBA'),
  (2002, 'LAL', 'SAC', 'NBA'),
  (2003, 'DAL', 'POR', 'NBA'),
  (2003, 'DAL', 'SAC', 'NBA'),
  (2003, 'DET', 'ORL', 'NBA'),
  (2004, 'DET', 'NJN', 'NBA'),
  (2004, 'MIA', 'NOH', 'NBA'),
  (2004, 'MIN', 'SAC', 'NBA'),
  (2005, 'DAL', 'HOU', 'NBA'),
  (2005, 'DET', 'MIA', 'NBA'),
  (2005, 'IND', 'BOS', 'NBA'),
  (2005, 'SAS', 'DET', 'NBA'),
  (2006, 'DAL', 'SAS', 'NBA'),
  (2006, 'DET', 'CLE', 'NBA'),
  (2006, 'PHX', 'LAC', 'NBA'),
  (2006, 'PHX', 'LAL', 'NBA'),
  (2007, 'UTA', 'HOU', 'NBA'),
  (2008, 'BOS', 'ATL', 'NBA'),
  (2008, 'BOS', 'CLE', 'NBA'),
  (2008, 'SAS', 'NOH', 'NBA'),
  (2009, 'ATL', 'MIA', 'NBA'),
  (2009, 'BOS', 'CHI', 'NBA'),
  (2009, 'LAL', 'HOU', 'NBA'),
  (2009, 'ORL', 'BOS', 'NBA'),
  (2010, 'ATL', 'MIL', 'NBA'),
  (2010, 'LAL', 'BOS', 'NBA'),
  (2011, 'OKC', 'MEM', 'NBA'),
  (2012, 'BOS', 'PHI', 'NBA'),
  (2012, 'LAC', 'MEM', 'NBA'),
  (2012, 'LAL', 'DEN', 'NBA'),
  (2012, 'MIA', 'BOS', 'NBA'),
  (2013, 'CHI', 'BKN', 'NBA'),
  (2013, 'MIA', 'IND', 'NBA'),
  (2013, 'MIA', 'SAS', 'NBA'),
  (2014, 'BKN', 'TOR', 'NBA'),
  (2014, 'IND', 'ATL', 'NBA'),
  (2014, 'LAC', 'GSW', 'NBA'),
  (2014, 'OKC', 'MEM', 'NBA'),
  (2014, 'SAS', 'DAL', 'NBA'),
  (2015, 'HOU', 'LAC', 'NBA'),
  (2015, 'LAC', 'SAS', 'NBA'),
  (2016, 'CLE', 'GSW', 'NBA'),
  (2016, 'GSW', 'OKC', 'NBA'),
  (2016, 'MIA', 'CHA', 'NBA'),
  (2016, 'TOR', 'IND', 'NBA'),
  (2016, 'TOR', 'MIA', 'NBA'),
  (2017, 'BOS', 'WAS', 'NBA'),
  (2017, 'UTA', 'LAC', 'NBA'),
  (2018, 'BOS', 'MIL', 'NBA'),
  (2018, 'CLE', 'BOS', 'NBA'),
  (2018, 'CLE', 'IND', 'NBA'),
  (2018, 'GSW', 'HOU', 'NBA'),
  (2019, 'DEN', 'SAS', 'NBA'),
  (2019, 'POR', 'DEN', 'NBA'),
  (2019, 'TOR', 'PHI', 'NBA'),
  (2020, 'BOS', 'TOR', 'NBA'),
  (2020, 'DEN', 'LAC', 'NBA'),
  (2020, 'DEN', 'UTA', 'NBA'),
  (2020, 'HOU', 'OKC', 'NBA'),
  (2021, 'ATL', 'PHI', 'NBA'),
  (2021, 'LAC', 'DAL', 'NBA'),
  (2021, 'MIL', 'BKN', 'NBA'),
  (2022, 'BOS', 'MIA', 'NBA'),
  (2022, 'BOS', 'MIL', 'NBA'),
  (2022, 'DAL', 'PHX', 'NBA'),
  (2023, 'BOS', 'PHI', 'NBA'),
  (2023, 'GSW', 'SAC', 'NBA'),
  (2023, 'MIA', 'BOS', 'NBA'),
  (2024, 'CLE', 'ORL', 'NBA'),
  (2024, 'IND', 'NYK', 'NBA'),
  (2024, 'MIN', 'DEN', 'NBA'),
  (2025, 'DEN', 'LAC', 'NBA'),
  (2025, 'GSW', 'HOU', 'NBA'),
  (2025, 'OKC', 'DEN', 'NBA'),
  (2025, 'OKC', 'IND', 'NBA'),
  (2026, 'CLE', 'DET', 'NBA'),
  (2026, 'CLE', 'TOR', 'NBA'),
  (2026, 'DET', 'ORL', 'NBA'),
  (2026, 'SAS', 'OKC', 'NBA'),
  (2026, 'PHI', 'BOS', 'NBA');

CREATE TEMP TABLE curated_venue (year integer, team_a text, team_b text, game7_home text) ON COMMIT DROP;
INSERT INTO curated_venue (year, team_a, team_b, game7_home) VALUES
  (1948, 'PHW', 'SLB', 'SLB'),
  (1951, 'ROR', 'NYK', 'ROR'),
  (1952, 'MPL', 'NYK', 'MPL'),
  (1954, 'MPL', 'SYR', 'MPL'),
  (1955, 'SYR', 'FWP', 'SYR'),
  (1957, 'BOS', 'SLH', 'BOS'),
  (1959, 'BOS', 'SYR', 'BOS'),
  (1960, 'BOS', 'SLH', 'BOS'),
  (1960, 'SLH', 'MPL', 'SLH'),
  (1961, 'SLH', 'LAL', 'SLH'),
  (1962, 'BOS', 'LAL', 'BOS'),
  (1962, 'BOS', 'PHW', 'BOS'),
  (1963, 'BOS', 'CNR', 'BOS'),
  (1963, 'LAL', 'SLH', 'LAL'),
  (1964, 'SFW', 'SLH', 'SFW'),
  (1965, 'BOS', 'PHI', 'BOS'),
  (1966, 'BOS', 'LAL', 'BOS'),
  (1966, 'LAL', 'SLH', 'LAL'),
  (1968, 'BOS', 'PHI', 'PHI'),
  (1969, 'BOS', 'LAL', 'LAL'),
  (1970, 'LAL', 'PHX', 'LAL'),
  (1970, 'NYK', 'BLB', 'NYK'),
  (1970, 'NYK', 'LAL', 'NYK'),
  (1971, 'BLB', 'NYK', 'NYK'),
  (1971, 'BLB', 'PHI', 'BLB'),
  (1971, 'LAL', 'CHI', 'LAL'),
  (1973, 'LAL', 'CHI', 'LAL'),
  (1973, 'NYK', 'BOS', 'BOS'),
  (1974, 'BOS', 'MIL', 'MIL'),
  (1974, 'CHI', 'DET', 'CHI'),
  (1974, 'NYK', 'CPB', 'NYK'),
  (1975, 'GSW', 'CHI', 'GSW'),
  (1975, 'WSB', 'BUF', 'WSB'),
  (1976, 'CLE', 'WSB', 'CLE'),
  (1976, 'PHX', 'GSW', 'GSW'),
  (1977, 'LAL', 'GSW', 'LAL'),
  (1977, 'PHI', 'BOS', 'PHI'),
  (1978, 'DEN', 'MIL', 'DEN'),
  (1978, 'WSB', 'SEA', 'SEA'),
  (1979, 'SAS', 'PHI', 'SAS'),
  (1979, 'SEA', 'PHX', 'SEA'),
  (1979, 'WSB', 'ATL', 'WSB'),
  (1979, 'WSB', 'SAS', 'WSB'),
  (1980, 'SEA', 'MIL', 'SEA'),
  (1981, 'BOS', 'PHI', 'BOS'),
  (1981, 'HOU', 'SAS', 'SAS'),
  (1981, 'KCK', 'PHX', 'PHX'),
  (1981, 'PHI', 'MIL', 'PHI'),
  (1982, 'PHI', 'BOS', 'BOS'),
  (1984, 'BOS', 'LAL', 'BOS'),
  (1984, 'BOS', 'NYK', 'BOS'),
  (1986, 'MIL', 'PHI', 'MIL'),
  (1987, 'BOS', 'DET', 'BOS'),
  (1987, 'BOS', 'MIL', 'BOS'),
  (1988, 'BOS', 'ATL', 'BOS'),
  (1988, 'LAL', 'DAL', 'LAL'),
  (1988, 'LAL', 'DET', 'LAL'),
  (1988, 'LAL', 'UTA', 'LAL'),
  (1990, 'DET', 'CHI', 'DET'),
  (1990, 'POR', 'SAS', 'POR'),
  (1992, 'CHI', 'NYK', 'CHI'),
  (1992, 'CLE', 'BOS', 'CLE'),
  (1993, 'PHX', 'SEA', 'PHX'),
  (1993, 'SEA', 'HOU', 'SEA'),
  (1994, 'HOU', 'NYK', 'HOU'),
  (1994, 'HOU', 'PHX', 'HOU'),
  (1994, 'NYK', 'CHI', 'NYK'),
  (1994, 'NYK', 'IND', 'NYK'),
  (1994, 'UTA', 'DEN', 'UTA'),
  (1995, 'HOU', 'PHX', 'PHX'),
  (1995, 'IND', 'NYK', 'NYK'),
  (1995, 'ORL', 'IND', 'ORL'),
  (1996, 'SEA', 'UTA', 'SEA'),
  (1997, 'HOU', 'SEA', 'HOU'),
  (1997, 'MIA', 'NYK', 'MIA'),
  (1998, 'CHI', 'IND', 'CHI'),
  (2000, 'LAL', 'POR', 'LAL'),
  (2000, 'NYK', 'MIA', 'MIA'),
  (2001, 'MIL', 'CHA', 'MIL'),
  (2001, 'PHI', 'MIL', 'PHI'),
  (2001, 'PHI', 'TOR', 'PHI'),
  (2002, 'LAL', 'SAC', 'SAC'),
  (2003, 'DAL', 'POR', 'DAL'),
  (2003, 'DAL', 'SAC', 'DAL'),
  (2003, 'DET', 'ORL', 'DET'),
  (2004, 'DET', 'NJN', 'DET'),
  (2004, 'MIA', 'NOH', 'MIA'),
  (2004, 'MIN', 'SAC', 'MIN'),
  (2005, 'DAL', 'HOU', 'DAL'),
  (2005, 'DET', 'MIA', 'MIA'),
  (2005, 'IND', 'BOS', 'BOS'),
  (2005, 'SAS', 'DET', 'SAS'),
  (2006, 'DAL', 'SAS', 'SAS'),
  (2006, 'DET', 'CLE', 'DET'),
  (2006, 'PHX', 'LAC', 'PHX'),
  (2006, 'PHX', 'LAL', 'PHX'),
  (2007, 'UTA', 'HOU', 'HOU'),
  (2008, 'BOS', 'ATL', 'BOS'),
  (2008, 'BOS', 'CLE', 'BOS'),
  (2008, 'SAS', 'NOH', 'NOH'),
  (2009, 'ATL', 'MIA', 'ATL'),
  (2009, 'BOS', 'CHI', 'BOS'),
  (2009, 'LAL', 'HOU', 'LAL'),
  (2009, 'ORL', 'BOS', 'BOS'),
  (2010, 'ATL', 'MIL', 'ATL'),
  (2010, 'LAL', 'BOS', 'LAL'),
  (2011, 'OKC', 'MEM', 'OKC'),
  (2012, 'BOS', 'PHI', 'BOS'),
  (2012, 'LAC', 'MEM', 'MEM'),
  (2012, 'LAL', 'DEN', 'LAL'),
  (2012, 'MIA', 'BOS', 'MIA'),
  (2013, 'CHI', 'BKN', 'BKN'),
  (2013, 'MIA', 'IND', 'MIA'),
  (2013, 'MIA', 'SAS', 'MIA'),
  (2014, 'BKN', 'TOR', 'TOR'),
  (2014, 'IND', 'ATL', 'IND'),
  (2014, 'LAC', 'GSW', 'LAC'),
  (2014, 'OKC', 'MEM', 'OKC'),
  (2014, 'SAS', 'DAL', 'SAS'),
  (2015, 'HOU', 'LAC', 'HOU'),
  (2015, 'LAC', 'SAS', 'LAC'),
  (2016, 'CLE', 'GSW', 'GSW'),
  (2016, 'GSW', 'OKC', 'GSW'),
  (2016, 'MIA', 'CHA', 'MIA'),
  (2016, 'TOR', 'IND', 'TOR'),
  (2016, 'TOR', 'MIA', 'TOR'),
  (2017, 'BOS', 'WAS', 'BOS'),
  (2017, 'UTA', 'LAC', 'LAC'),
  (2018, 'BOS', 'MIL', 'BOS'),
  (2018, 'CLE', 'BOS', 'BOS'),
  (2018, 'CLE', 'IND', 'CLE'),
  (2018, 'GSW', 'HOU', 'HOU'),
  (2019, 'DEN', 'SAS', 'DEN'),
  (2019, 'POR', 'DEN', 'DEN'),
  (2019, 'TOR', 'PHI', 'TOR'),
  (2020, 'BOS', 'TOR', 'TOR'),
  (2020, 'DEN', 'LAC', 'LAC'),
  (2020, 'DEN', 'UTA', 'DEN'),
  (2020, 'HOU', 'OKC', 'HOU'),
  (2021, 'ATL', 'PHI', 'PHI'),
  (2021, 'LAC', 'DAL', 'LAC'),
  (2021, 'MIL', 'BKN', 'BKN'),
  (2022, 'BOS', 'MIA', 'MIA'),
  (2022, 'BOS', 'MIL', 'BOS'),
  (2022, 'DAL', 'PHX', 'PHX'),
  (2023, 'BOS', 'PHI', 'BOS'),
  (2023, 'GSW', 'SAC', 'SAC'),
  (2023, 'MIA', 'BOS', 'BOS'),
  (2024, 'CLE', 'ORL', 'CLE'),
  (2024, 'IND', 'NYK', 'NYK'),
  (2024, 'MIN', 'DEN', 'DEN'),
  (2025, 'DEN', 'LAC', 'DEN'),
  (2025, 'GSW', 'HOU', 'HOU'),
  (2025, 'OKC', 'DEN', 'OKC'),
  (2025, 'OKC', 'IND', 'OKC'),
  (2026, 'CLE', 'DET', 'DET'),
  (2026, 'CLE', 'TOR', 'CLE'),
  (2026, 'DET', 'ORL', 'DET'),
  (2026, 'SAS', 'OKC', 'OKC'),
  (2026, 'PHI', 'BOS', 'BOS');

ALTER TABLE public.series ADD COLUMN league text;

-- Guard league_row_match: every curated league row resolves to exactly one
-- stored series. Zero matches is a year/abbreviation typo; two is a
-- slot-swapped twin (00014's UNIQUE guards the pair as stored, not this).
DO $guard$
DECLARE
  v_row record;
  v_matches integer;
BEGIN
  FOR v_row IN SELECT c.year, c.team_a, c.team_b, c.league FROM curated_league c LOOP
    SELECT count(*) INTO v_matches
      FROM public.series s
      JOIN public.teams ta ON ta.id = s.team_a_id
      JOIN public.teams tb ON tb.id = s.team_b_id
     WHERE s.year = v_row.year
       AND ((ta.abbreviation = v_row.team_a AND tb.abbreviation = v_row.team_b)
         OR (ta.abbreviation = v_row.team_b AND tb.abbreviation = v_row.team_a));
    IF v_matches <> 1 THEN
      RAISE EXCEPTION '00016 guard league_row_match: curated league row (%, %, %) matches % series — expected exactly one',
        v_row.year, v_row.team_a, v_row.team_b, v_matches
        USING ERRCODE = '23514';
    END IF;
  END LOOP;
END
$guard$;

UPDATE public.series s
   SET league = c.league
  FROM curated_league c
  JOIN public.teams ta ON ta.abbreviation = c.team_a
  JOIN public.teams tb ON tb.abbreviation = c.team_b
 WHERE s.year = c.year
   AND ((s.team_a_id = ta.id AND s.team_b_id = tb.id)
     OR (s.team_a_id = tb.id AND s.team_b_id = ta.id));

-- Guard league_backfill_complete: the curated file covers every stored
-- series, so SET NOT NULL below cannot strand a row.
DO $guard$
DECLARE
  v_null integer;
  v_example record;
BEGIN
  SELECT count(*) INTO v_null FROM public.series WHERE league IS NULL;
  IF v_null <> 0 THEN
    SELECT s.year, ta.abbreviation AS a, tb.abbreviation AS b
      INTO v_example
      FROM public.series s
      JOIN public.teams ta ON ta.id = s.team_a_id
      JOIN public.teams tb ON tb.id = s.team_b_id
     WHERE s.league IS NULL
     LIMIT 1;
    RAISE EXCEPTION '00016 guard league_backfill_complete: % series row(s) left with NULL league (e.g. %, %, %) — the curated file does not cover the archive. Either curation is incomplete or the live archive grew after it was cut (spec-2-8 D5): re-measure the table, append the newer series to game7_venues_curated.csv and re-derive the pinned counts in the same commit. One case cannot be appended (Story 2.12): a series with no Game 7 played — winner_team_id IS NULL, pending per AD-4 — has no venue to curate, so no curated row for it can exist; let the pipeline decide that Game 7 (its winner then names a real venue) and re-measure, and never delete a series row to satisfy this guard. Relaxing this guard is not the route',
      v_null, v_example.year, v_example.a, v_example.b
      USING ERRCODE = '23514';
  END IF;
END
$guard$;

-- Guard aba_row_census: the pinned composition (18 ABA) holds, so a mis-keyed
-- league list cannot quietly resize the populations Story 2.5 counts against.
DO $guard$
DECLARE
  v_aba integer;
BEGIN
  SELECT count(*) INTO v_aba FROM public.series WHERE league = 'ABA';
  IF v_aba <> 18 THEN
    RAISE EXCEPTION '00016 guard aba_row_census: ABA series count is %, expected exactly 18 (epic-2-context pinned league composition 160 NBA/BAA + 18 ABA)', v_aba
      USING ERRCODE = '23514';
  END IF;
END
$guard$;

ALTER TABLE public.series ALTER COLUMN league SET NOT NULL;
ALTER TABLE public.series ALTER COLUMN league SET DEFAULT 'NBA';
ALTER TABLE public.series ADD CONSTRAINT series_league_check CHECK (league IN ('NBA', 'BAA', 'ABA'));

-- Guard venue_row_match: every curated venue row resolves to exactly one
-- series (the league loop above ran the same rule over the league list; this
-- one covers the venue list independently).
DO $guard$
DECLARE
  v_row record;
  v_matches integer;
BEGIN
  FOR v_row IN SELECT c.year, c.team_a, c.team_b, c.game7_home FROM curated_venue c LOOP
    SELECT count(*) INTO v_matches
      FROM public.series s
      JOIN public.teams ta ON ta.id = s.team_a_id
      JOIN public.teams tb ON tb.id = s.team_b_id
     WHERE s.year = v_row.year
       AND ((ta.abbreviation = v_row.team_a AND tb.abbreviation = v_row.team_b)
         OR (ta.abbreviation = v_row.team_b AND tb.abbreviation = v_row.team_a));
    IF v_matches <> 1 THEN
      RAISE EXCEPTION '00016 guard venue_row_match: curated venue row (%, %, %) matches % series — expected exactly one',
        v_row.year, v_row.team_a, v_row.team_b, v_matches
        USING ERRCODE = '23514';
    END IF;
  END LOOP;
END
$guard$;

-- Guard venue_coverage: every NBA/BAA series carries exactly one curated
-- Game-7 venue row. This is the migration-side echo of the generator's
-- refuse-to-emit gate: a blank venue hand-bypassed into a missing row fails
-- here too, naming the uncovered series rather than silently leaving it on
-- the winner-fiction orientation.
DO $guard$
DECLARE
  v_missing integer;
  v_example record;
BEGIN
  SELECT count(*) INTO v_missing
    FROM public.series s
   WHERE s.league IN ('NBA', 'BAA')
     AND NOT EXISTS (
       SELECT 1
         FROM curated_venue c
         JOIN public.teams ta ON ta.id = s.team_a_id
         JOIN public.teams tb ON tb.id = s.team_b_id
        WHERE c.year = s.year
          AND ((ta.abbreviation = c.team_a AND tb.abbreviation = c.team_b)
            OR (ta.abbreviation = c.team_b AND tb.abbreviation = c.team_a))
     );
  IF v_missing <> 0 THEN
    SELECT s.year, ta.abbreviation AS a, tb.abbreviation AS b
      INTO v_example
      FROM public.series s
      JOIN public.teams ta ON ta.id = s.team_a_id
      JOIN public.teams tb ON tb.id = s.team_b_id
     WHERE s.league IN ('NBA', 'BAA')
       AND NOT EXISTS (
         SELECT 1
           FROM curated_venue c
           JOIN public.teams tta ON tta.id = s.team_a_id
           JOIN public.teams ttb ON ttb.id = s.team_b_id
          WHERE c.year = s.year
            AND ((tta.abbreviation = c.team_a AND ttb.abbreviation = c.team_b)
              OR (tta.abbreviation = c.team_b AND ttb.abbreviation = c.team_a))
       )
     LIMIT 1;
    RAISE EXCEPTION '00016 guard venue_coverage: % NBA/BAA archived series have no curated Game-7 venue row (e.g. %, %, %) — curation is incomplete and hand-bypass is not a route. If these rows are newer than the curated file, the archive grew after it was cut (spec-2-8 D5): append them and re-derive the pinned counts in the same commit that changes this migration. One case cannot be appended (Story 2.12): a series with no Game 7 played — winner_team_id IS NULL, pending per AD-4 — has no venue to curate, so appending it to game7_venues_curated.csv is impossible advice; let the pipeline decide that Game 7 (its winner then names a real venue) and re-measure, and never delete a series row to satisfy this guard',
      v_missing, v_example.year, v_example.a, v_example.b
      USING ERRCODE = '23514';
  END IF;
END
$guard$;

-- Guard orientation_conflict — the three-case rule, checked before any
-- update so no row can be clobbered mid-transaction:
--   1. stored game-7 home = curated home  -> keep (no statement touches it);
--   2. stored game-7 home = team_a (the canonical 00007 state) -> swap below;
--   3. anything else -> abort naming the series. This is the 178th-series
--      protection: production measured home = team_a in 177 of 178 series,
--      so exactly one archived series may already carry a real venue, and a
--      curated list must never overwrite one silently.
DO $guard$
DECLARE
  v record;
BEGIN
  SELECT s.year AS year, ta.abbreviation AS a, tb.abbreviation AS b, th.abbreviation AS stored_home, ch.abbreviation AS curated_home
    INTO v
    FROM public.series s
    JOIN public.teams ta ON ta.id = s.team_a_id
    JOIN public.teams tb ON tb.id = s.team_b_id
    JOIN public.series_game_scores g ON g.series_id = s.id AND g.game_number = 7
    JOIN public.teams th ON th.id = g.home_team_id
    JOIN curated_venue c ON c.year = s.year
      AND ((c.team_a = ta.abbreviation AND c.team_b = tb.abbreviation)
        OR (c.team_a = tb.abbreviation AND c.team_b = ta.abbreviation))
    JOIN public.teams ch ON ch.abbreviation = c.game7_home
   WHERE s.league IN ('NBA', 'BAA')
     AND g.home_team_id <> ch.id
     AND g.home_team_id <> s.team_a_id
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION '00016 guard orientation_conflict: game 7 of series % (%) already carries home % — neither the canonical team_a side nor the curated %; refusing to overwrite a row that is neither state',
      v.year, v.a || ' vs ' || v.b, v.stored_home, v.curated_home
      USING ERRCODE = '23514';
  END IF;
END
$guard$;

-- The orientation fix. Only case-2 rows qualify: stored home is the
-- canonical team_a side AND the curated home is the team_b side. Teams and
-- scores exchange in ONE statement — Postgres evaluates every SET expression
-- against the pre-update row, so the exchange is atomic and winner_team_id
-- needs no touch (and gets none). ABA rows are excluded by the league
-- filter; no statement here or above touches game_number <> 7.
UPDATE public.series_game_scores g
   SET home_team_id = s.team_b_id,
       away_team_id = s.team_a_id,
       home_score = g.away_score,
       away_score = g.home_score
  FROM public.series s
  JOIN public.teams ta ON ta.id = s.team_a_id
  JOIN public.teams tb ON tb.id = s.team_b_id
  JOIN curated_venue c ON c.year = s.year
    AND ((c.team_a = ta.abbreviation AND c.team_b = tb.abbreviation)
      OR (c.team_a = tb.abbreviation AND c.team_b = ta.abbreviation))
 WHERE g.series_id = s.id
   AND g.game_number = 7
   AND s.league IN ('NBA', 'BAA')
   AND g.home_team_id = s.team_a_id
   AND c.game7_home = tb.abbreviation;

-- Guard game7_home_win_census — the curated list's own checksum: nba.com's
-- published 117-43 over exactly the NBA/BAA Game-7 population this backfill
-- covers. It asserts BOTH numbers it names (review pass 1, E6): the 160-series
-- population first, then the 117 — the 117 is only meaningful over exactly
-- that set. A list with a single wrong row does not land on 117; a compensating
-- pair does, which is the residual risk the owner-run curation route (D1)
-- accepts. If this lands 116 or 118, Story 2.8 resolves WHICH in writing
-- (one mis-curated row vs. the published as-of date excluding the 2026
-- Finals) before the owner applies — relaxing or deleting this guard is not
-- an acceptable resolution.
DO $guard$
DECLARE
  v_home_wins integer;
  v_population integer;
BEGIN
  SELECT count(*) INTO v_home_wins
    FROM public.series_game_scores g
    JOIN public.series s ON s.id = g.series_id
   WHERE g.game_number = 7
     AND s.league IN ('NBA', 'BAA')
     AND g.home_score > g.away_score;
  SELECT count(*) INTO v_population FROM public.series WHERE league IN ('NBA', 'BAA');
  IF v_population <> 160 THEN
    RAISE EXCEPTION '00016 guard game7_home_win_census: NBA/BAA Game-7 population is %, expected exactly 160 (the published 117-43 is taken over exactly this set) — resolve in writing before applying, do not relax this guard',
      v_population
      USING ERRCODE = '23514';
  END IF;
  IF v_home_wins <> 117 THEN
    RAISE EXCEPTION '00016 guard game7_home_win_census: Game-7 home wins over the NBA/BAA archive = % (population %), expected exactly 117 — the published 117-43 covers the same 160 Game 7s; resolve the delta in writing before applying, do not relax this guard',
      v_home_wins, v_population
      USING ERRCODE = '23514';
  END IF;
END
$guard$;

-- Guard row_winner_consistency: for every game row (all 1246),
-- winner_team_id is the higher-scoring side. The swap could not break this by
-- construction (scores travel with their teams), and this is what proves the
-- claim rather than asserting it — no migration has data-guarded before this
-- one, which is exactly why the rehearsal tampers it (spec I/O matrix).
DO $guard$
DECLARE
  v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
    FROM public.series_game_scores g
   WHERE g.winner_team_id IS DISTINCT FROM
     (CASE WHEN g.home_score > g.away_score THEN g.home_team_id ELSE g.away_team_id END);
  IF v_bad <> 0 THEN
    RAISE EXCEPTION '00016 guard row_winner_consistency: % game row(s) whose winner_team_id is not the higher-scoring side — AD-4 derivation must survive the data change intact. This drift predates 00016 (it scans games 1-6 and the ABA rows too): measure it against the live table before applying rather than assuming the backfill caused it', v_bad
      USING ERRCODE = '23514';
  END IF;
END
$guard$;

-- Guard series_winner_game7_consistency: every archived series'
-- winner_team_id still equals its game-7 winner (derived from game 7's
-- scores, never stored).
DO $guard$
DECLARE
  v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
    FROM public.series s
    JOIN public.series_game_scores g ON g.series_id = s.id AND g.game_number = 7
   WHERE s.winner_team_id IS NOT NULL
     AND s.winner_team_id IS DISTINCT FROM
       (CASE WHEN g.home_score > g.away_score THEN g.home_team_id ELSE g.away_team_id END);
  IF v_bad <> 0 THEN
    RAISE EXCEPTION '00016 guard series_winner_game7_consistency: % archived series whose winner_team_id is not their game-7 winner — AD-4 derivation must survive the data change intact. 00016 never writes winner_team_id, so a failure here is pre-existing drift: measure it before applying', v_bad
      USING ERRCODE = '23514';
  END IF;
END
$guard$;

COMMIT;
