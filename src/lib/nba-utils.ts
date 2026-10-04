import type { Team } from '@/types/types';

// Story 2.11 (owner decision U8): the two custom-matchup placeholders are the
// only team literals this file carries. They are deliberately **not** `teams`
// rows — a row each would re-pin `EXPECTED_TEAM_COUNT = 59` in
// `supabase/scripts/pipeline/venueBackfill.ts` for a display convenience — so
// the one place their codes exist is here. Every other code comes from the
// table: the retired `TEAM_ABBREVIATIONS` map duplicated 30 of the 59 seeded
// `teams.abbreviation` values and nothing else, and a second name→code source
// is exactly the drift Story 2.11 removes (measured 2026-10-02: 0 names absent
// from the table, 0 value mismatches).
export const PLACEHOLDER_ABBREVIATIONS: Record<string, string> = {
  'Team A': 'TMA',
  'Team B': 'TMB',
};

/**
 * The name path — Story 2.11 leaves `getTeamAbbreviation` as the last resort of
 * a three-step resolution order (row `abbreviation` → placeholder literal →
 * this). It derives a code from a fan-typed string: two or more words take their
 * initials (2–3 letters), anything else truncates to three characters. It knows
 * no franchise: the hardcoded map that used to answer `"Boston Celtics"` here was
 * deleted in Story 2.11, so a bare modern name now yields the initialism (`BC`)
 * unless the caller has the `teams` row to hand — which is what `getTeamCode` is
 * for, and why every surface that holds a row goes through it.
 */
export const getTeamAbbreviation = (name: string): string => {
  if (!name) return '';
  const trimmedName = name.trim();

  const words = trimmedName.split(/\s+/);
  if (words.length >= 2) {
    const abbrev = words.map(w => w[0]).join('').toUpperCase();
    if (abbrev.length >= 2 && abbrev.length <= 3) return abbrev;
  }
  return trimmedName.substring(0, 3).toUpperCase();
};

/**
 * One team code everywhere (Story 2.11): wherever the `teams` FK row is in hand,
 * the **stored** `teams.abbreviation` is the single source — for display and for
 * search — and a fan can type back what a row prints.
 *
 * Resolution order, fixed by owner decision U6 at every converted site:
 *   1. a row whose `full_name` matches `name` case-insensitively after trim and
 *      whose `abbreviation` is non-empty → that stored code (U15 extends "the row
 *      the series FK points at" to "a row matched by the typed name", so the
 *      custom-matchup form reads the rows the picker fetch already loaded;
 *      case-insensitive because that index is keyed on the lower-cased
 *      `full_name`, so the two arms have to agree or a lowercase-typed name would
 *      hit the index and be rejected here);
 *   2. the `Team A`/`Team B` placeholder literal (U8) — load-bearing, not
 *      decorative: the result card's own fallback chain
 *      (`PredictPage.tsx:1192-1193`, `:1289-1290`) can hand this helper the
 *      literal `'Team A'`, which the map resolved to `TMA` and a bare initialism
 *      would turn into `TA`;
 *   3. `getTeamAbbreviation(name)`, the name path.
 *
 * `rows` is variadic because the predicted-winner sites hold two candidate rows
 * and only a `full_name` to discriminate: `_shared/contract.ts` carries names,
 * and `predict-game-7` echoes the exact row names back
 * (`supabase/functions/predict-game-7/index.ts:372,380`), so equality matching is
 * safe and owner decision U7 needed no contract change and no deploy.
 *
 * A row with an empty `abbreviation` is skipped rather than printed blank — an
 * empty cell never renders, the fall-through stays visible (fail visible).
 */
export const getTeamCode = (name: string, ...rows: Array<Team | null | undefined>): string => {
  const trimmed = (name ?? '').trim();
  const needle = trimmed.toLowerCase();
  const match = rows.find((row) => row?.full_name?.toLowerCase() === needle && row.abbreviation);
  if (match) return match.abbreviation;
  return PLACEHOLDER_ABBREVIATIONS[trimmed] ?? getTeamAbbreviation(trimmed);
};

// Story 1.4 (issue #3): branch order AND the conference predicate are the
// fix. 'Semifinals' contains 'finals', so the semifinal branch must run
// before the bare-finals branch; and no ordering of the old predicate
// `includes('conf finals')` matches 'Conference Finals' (lowercased it reads
// 'conference finals'), so the conference branch tests
// `includes('conf') && includes('finals')` and also runs before the
// bare-finals branch ('Conference' contains 'conf'). Every value the pipeline
// vocabulary produced before ('NBA Finals' 4, 'Conference Semifinals' 2,
// 'First Round' 1) is unchanged.
export const getRoundImportance = (round: string) => {
  const r = round.toLowerCase();
  if (r.includes('semifinals')) return 2;
  if (r.includes('conf') && r.includes('finals')) return 3;
  if (r.includes('finals')) return 4;
  if (r.includes('first round')) return 1;
  return 0;
};
