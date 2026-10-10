import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import SeriesNotFound, { MATCHUP_NOT_FOUND_HEADLINE, MATCHUP_NOT_FOUND_LINE } from '@/components/common/SeriesNotFound';
import { EVENTS, track } from '@/lib/analytics';
import { GAME_NUMBERS, scoreKey } from '@/lib/custom-matchup';
import { matchupLabel } from '@/lib/matchup';
import { getTeamCode } from '@/lib/nba-utils';
import { deriveSeriesPhase, seriesSourceForPhase } from '@/lib/series-phase';
import { getTeamLogo, getTypedTeamCode, resolveTeamLogoUrl } from '@/lib/team-logos';
import { cn } from '@/lib/utils';
import type { PredictionForm, ScoreKey } from '@/types/prediction';
import type { Series } from '@/types/types';
import { Trophy } from 'lucide-react';
import { toast } from 'sonner';
import SeriesPicker, { type SelectionLevel } from './SeriesPicker';
import type { SelectedSeries, SeriesNotFoundKind } from './types';
import type { CatalogView } from './usePredictController';

interface SeriesCardProps {
  selectedSeries: SelectedSeries | null;
  setSelectedSeries: (series: SelectedSeries) => void;
  customInput: PredictionForm;
  setCustomInput: (form: PredictionForm) => void;
  setCustomScore: (key: ScoreKey, value: string) => void;
  customFieldErrors: Record<string, string>;
  seriesNotFound: SeriesNotFoundKind;
  catalog: CatalogView;
}

/** The Series card: its trigger, the picker dialog, the not-found notice, the custom-matchup grid and the score rows. */
export default function SeriesCard({
  selectedSeries,
  setSelectedSeries,
  customInput,
  setCustomInput,
  setCustomScore,
  customFieldErrors,
  seriesNotFound,
  catalog,
}: SeriesCardProps) {
  const { rowFor } = catalog;
  const [isSeriesDialogOpen, setIsSeriesDialogOpen] = useState(false);
  const [selectionLevel, setSelectionLevel] = useState<SelectionLevel>('decades');
  const [selectedDecade, setSelectedDecade] = useState<number | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  const getSeriesLabel = () => {
    if (!selectedSeries) return 'Not selected';
    if (selectedSeries.source === 'custom') {
      // U15 + U16: the typed name consults the rows the page already holds, then
      // the logo alias table, then the placeholder literal, then the name path.
      // Blank input still falls through to the caller's `|| 'TBD'` unchanged.
      const teamA = getTypedTeamCode(customInput.team_a, rowFor(customInput.team_a)) || 'TBD';
      const teamB = getTypedTeamCode(customInput.team_b, rowFor(customInput.team_b)) || 'TBD';
      return matchupLabel(teamA, teamB);
    }
    if (selectedSeries.data) {
      const teamAName = selectedSeries.data.team_a?.full_name || 'Team A';
      const teamBName = selectedSeries.data.team_b?.full_name || 'Team B';
      return matchupLabel(getTeamCode(teamAName, selectedSeries.data.team_a), getTeamCode(teamBName, selectedSeries.data.team_b));
    }
    return 'Not selected';
  };

  const selectSeries = (game: Series) => {
    // Phase is derived (Story 2.2 / AD-4); a non-reconciling row deep-linked
    // here falls back to `historical` — no third value reaches the state or
    // the frozen `series_source` registry.
    const source = seriesSourceForPhase(deriveSeriesPhase(game));
    setSelectedSeries({
      source,
      data: game
    });
    setIsSeriesDialogOpen(false);
    setSelectionLevel('decades');
    setSelectedDecade(null);
    setSelectedYear(null);
    toast.success('Series selected');
    track(EVENTS.SERIES_SELECTED, {
      series_id: game.id,
      series_year: game.year,
      series_round: game.round,
      series_source: source,
      team_a: game.team_a?.full_name,
      team_b: game.team_b?.full_name,
    });
  };

  const selectCustom = () => {
    setSelectedSeries({ source: 'custom' });
    setIsSeriesDialogOpen(false);
    toast.success('Custom series selected');
    track(EVENTS.CUSTOM_SERIES_SELECTED);
  };

  return (
    <Card className="h-full flex flex-col overflow-hidden">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Series
          </CardTitle>
        </div>
        <CardDescription>{"Choose a series"}</CardDescription>
      </CardHeader>

      <Dialog open={isSeriesDialogOpen} onOpenChange={(open) => {
        setIsSeriesDialogOpen(open);
        if (!open) {
          setSelectionLevel('decades');
          setSelectedDecade(null);
          setSelectedYear(null);
        }
      }}>
        <CardContent className="flex-1 flex flex-col">
          <div className="flex-1 space-y-4 py-4">
            {/* Decision 1 (Story 1.5): the series trigger is a real
                focusable `<button>` narrowed to the card's header
                block. The custom-matchup grid and the score rows
                below are its SIBLINGS inside this CardContent, never
                its children — inputs nested in a button are hidden
                from assistive tech in browse mode, which would pass a
                tab-ring measurement while failing NFR-A1 in substance. */}
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="group flex h-auto w-full cursor-pointer flex-col items-stretch gap-0 space-y-1 whitespace-normal rounded-lg px-4 py-2 text-left transition-colors hover:bg-muted/50"
              >
                {/* A `<button>` may only contain phrasing content, so
                    the trigger's innards are spans — `block` keeps the
                    box layout the `<div>`/`<p>` pair had. */}
                <span className="flex items-center justify-center gap-4 py-2">
                  {selectedSeries && selectedSeries.data && (() => {
                    const teamAName = selectedSeries.data.team_a?.full_name || 'Team A';
                    const teamBName = selectedSeries.data.team_b?.full_name || 'Team B';
                    const teamALogo = resolveTeamLogoUrl(selectedSeries.data.team_a?.logo_url) || getTeamLogo(teamAName);
                    const teamBLogo = resolveTeamLogoUrl(selectedSeries.data.team_b?.logo_url) || getTeamLogo(teamBName);

                    return (
                      <>
                        {teamALogo && (
                          <img src={teamALogo} alt="" className="h-10 w-10 object-contain" />
                        )}
                        <span className="block text-xl font-medium group-hover:text-primary transition-colors">{getSeriesLabel()}</span>
                        {teamBLogo && (
                          <img src={teamBLogo} alt="" className="h-10 w-10 object-contain" />
                        )}
                      </>
                    );
                  })()}
                  {!selectedSeries && (
                    <span className="block text-lg font-medium text-center group-hover:text-primary transition-colors">Select a Series</span>
                  )}
                  {selectedSeries && selectedSeries.source === 'custom' && (() => {
                    const teamAName = (customInput.team_a ?? '').trim() || 'Team A';
                    const teamBName = (customInput.team_b ?? '').trim() || 'Team B';
                    const teamALogo = getTeamLogo(teamAName) || getTeamLogo('Team A');
                    const teamBLogo = getTeamLogo(teamBName) || getTeamLogo('Team B');

                    return (
                      <>
                        {teamALogo && (
                          <img src={teamALogo} alt="" className="h-10 w-10 object-contain" />
                        )}
                        <span className="block text-xl font-medium group-hover:text-primary transition-colors">{getSeriesLabel()}</span>
                        {teamBLogo && (
                          <img src={teamBLogo} alt="" className="h-10 w-10 object-contain" />
                        )}
                      </>
                    );
                  })()}
                </span>
                {/* The accessible name is the concatenation of the
                    trigger's descendant text, and JSX emits no text node
                    between sibling elements — so without this space NVDA
                    reads "Select a SeriesClick to choose series". A
                    whitespace-only text node is not a flex item, so the
                    layout is unchanged. */}
                {' '}
                {!selectedSeries && (
                  <span className="block text-xs text-muted-foreground text-center">
                    Click to choose series
                  </span>
                )}
              </Button>
            </DialogTrigger>

            {/* Story 4.1: an unknown or malformed `?series=` renders
                the 404 treatment inside the series region — `<h2>`
                under the page's own `<h1>`, no title change, no focus
                theft — and the trigger above still opens the picker. */}
            {/* `role="status"`: the notice lands asynchronously, so it
                is announced the way the retry panel is (WCAG 4.1.3). */}
            {seriesNotFound && (
              <div role="status" className="px-4">
                {seriesNotFound === 'custom' ? (
                  <SeriesNotFound
                    headingLevel="h2"
                    headline={MATCHUP_NOT_FOUND_HEADLINE}
                    line={MATCHUP_NOT_FOUND_LINE}
                  />
                ) : (
                  <SeriesNotFound headingLevel="h2" />
                )}
              </div>
            )}

            {selectedSeries && selectedSeries.source === 'custom' && (
              <div className="grid grid-cols-2 gap-2 pt-2">
                <div className="space-y-1">
                  <Label htmlFor="team_a" className="text-[10px] uppercase text-muted-foreground">Team A</Label>
                  <div className="flex items-center gap-2">
                    {(getTeamLogo((customInput.team_a ?? '').trim() || 'Team A') || getTeamLogo('Team A')) && (
                      <img
                        src={getTeamLogo((customInput.team_a ?? '').trim() || 'Team A') || getTeamLogo('Team A')}
                        alt=""
                        className="h-8 w-8 object-contain shrink-0"
                      />
                    )}
                  <Input
                    id="team_a"
                    size={1}
                    className={cn('h-8 text-xs', customFieldErrors.team_a && 'border-destructive')}
                    aria-invalid={customFieldErrors.team_a ? true : undefined}
                    aria-describedby={customFieldErrors.team_a ? 'team_a-error' : undefined}
                    value={customInput.team_a}
                    onChange={(e) => setCustomInput({ ...customInput, team_a: e.target.value })}
                    placeholder="e.g. BOS"
                  />
                  </div>
                  {customFieldErrors.team_a && (
                    <p id="team_a-error" className="text-sm text-destructive-text">{customFieldErrors.team_a}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="team_b" className="text-[10px] uppercase text-muted-foreground">Team B</Label>
                  <div className="flex items-center gap-2">
                    {(getTeamLogo((customInput.team_b ?? '').trim() || 'Team B') || getTeamLogo('Team B')) && (
                      <img
                        src={getTeamLogo((customInput.team_b ?? '').trim() || 'Team B') || getTeamLogo('Team B')}
                        alt=""
                        className="h-8 w-8 object-contain shrink-0"
                      />
                    )}
                  <Input
                    id="team_b"
                    size={1}
                    className={cn('h-8 text-xs', customFieldErrors.team_b && 'border-destructive')}
                    aria-invalid={customFieldErrors.team_b ? true : undefined}
                    aria-describedby={customFieldErrors.team_b ? 'team_b-error' : undefined}
                    value={customInput.team_b}
                    onChange={(e) => setCustomInput({ ...customInput, team_b: e.target.value })}
                    placeholder="e.g. MIA"
                  />
                  </div>
                  {customFieldErrors.team_b && (
                    <p id="team_b-error" className="text-sm text-destructive-text">{customFieldErrors.team_b}</p>
                  )}
                </div>
              </div>
            )}

            {selectedSeries && (
              <div className="space-y-2 pt-2 border-t border-border/50">
                {GAME_NUMBERS.map((g) => {
                  const keyA = scoreKey(g, 'a');
                  const keyB = scoreKey(g, 'b');
                  const scoreRow = selectedSeries.source === 'custom'
                    ? undefined
                    : selectedSeries.data?.series_game_scores?.find((row) => row.game_number === g);
                  const scoreA = selectedSeries.source === 'custom'
                    ? customInput[keyA]
                    : scoreRow
                      ? (scoreRow.home_team_id === selectedSeries.data?.team_a_id ? scoreRow.home_score : scoreRow.away_score)
                      : undefined;

                  const scoreB = selectedSeries.source === 'custom'
                    ? customInput[keyB]
                    : scoreRow
                      ? (scoreRow.home_team_id === selectedSeries.data?.team_a_id ? scoreRow.away_score : scoreRow.home_score)
                      : undefined;

                  if (selectedSeries.source === 'custom') {
                    const errorA = customFieldErrors[keyA];
                    const errorB = customFieldErrors[keyB];
                    return (
                      <div key={g} className="flex items-start justify-between gap-4">
                        <span className="text-xs text-muted-foreground font-medium w-12 pt-2">Game {g}</span>
                        <div className="flex-1 grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Input
                              id={keyA}
                              type="number"
                              aria-label={`Game ${g} score, team A`}
                              className={cn('h-8 text-center text-xs px-1', errorA && 'border-destructive')}
                              aria-invalid={errorA ? true : undefined}
                              aria-describedby={errorA ? `${keyA}-error` : undefined}
                              value={scoreA ?? ''}
                              onChange={(e) => setCustomScore(keyA, e.target.value)}
                              placeholder="A"
                            />
                            {errorA && (
                              <p id={`${keyA}-error`} className="text-sm text-destructive-text">{errorA}</p>
                            )}
                          </div>
                          <div className="space-y-1">
                            <Input
                              id={keyB}
                              type="number"
                              aria-label={`Game ${g} score, team B`}
                              className={cn('h-8 text-center text-xs px-1', errorB && 'border-destructive')}
                              aria-invalid={errorB ? true : undefined}
                              aria-describedby={errorB ? `${keyB}-error` : undefined}
                              value={scoreB ?? ''}
                              onChange={(e) => setCustomScore(keyB, e.target.value)}
                              placeholder="B"
                            />
                            {errorB && (
                              <p id={`${keyB}-error`} className="text-sm text-destructive-text">{errorB}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={g} className="flex items-center justify-between text-sm py-0.5">
                      <span className="text-xs text-muted-foreground font-medium">Game {g}</span>
                      <span className="font-mono tabular-nums">
                        {scoreA ?? '-'} — {scoreB ?? '-'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
        <SeriesPicker
          games={catalog.games}
          pendingGames={catalog.pendingGames}
          seriesListFailed={catalog.seriesListFailed}
          seriesListLoaded={catalog.seriesListLoaded}
          onRetryList={catalog.retrySeriesList}
          selectionLevel={selectionLevel}
          setSelectionLevel={setSelectionLevel}
          selectedDecade={selectedDecade}
          setSelectedDecade={setSelectedDecade}
          selectedYear={selectedYear}
          setSelectedYear={setSelectedYear}
          isCustomSelected={selectedSeries?.source === 'custom'}
          onSelectSeries={selectSeries}
          onSelectCustom={selectCustom}
        />
      </Dialog>
    </Card>
  );
}
