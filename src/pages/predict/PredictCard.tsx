import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import ErrorRetryPanel from '@/components/common/ErrorRetryPanel';
import { EVENTS, track } from '@/lib/analytics';
import { SERVICE_MESSAGES, type ServiceFailure } from '@/lib/error-envelope';
import type { MethodSlug, PredictionForm, PredictionResult } from '@/types/prediction';
import { Loader2, TrendingUp, Trophy } from 'lucide-react';
import { resolveResultTeams } from './resultTeams';
import type { SelectedSeries } from './types';
import type { RowFor } from './useSeriesCatalog';

interface PredictCardProps {
  selectedSeries: SelectedSeries | null;
  selectedMethod: MethodSlug | null;
  customInput: PredictionForm;
  rowFor: RowFor;
  loading: boolean;
  result: PredictionResult | null;
  predictFailure: ServiceFailure | null;
  seriesLoadFailed: boolean;
  handlePredict: () => Promise<void>;
  retryPreload: () => void;
  onShowDetails: () => void;
}

/** The Predict card: Generate, the spinner, the retry panel and the compact result. */
export default function PredictCard({
  selectedSeries,
  selectedMethod,
  customInput,
  rowFor,
  loading,
  result,
  predictFailure,
  seriesLoadFailed,
  handlePredict,
  retryPreload,
  onShowDetails,
}: PredictCardProps) {
  return (
    <Card
      className={`h-full flex flex-col ${!selectedSeries || !selectedMethod ? 'opacity-50 cursor-not-allowed' : result ? 'cursor-default' : 'cursor-pointer hover:bg-muted/30 transition-colors'}`}
      onClick={() => {
        // F1 (owner, 2026-09-29): once a result is on screen the card body
        // stops answering clicks — the re-fire path is the Generate button,
        // which is the affordance that says what it does.
        if (selectedSeries && selectedMethod && !loading && !result) {
          handlePredict();
        }
      }}
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5" />
          Predict
        </CardTitle>
        <CardDescription>
          {/* Decision 2 (Story 1.5): a real `<button>` is the
              keyboard-operable Generate affordance — it joins the tab
              ring, activates with Enter and Space, and an incomplete
              selection makes it `disabled` rather than opacity-only. The
              card's own click below stays exactly as shipped. */}
          <Button
            type="button"
            variant="ghost"
            className="h-auto max-w-full justify-start gap-0 overflow-hidden rounded-md p-0 text-left text-sm font-normal whitespace-normal text-on-muted hover:bg-transparent hover:text-on-muted disabled:opacity-100"
            disabled={!selectedSeries || !selectedMethod || loading}
            onClick={(event) => {
              // One invoke per activation: this click must not also
              // reach the card's own handler.
              event.stopPropagation();
              if (!selectedSeries || !selectedMethod || loading) return;
              void handlePredict();
            }}
          >
            {loading
              ? 'Generating prediction…'
              : !selectedSeries || !selectedMethod
                ? 'Select series and method first'
                : 'Click to generate prediction'}
          </Button>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-center items-center space-y-6">
        {loading ? (
          <div className="text-center space-y-4">
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
            <p className="text-sm text-muted-foreground">Analyzing series data...</p>
          </div>
        ) : seriesLoadFailed || predictFailure ? (
          // Story 1.3: a service failure replaces the result region in
          // place — Retry re-fires the same attempt (series, method and
          // scores are untouched), a second failure re-renders the panel.
          <ErrorRetryPanel
            heading={seriesLoadFailed ? "Couldn't load this series." : "Couldn't generate the prediction."}
            message={
              seriesLoadFailed
                ? 'Retry fetches it again.'
                : predictFailure?.message ?? SERVICE_MESSAGES.transport
            }
            onRetry={() => {
              if (seriesLoadFailed) {
                retryPreload();
              } else {
                void handlePredict();
              }
            }}
          />
        ) : (() => {
          if (!result) {
            return (
              <div className="text-center space-y-2">
                <TrendingUp className="h-12 w-12 mx-auto text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  {!selectedSeries || !selectedMethod
                    ? 'Complete the steps above'
                    : 'Click anywhere to predict'}
                </p>
              </div>
            );
          }

          const prediction = result;
          const { teamAName, teamBName, codeA, codeB, winnerCode, teamALogo, teamBLogo } =
            resolveResultTeams(prediction, selectedSeries, customInput, rowFor);
          return (
            <div className="w-full space-y-6">
              <div className="text-center space-y-4">
                <Trophy className="h-12 w-12 mx-auto text-primary" />
                <div>
                  {/* <p className="text-xs text-muted-foreground mb-1">Matchup</p>
                  <div className="flex items-center justify-center gap-4 mb-3">
                    <div className="flex items-center gap-2">
                      {teamALogo && <img src={teamALogo} alt={teamAName} className="h-8 w-8 object-contain" />}
                      <span className="text-sm font-medium">{getTeamAbbreviation(teamAName)}</span>
                    </div>
                    <span className="text-muted-foreground">vs</span>
                    <div className="flex items-center gap-2">
                      {teamBLogo && <img src={teamBLogo} alt={teamBName} className="h-8 w-8 object-contain" />}
                      <span className="text-sm font-medium">{getTeamAbbreviation(teamBName)}</span>
                    </div>
                  </div> */}
                  <p className="text-xs text-muted-foreground mb-1">Predicted Winner</p>
                  <div className="flex items-center justify-center gap-3 mb-2">
                    {(prediction.predicted_winner === teamAName && teamALogo) && (
                      <img src={teamALogo} alt={teamAName} className="h-8 w-8 object-contain" />
                    )}
                    {(prediction.predicted_winner === teamBName && teamBLogo) && (
                      <img src={teamBLogo} alt={teamBName} className="h-8 w-8 object-contain" />
                    )}
                    <p className="text-3xl font-medium">{winnerCode}</p>
                    {(prediction.predicted_winner === teamAName && teamALogo) && (
                      <img src={teamALogo} alt={teamAName} className="h-8 w-8 object-contain" />
                    )}
                    {(prediction.predicted_winner === teamBName && teamBLogo) && (
                      <img src={teamBLogo} alt={teamBName} className="h-8 w-8 object-contain" />
                    )}
                  </div>
                  <p className="text-xl text-primary mt-2">
                    {prediction.predicted_winner === teamAName
                      ? prediction.win_probability_a
                      : prediction.win_probability_b}%
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-border/50 text-center">
                <p className="text-xs text-muted-foreground mb-1">Losing Team</p>
                <p className="text-sm text-muted-foreground">
                  {prediction.predicted_winner === teamAName
                    ? codeB
                    : codeA}
                  {' · '}
                  {prediction.predicted_winner === teamAName
                    ? prediction.win_probability_b
                    : prediction.win_probability_a}%
                </p>
              </div>

              <Button
                variant="outline"
                className="w-full mt-4"
                onClick={(e) => {
                  e.stopPropagation();
                  onShowDetails();
                  track(EVENTS.DETAILED_ANALYSIS_VIEWED, {
                    method: selectedMethod,
                    series_id: selectedSeries?.data?.id,
                  });
                }}
              >
                View Detailed Analysis
              </Button>
            </div>
          );
        })()}
      </CardContent>
    </Card>
  );
}
