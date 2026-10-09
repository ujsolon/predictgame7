import { getTeamCode } from '@/lib/nba-utils';
import { getTeamLogo, getTypedTeamCode, resolveTeamLogoUrl } from '@/lib/team-logos';
import type { PredictionForm, PredictionResult } from '@/types/prediction';
import type { SelectedSeries } from './types';
import type { RowFor } from './useSeriesCatalog';

/**
 * Names, stored codes and logos for a prediction's two teams. The compact
 * result card and the detailed sheet read the same resolution (Story 2.11 U6),
 * including the custom matchup, whose rows come from U15's index rather than a
 * series FK.
 */
export function resolveResultTeams(
  prediction: PredictionResult,
  selectedSeries: SelectedSeries | null,
  customInput: PredictionForm,
  rowFor: RowFor,
) {
  const fallbackTeamA = selectedSeries?.source === 'custom' ? customInput.team_a : selectedSeries?.data?.team_a?.full_name;
  const fallbackTeamB = selectedSeries?.source === 'custom' ? customInput.team_b : selectedSeries?.data?.team_b?.full_name;
  const teamAName = prediction.team_a || fallbackTeamA || 'Team A';
  const teamBName = prediction.team_b || fallbackTeamB || 'Team B';
  // Story 2.11 (U6/U7): the card prints the embedded rows' stored
  // codes. `predicted_winner` resolves client-side through the two
  // candidate rows — the contract carries names only
  // (`_shared/contract.ts:51-56`) and the function echoes the exact
  // row names back, so equality matching is safe and no Edge
  // Function deploy is needed (U7). A custom matchup has no series FK,
  // so its rows come from U15's index by the same name the trigger
  // label resolved, and a typed nickname resolves through the logo
  // alias table (U16) — otherwise the card would print a name
  // initialism beside a label reading the stored code.
  const rowA = selectedSeries?.data?.team_a ?? rowFor(teamAName);
  const rowB = selectedSeries?.data?.team_b ?? rowFor(teamBName);
  // U16: a custom matchup's names are typed text, so they resolve
  // the way its label and logo do; a series keeps its FK rows.
  const codeFor = selectedSeries?.source === 'custom' ? getTypedTeamCode : getTeamCode;
  const codeA = codeFor(teamAName, rowA);
  const codeB = codeFor(teamBName, rowB);
  const winnerCode = codeFor(prediction.predicted_winner, rowA, rowB);
  const teamALogo = resolveTeamLogoUrl(prediction.team_a_logo) || resolveTeamLogoUrl(selectedSeries?.data?.team_a?.logo_url) || getTeamLogo(teamAName);
  const teamBLogo = resolveTeamLogoUrl(prediction.team_b_logo) || resolveTeamLogoUrl(selectedSeries?.data?.team_b?.logo_url) || getTeamLogo(teamBName);
  return { teamAName, teamBName, codeA, codeB, winnerCode, teamALogo, teamBLogo };
}
