-- =========================================================
-- Predict Game 7 — teams.espn_code, the feed's identity column
-- Migration 00018 (Story 2.13)
-- =========================================================
-- Adds the ONE column the `espn` scheduled source resolves through, and seeds it
-- for the 30 modern franchises. Additive and nullable by design: the archive's
-- ABA and BAA-era franchises have no ESPN modern-code to carry, and nothing the
-- feed resolves today needs a value for them.

-- Source of every value below: `tests/pipeline/fixtures/espn-teams-site-20261004.json`,
-- a verbatim capture of `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams`
-- made 2026-10-04 (owner released the no-agent-fetch rule for that capture;
-- `_bmad-output/specs/spec-2-13-espn-feed-adapter/run-sheet.md` step 1 records the
-- provenance, including that resolution went through a public DoH resolver because
-- this machine's UDP/53 path refuses the name). `espn-adapter.test.ts` re-reads
-- both files and reddens if this seed and that payload ever disagree, so no code
-- here is hand-transcribed from a terminal paste and nothing is inferred about
-- what ESPN "probably" prints.
--
-- What the capture measures, and why the join had to be a new column at all:
--   - 24 of 30 franchises print the SAME string ESPN prints and `00005` seeds in
--     `teams.abbreviation`.
--   - 6 do NOT: GS→GSW, NO→NOP, UTAH→UTA, WSH→WAS, NY→NYK, SA→SAS. The last two
--     were measured by Story 2.4 against the archive; the first four are the rows
--     `payload-contract.md` carried as "assumed to agree" until CAP-8's cross-check
--     measured them. It measured them and four of the assumed twenty-six disagreed.
--   - ESPN's own `team.id` is NOT usable as the identity either: it differs from
--     `teams.id` on 27 of 30 rows (the Knicks are ESPN 18 and ours 20). This
--     migration never mentions an ESPN id.
--   - Names are not usable either: ESPN's `displayName` is `LA Clippers` where
--     `00005` stores `Los Angeles Clippers`. That single mismatch is why the
--     adapter resolves through this column and nothing substring-, city- or
--     nickname-shaped exists in `adapters/espn.ts`.
--
-- The two committed scoreboard captures print six codes between them — CLE, DEN,
-- GS, HOU, IND, LAC — and every one of them is byte-identical to the same
-- franchise's string in the site list above, including `GS` for the Warriors. That
-- is a sample, not all thirty; what makes this column the join key for
-- `competitors[].team.abbreviation` rather than a second opinion is that the
-- competitor team object carries NO other code-shaped field on either route.

BEGIN;

ALTER TABLE teams ADD COLUMN IF NOT EXISTS espn_code text;

-- The provider code space is 2-4 capital letters on every measured row. The CHECK
-- is what stops a future backfill from writing a display name into an identity
-- column; `NULL` stays legal for the eras ESPN's modern list does not cover.
DO $$
BEGIN
  ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_espn_code_shape;
  ALTER TABLE teams ADD CONSTRAINT teams_espn_code_shape CHECK (espn_code IS NULL OR espn_code ~ '^[A-Z]{2,4}$');
END $$;

-- One franchise per code, and no code shared by two rows — while leaving every
-- unseeded historical row free to stay NULL.
CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_espn_code ON teams (espn_code) WHERE espn_code IS NOT NULL;

-- The 30 modern franchises. Each statement names `teams.id` (the `00005` seed's
-- stable id) so a rename of a franchise cannot silently move a code.
UPDATE teams SET espn_code = 'ATL'  WHERE id = 1;  -- Atlanta Hawks
UPDATE teams SET espn_code = 'BOS'  WHERE id = 2;  -- Boston Celtics
UPDATE teams SET espn_code = 'BKN'  WHERE id = 3;  -- Brooklyn Nets
UPDATE teams SET espn_code = 'CHA'  WHERE id = 4;  -- Charlotte Hornets
UPDATE teams SET espn_code = 'CHI'  WHERE id = 5;  -- Chicago Bulls
UPDATE teams SET espn_code = 'CLE'  WHERE id = 6;  -- Cleveland Cavaliers
UPDATE teams SET espn_code = 'DAL'  WHERE id = 7;  -- Dallas Mavericks
UPDATE teams SET espn_code = 'DEN'  WHERE id = 8;  -- Denver Nuggets
UPDATE teams SET espn_code = 'DET'  WHERE id = 9;  -- Detroit Pistons
UPDATE teams SET espn_code = 'GS'   WHERE id = 10; -- Golden State Warriors  DIVERGES from GSW
UPDATE teams SET espn_code = 'HOU'  WHERE id = 11; -- Houston Rockets
UPDATE teams SET espn_code = 'IND'  WHERE id = 12; -- Indiana Pacers
UPDATE teams SET espn_code = 'LAC'  WHERE id = 13; -- LA Clippers (ESPN) / Los Angeles Clippers (stored)
UPDATE teams SET espn_code = 'LAL'  WHERE id = 14; -- Los Angeles Lakers
UPDATE teams SET espn_code = 'MEM'  WHERE id = 15; -- Memphis Grizzlies
UPDATE teams SET espn_code = 'MIA'  WHERE id = 16; -- Miami Heat
UPDATE teams SET espn_code = 'MIL'  WHERE id = 17; -- Milwaukee Bucks
UPDATE teams SET espn_code = 'MIN'  WHERE id = 18; -- Minnesota Timberwolves
UPDATE teams SET espn_code = 'NO'   WHERE id = 19; -- New Orleans Pelicans   DIVERGES from NOP
UPDATE teams SET espn_code = 'NY'   WHERE id = 20; -- New York Knicks       DIVERGES from NYK
UPDATE teams SET espn_code = 'OKC'  WHERE id = 21; -- Oklahoma City Thunder
UPDATE teams SET espn_code = 'ORL'  WHERE id = 22; -- Orlando Magic
UPDATE teams SET espn_code = 'PHI'  WHERE id = 23; -- Philadelphia 76ers
UPDATE teams SET espn_code = 'PHX'  WHERE id = 24; -- Phoenix Suns
UPDATE teams SET espn_code = 'POR'  WHERE id = 25; -- Portland Trail Blazers
UPDATE teams SET espn_code = 'SAC'  WHERE id = 26; -- Sacramento Kings
UPDATE teams SET espn_code = 'SA'   WHERE id = 27; -- San Antonio Spurs      DIVERGES from SAS
UPDATE teams SET espn_code = 'TOR'  WHERE id = 28; -- Toronto Raptors
UPDATE teams SET espn_code = 'UTAH' WHERE id = 29; -- Utah Jazz             DIVERGES from UTA
UPDATE teams SET espn_code = 'WSH'  WHERE id = 30; -- Washington Wizards    DIVERGES from WAS

-- Post-condition guards, in 00015's raise-to-abort style. Each one is executed
-- with a deliberate violation by `scripts/rehearse-migration-00014.mjs`, because a
-- guard that has never failed is not evidence.
DO $$
DECLARE
  seeded integer;
  distinct_codes integer;
  misplaced text;
  drifted integer;
BEGIN
  SELECT count(*) INTO seeded FROM teams WHERE espn_code IS NOT NULL;
  IF seeded <> 30 THEN
    RAISE EXCEPTION '00018 seeded espn_code on % teams rows, expected exactly 30 — the modern-franchise population changed, so this migration''s list is stale rather than partially applied', seeded;
  END IF;

  SELECT count(DISTINCT espn_code) INTO distinct_codes FROM teams WHERE espn_code IS NOT NULL;
  IF distinct_codes <> 30 THEN
    RAISE EXCEPTION '00018 left % distinct espn_code values across 30 seeded rows — two franchises share a provider code, which the partial unique index should have refused', distinct_codes;
  END IF;

  -- The six divergences are the reason this column exists. If a name-identical
  -- franchise lost its code to a rename, the seed silently became a guess.
  SELECT count(*) INTO drifted FROM teams
   WHERE (full_name, espn_code) IN (
     ('Golden State Warriors', 'GS'), ('New Orleans Pelicans', 'NO'), ('New York Knicks', 'NY'),
     ('San Antonio Spurs', 'SA'), ('Utah Jazz', 'UTAH'), ('Washington Wizards', 'WSH'));
  IF drifted <> 6 THEN
    RAISE EXCEPTION '00018 found only % of the six measured code divergences on their franchises — a divergence landed on the wrong row or a franchise was renamed out from under the capture', drifted;
  END IF;

  -- Nothing outside the modern 30 may carry a code: an accidental write to an
  -- historical row would make the feed resolve a franchise it cannot know.
  SELECT string_agg(full_name, ', ') INTO misplaced FROM teams
   WHERE espn_code IS NOT NULL AND id NOT BETWEEN 1 AND 30;
  IF misplaced IS NOT NULL THEN
    RAISE EXCEPTION '00018 left espn_code on rows outside the seeded 30: % — historical franchises have no measured modern provider code', misplaced;
  END IF;
END $$;

COMMIT;
