import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import SeriesTitle from '@/components/common/SeriesTitle';
import ShareButton from '@/components/common/ShareButton';
import { EVENTS, track } from '@/lib/analytics';
import { matchupLabel } from '@/lib/matchup';
import { METHOD_LABELS, METHOD_MATHS_ANCHORS } from '@/lib/method-display';
import { customPredictionSharePath, seriesPredictionSharePath } from '@/lib/share';
import { seriesPageLink, seriesTitleLine } from '@/pages/series/series-view';
import { sharePayloadFromForm } from '@/lib/share-payload';
import type { PredictionForm, PredictionResult } from '@/types/prediction';
import { ChevronRight, Trophy } from 'lucide-react';
import { resolveResultTeams } from './resultTeams';
import type { SelectedSeries } from './types';
import type { RowFor } from './useSeriesCatalog';

interface DetailedResultProps {
  result: PredictionResult;
  selectedSeries: SelectedSeries | null;
  customInput: PredictionForm;
  rowFor: RowFor;
  onBack: () => void;
  onNewPrediction: () => void;
}

/** The detailed result sheet, with Share (Story 4.4), Back and New Prediction. */
export default function DetailedResult({
  result,
  selectedSeries,
  customInput,
  rowFor,
  onBack,
  onNewPrediction,
}: DetailedResultProps) {
  const prediction = result;
  // The detailed sheet reads the same stored codes as the result card
  // (Story 2.11 U6) — one resolution order on both surfaces, including the
  // custom matchup, whose row comes from U15's index rather than a series FK.
  const { teamAName, teamBName, codeA, codeB, winnerCode, teamALogo, teamBLogo } =
    resolveResultTeams(prediction, selectedSeries, customInput, rowFor);
  const mathsAnchor = METHOD_MATHS_ANCHORS[prediction.method_used];
  // Story 4.4: the share link reproduces this result's series (or custom
  // matchup) and method with zero re-entry. A custom form that would not
  // pass its own validation is never shared — unreachable while a result
  // is on screen, since any edit clears it.
  const sharedPayload =
    selectedSeries?.source === 'custom' ? sharePayloadFromForm(customInput, prediction.method_used) : null;
  const sharePath = selectedSeries?.data
    ? seriesPredictionSharePath(selectedSeries.data, prediction.method_used)
    : sharedPayload
      ? customPredictionSharePath(sharedPayload)
      : null;
  const shareTitle = `${matchupLabel(teamAName, teamBName)} — Game 7 on PredictGame7`;
  // Story 6.2: a series-backed result names its series under the heading —
  // the title line and the matchup, together one link to the series page
  // (`seriesPageLink`, never `/result/`). A custom matchup prints only the typed
  // names, unlinked: it has no series page. So does a series-backed selection
  // whose row is absent — the plain "{A} vs {B}", no year line, no link.
  const seriesRow = selectedSeries?.data;
  const titleBlock = seriesRow ? (
    <SeriesTitle
      title={seriesTitleLine(seriesRow)}
      matchup={matchupLabel(seriesRow.team_a?.full_name ?? teamAName, seriesRow.team_b?.full_name ?? teamBName)}
      to={seriesPageLink(seriesRow)}
      titleClassName="text-base font-medium leading-snug"
      matchupClassName="text-sm"
    />
  ) : selectedSeries ? (
    <SeriesTitle title={null} matchup={matchupLabel(teamAName, teamBName)} to={null} matchupClassName="text-sm" />
  ) : null;
  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-2">
              <CardTitle>Prediction Result</CardTitle>
              {titleBlock}
            </div>
            {sharePath && (
              <ShareButton
                appearance="labelled"
                path={sharePath}
                title={shareTitle}
                surface="predict"
                kind={selectedSeries?.data ? 'series' : 'custom'}
              />
            )}
          </div>
          <CardDescription className="flex items-center gap-2">
            <span>Method: {METHOD_LABELS[prediction.method_used] ?? prediction.method_used}</span>
            <span className="text-muted-foreground/30">•</span>
            <Link
              to={mathsAnchor ? `/maths#${mathsAnchor}` : '/maths'}
              className="text-primary hover:underline text-xs flex items-center gap-0.5"
            >
              View Maths <ChevronRight className="h-3 w-3" />
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="text-center space-y-6 py-8">
            <div className="space-y-4">
              <Trophy className="h-16 w-16 mx-auto text-primary" />
              <div>
                <p className="text-sm text-muted-foreground mb-2">Matchup</p>
                <div className="flex items-center justify-center gap-4 mb-3">
                  <div className="flex items-center gap-2">
                    {teamALogo && <img src={teamALogo} alt={teamAName} className="h-10 w-10 object-contain" />}
                    <span className="text-sm font-medium">{codeA}</span>
                  </div>
                  <span className="text-muted-foreground">vs</span>
                  <div className="flex items-center gap-2">
                    {teamBLogo && <img src={teamBLogo} alt={teamBName} className="h-10 w-10 object-contain" />}
                    <span className="text-sm font-medium">{codeB}</span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mb-2">Predicted Winner</p>
                <div className="flex items-center justify-center gap-3 mb-2">
                  {(prediction.predicted_winner === teamAName && teamALogo) && (
                    <img src={teamALogo} alt={teamAName} className="h-12 w-12 object-contain" />
                  )}
                  {(prediction.predicted_winner === teamBName && teamBLogo) && (
                    <img src={teamBLogo} alt={teamBName} className="h-12 w-12 object-contain" />
                  )}
                  <p className="text-4xl md:text-5xl font-medium">{winnerCode}</p>
                  {(prediction.predicted_winner === teamAName && teamALogo) && (
                    <img src={teamALogo} alt={teamAName} className="h-12 w-12 object-contain" />
                  )}
                  {(prediction.predicted_winner === teamBName && teamBLogo) && (
                    <img src={teamBLogo} alt={teamBName} className="h-12 w-12 object-contain" />
                  )}
                </div>
                <p className="text-2xl md:text-3xl text-muted-foreground mt-2">
                  {prediction.predicted_winner === teamAName
                    ? prediction.win_probability_a
                    : prediction.win_probability_b}%
                </p>
              </div>
            </div>

            <div className="pt-6 border-t border-border">
              <p className="text-xs text-muted-foreground mb-2">Losing Team</p>
              <p className="text-lg text-muted-foreground">
                {prediction.predicted_winner === teamAName
                  ? codeB
                  : codeA}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {prediction.predicted_winner === teamAName
                  ? prediction.win_probability_b
                  : prediction.win_probability_a}%
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-medium">Contributing Factors</h3>
            <div className="space-y-3">
              {prediction.contributing_factors.map((factor, index) => (
                <div key={index} className="p-4 border border-border rounded-lg space-y-1">
                  <p className="font-medium text-sm">{factor.factor}</p>
                  <p className="text-sm text-muted-foreground">{factor.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Confidence: {prediction.confidence_level}
            </p>
            <p className="text-xs text-muted-foreground">
              Computation time: {prediction.computation_time_ms}ms
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-4">
        <Button
          variant="outline"
          className="flex-1"
          onClick={onBack}
        >
          Back to Analysis
        </Button>
        <Button
          variant="default"
          className="flex-1"
          onClick={() => {
            track(EVENTS.PREDICTION_RESET);
            onNewPrediction();
          }}
        >
          New Prediction
        </Button>
      </div>
    </div>
  );
}
