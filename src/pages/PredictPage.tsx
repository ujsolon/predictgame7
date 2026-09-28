import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/db/supabase';
import { getTeamAbbreviation } from '@/lib/nba-utils';
import { getTeamLogo, resolveTeamLogoUrl } from '@/lib/team-logos';
import { METHOD_LABELS, METHOD_MATHS_ANCHORS } from '@/lib/method-display';
import ErrorRetryPanel from '@/components/common/ErrorRetryPanel';
import { collectRangeHints, collectTeamNameHints, validateCustomMatchup } from '@/lib/custom-matchup';
import { classifyInvokeResult, parseInvokeBody, SERVICE_MESSAGES, type ServiceFailure } from '@/lib/error-envelope';
import { cn } from '@/lib/utils';
import type { Series } from '@/types/types';
import type { MethodSlug, PredictionInput, PredictionResult } from '@/types/prediction';
import { Check, Settings, TrendingUp, Trophy, Loader2, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { usePostHog } from '@posthog/react';

type SeriesSource = 'current' | 'historical' | 'custom';

interface SelectedSeries {
  source: SeriesSource;
  data?: Series;
  customData?: PredictionInput;
}

const SERIES_SELECT = `
  id,
  year,
  round,
  team_a_id,
  team_b_id,
  winner_team_id,
  status,
  created_at,
  updated_at,
  team_a:team_a_id(id, full_name, abbreviation, city, nickname, logo_url, created_at, updated_at),
  team_b:team_b_id(id, full_name, abbreviation, city, nickname, logo_url, created_at, updated_at),
  winner_team:winner_team_id(id, full_name, abbreviation, city, nickname, logo_url, created_at, updated_at),
  series_game_scores(*)
`;

// supabase-js has no generated Database types in this app, so `series` rows come
// back with their to-one embeds typed as arrays. These two casts are the only
// place a row is read as `Series`; nothing is validated.
const asSeries = (rows: unknown): Series[] => (Array.isArray(rows) ? rows : []) as Series[];
const asSeriesRow = (row: unknown): Series => row as Series;

export default function PredictPage() {
  const posthog = usePostHog();
  const [searchParams] = useSearchParams();
  const [selectedSeries, setSelectedSeries] = useState<SelectedSeries | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<MethodSlug | null>(null);
  const [isSeriesDialogOpen, setIsSeriesDialogOpen] = useState(false);
  const [isMethodDialogOpen, setIsMethodDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PredictionResult | null>(null);
  // Failure state for the result region (service class from the classifier).
  const [predictFailure, setPredictFailure] = useState<ServiceFailure | null>(null);
  // Mount-time series list and `?series=` preload query failures (retryable).
  const [seriesListFailed, setSeriesListFailed] = useState(false);
  const [seriesLoadFailed, setSeriesLoadFailed] = useState(false);
  // Bumped by every `?series=` load and every new fan input; an in-flight
  // preload whose sequence no longer matches has been superseded, so its
  // late response (success or failure) must not touch on-screen state.
  const seriesLoadSeq = useRef(0);
  // Inline submit-time field errors for the custom matchup form, keyed by the
  // input ids below (Decision 1: controlled state + pure validator, no form lib).
  const [customFieldErrors, setCustomFieldErrors] = useState<Record<string, string>>({});
  
  const [games, setGames] = useState<Series[]>([]);
  const [selectionLevel, setSelectionLevel] = useState<'decades' | 'years' | 'series'>('decades');
  const [selectedDecade, setSelectedDecade] = useState<number | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [customInput, setCustomInput] = useState<PredictionInput>({
    team_a: '',
    team_b: '',
    game_1_score_a: undefined as any,
    game_1_score_b: undefined as any,
    game_2_score_a: undefined as any,
    game_2_score_b: undefined as any,
    game_3_score_a: undefined as any,
    game_3_score_b: undefined as any,
    game_4_score_a: undefined as any,
    game_4_score_b: undefined as any,
    game_5_score_a: undefined as any,
    game_5_score_b: undefined as any,
    game_6_score_a: undefined as any,
    game_6_score_b: undefined as any,
  });

  // Declared before the `?series=` effect on purpose: effects run in
  // declaration order, so on mount (and on every StrictMode remount pass) the
  // sequence bump below happens before the preload captures its own sequence.
  useEffect(() => {
    setResult(null);
    setShowDetails(false);
    setPredictFailure(null);
    // A new selection supersedes the previous preload failure; leaving it set
    // would keep "Couldn't load this series." masking a result fetched by hand
    // afterwards.
    setSeriesLoadFailed(false);
    // ...and supersedes any preload still in flight: bumping the sequence here
    // is what stops a late-arriving response from re-setting the flag over a
    // result the fan has already fetched, or overwriting the manual selection.
    seriesLoadSeq.current++;
  }, [selectedSeries, selectedMethod, customInput]);

  useEffect(() => {
    fetchAllGames();
    
    // Load series from query parameter if provided
    const seriesId = searchParams.get('series');
    if (seriesId) {
      loadSeriesById(seriesId);
    }
  }, [searchParams]);


  // Field errors are the last submit's verdict on the last matchup, so a new
  // series or method retires them. Typing does not — EXPERIENCE.md · Inline
  // field error clears on the next valid submit, never per keystroke.
  useEffect(() => {
    setCustomFieldErrors({});
  }, [selectedSeries, selectedMethod]);

  const fetchAllGames = async () => {
    try {
      const { data, error } = await supabase
        .from('series')
        .select(SERIES_SELECT)
        .order('year', { ascending: false });

      if (error) throw error;
      setGames(asSeries(data));
      setSeriesListFailed(false);
    } catch (err) {
      // Story 1.3: the picker explains itself instead of failing silently to
      // an empty list. Only failure state changes here — selections survive.
      console.error('Error fetching series:', err);
      setSeriesListFailed(true);
      posthog?.captureException(err);
    }
  };

  const loadSeriesById = async (seriesId: string) => {
    const seq = ++seriesLoadSeq.current;
    try {
      const { data, error } = await supabase
        .from('series')
        .select(SERIES_SELECT)
        .eq('id', seriesId)
        .maybeSingle();

      if (error) throw error;
      // Superseded while in flight (newer preload, or the fan picked by hand):
      // this response no longer describes what should be on screen.
      if (seq !== seriesLoadSeq.current) return;

      if (data) {
        const series = asSeriesRow(data);
        setSeriesLoadFailed(false);
        setSelectedSeries({ source: series.status === 'active' ? 'current' : 'historical', data: series });
      } else {
        // A genuinely absent row is not retryable — stays a toast (the 404
        // treatment belongs to Story 4.1).
        setSeriesLoadFailed(false);
        toast.error('Series not found');
      }
    } catch (err) {
      // Query failure (broken link, unreadable id, network miss on mount):
      // the retryable panel treatment, not a dead-end toast.
      console.error('Error loading series:', err);
      posthog?.captureException(err);
      // A superseded preload still reports to analytics but must not mask
      // whatever the fan has on screen by the time it lands.
      if (seq === seriesLoadSeq.current) setSeriesLoadFailed(true);
    }
  };

  const handlePredict = async () => {
    // Precondition on the whole flow, not a field error — stays a toast;
    // both pickers already render "Not selected".
    if (!selectedSeries || !selectedMethod) {
      toast.error('Please select both a series and a method');
      return;
    }

    // Retry re-fires what the fan just submitted: the attempt is read from
    // live state, and any change to it clears the panel before Retry exists.
    const attempt = { method: selectedMethod, series: selectedSeries };

    let inputData: PredictionInput;

    if (attempt.series.source === 'custom') {
      // Invalid input is reported inline before submit — the request never
      // leaves the browser (Story 1.3 I/O matrix).
      const fields = validateCustomMatchup(customInput);
      setCustomFieldErrors(fields);
      const firstInvalid = Object.keys(fields)[0];
      if (firstInvalid) {
        // No summary toast on this path (EXPERIENCE.md · Inline field error),
        // so focus carries the announcement: the field's error is reachable
        // through its own `aria-describedby` (WCAG 4.1.3 / 3.3.1).
        document.getElementById(firstInvalid)?.focus();
        return;
      }

      // A score outside 50-200 stays a non-blocking hint, not a field error.
      for (const hint of collectRangeHints(customInput)) toast.warning(hint);
      // Story 1.4 / Decision 4: an unrecognized team name gets the same
      // non-blocking treatment — the request proceeds and the generic
      // Team A/Team B placeholder logo stays shown.
      for (const hint of collectTeamNameHints(customInput)) toast.warning(hint);

      // Decision 4: both names are required above, so the 'Team A'/'Team B'
      // placeholder fallback no longer silently supplies a request.
      inputData = {
        ...customInput,
        team_a: (customInput.team_a ?? '').trim(),
        team_b: (customInput.team_b ?? '').trim(),
        home_team: undefined,
        method: attempt.method,
      } as PredictionInput;
    } else if (attempt.series.data) {
      const series = attempt.series.data;
      const scores = series.series_game_scores ?? [];
      const sortedScores = [...scores].sort((a, b) => a.game_number - b.game_number);

      // Series-path checks stay toasts: they guard the whole flow with
      // server-provided data, they are not per-field user input errors.
      const validateScores = (input: any) => {
        for (let i = 1; i <= 6; i++) {
          const scoreA = input[`game_${i}_score_a`];
          const scoreB = input[`game_${i}_score_b`];

          if (scoreA === undefined || scoreA === null || scoreA === '' || scoreA === 0 ||
              scoreB === undefined || scoreB === null || scoreB === '' || scoreB === 0) {
            toast.error(`Game ${i} is missing scores. Please enter scores for all 6 games.`);
            return false;
          }

          const sA = Number(scoreA);
          const sB = Number(scoreB);

          if (!Number.isInteger(sA) || !Number.isInteger(sB)) {
            toast.error(`Game ${i} scores must be whole numbers`);
            return false;
          }

          if (sA < 0 || sB < 0) {
            toast.error(`Game ${i} scores cannot be negative`);
            return false;
          }

          if (sA < 50 || sA > 200 || sB < 50 || sB > 200) {
            toast.warning(`Note: Game ${i} scores (${sA}-${sB}) are outside the typical 50-200 range`);
          }
        }
        return true;
      };

      if (sortedScores.length < 6) {
        toast.error('Selected series does not include enough game scores for prediction.');
        return;
      }

      const seriesInput: any = {
        series_id: series.id,
        team_a: series.team_a?.full_name || 'Team A',
        team_b: series.team_b?.full_name || 'Team B',
        method: attempt.method,
      };

      for (let i = 1; i <= 6; i++) {
        const scoreRow = sortedScores.find((row) => row.game_number === i);
        if (!scoreRow) {
          toast.error(`Game ${i} is missing for the selected series.`);
          return;
        }

        const isTeamAHome = scoreRow.home_team_id === series.team_a_id;
        seriesInput[`game_${i}_score_a`] = isTeamAHome ? scoreRow.home_score : scoreRow.away_score;
        seriesInput[`game_${i}_score_b`] = isTeamAHome ? scoreRow.away_score : scoreRow.home_score;
      }

      if (!validateScores(seriesInput)) {
        return;
      }

      const game7score = sortedScores.find((row) => row.game_number === 7);
      seriesInput.home_team = game7score
        ? game7score.home_team_id === series.team_a_id
          ? series.team_a?.full_name
          : series.team_b?.full_name
        : undefined;

      inputData = seriesInput as PredictionInput;
    } else {
      toast.error('Invalid series selection');
      return;
    }

    await runPrediction(inputData, attempt);
  };

  const runPrediction = async (
    inputData: PredictionInput,
    attempt: { method: MethodSlug; series: SelectedSeries }
  ) => {
    setLoading(true);
    setPredictFailure(null);
    setResult(null);

    let prediction: PredictionResult;
    try {
      const { data, error } = await supabase.functions.invoke<PredictionResult>('predict-game-7', {
        body: inputData,
      });

      // One classifier for everything the transport or function can return:
      // no raw JSON reaches the UI, and a non-conforming 200 (the
      // `win_probability_a: null` path) never renders `undefined%`.
      const failure = await classifyInvokeResult(error, data);
      if (failure) {
        console.error('Prediction failure:', failure);
        // Failure state only — series, method and scores survive the retry.
        setPredictFailure(failure);
        posthog?.captureException(
          error instanceof Error ? error : new Error(failure.message)
        );
        return;
      }

      // The classifier already proved this body conforms; `parseInvokeBody`
      // hands back the same decoded copy a `text/plain` `200` arrives as.
      prediction = parseInvokeBody(data) as PredictionResult;
      setResult(prediction);
    } catch (err) {
      // Last-resort guard for anything thrown outside the classified invoke
      // path; the panel replaces a bare toast, inputs untouched.
      console.error('Prediction error:', err);
      setPredictFailure({ kind: 'service', reason: 'transport', message: SERVICE_MESSAGES.transport });
      posthog?.captureException(err);
      return;
    } finally {
      setLoading(false);
    }

    // Success side-effects live outside the guarded region: a throwing toast
    // or analytics call must not convert the prediction already on screen
    // into a "service unreachable" panel.
    try {
      toast.success('Prediction generated successfully');
      posthog?.capture('prediction_generated', {
        method: attempt.method,
        series_source: attempt.series.source,
        series_id: attempt.series.data?.id,
        series_year: attempt.series.data?.year,
        predicted_winner: prediction.predicted_winner,
        win_probability_a: prediction.win_probability_a,
        win_probability_b: prediction.win_probability_b,
        confidence_level: prediction.confidence_level,
      });
    } catch (err) {
      console.error('Prediction success side-effect failed:', err);
    }
  };

  const getSeriesLabel = () => {
    if (!selectedSeries) return 'Not selected';
    if (selectedSeries.source === 'custom') {
      const teamA = getTeamAbbreviation(customInput.team_a) || 'TBD';
      const teamB = getTeamAbbreviation(customInput.team_b) || 'TBD';
      return `${teamA} vs ${teamB}`;
    }
    if (selectedSeries.data) {
      const teamAName = selectedSeries.data.team_a?.full_name || 'Team A';
      const teamBName = selectedSeries.data.team_b?.full_name || 'Team B';
      return `${getTeamAbbreviation(teamAName)} vs ${getTeamAbbreviation(teamBName)}`;
    }
    return 'Not selected';
  };

  const getMethodLabel = () => {
    if (!selectedMethod) return 'Not selected';
    return METHOD_LABELS[selectedMethod];
  };

  const selectSeries = (game: Series) => {
    setSelectedSeries({
      source: game.status === 'active' ? 'current' : 'historical',
      data: game
    });
    setIsSeriesDialogOpen(false);
    setSelectionLevel('decades');
    setSelectedDecade(null);
    setSelectedYear(null);
    toast.success('Series selected');
    posthog?.capture('series_selected', {
      series_id: game.id,
      series_year: game.year,
      series_round: game.round,
      series_source: game.status === 'active' ? 'current' : 'historical',
      team_a: game.team_a?.full_name,
      team_b: game.team_b?.full_name,
    });
  };

  const renderSeriesOption = (game: Series) => {
    const teamAName = game.team_a?.full_name || 'Team A';
    const teamBName = game.team_b?.full_name || 'Team B';
    const teamALogo = resolveTeamLogoUrl(game.team_a?.logo_url) || getTeamLogo(teamAName);
    const teamBLogo = resolveTeamLogoUrl(game.team_b?.logo_url) || getTeamLogo(teamBName);

    return (
      <Button
        key={game.id}
        variant="outline"
        className="h-24 sm:h-20 flex flex-col gap-2 p-3 transition-all duration-200 hover:border-primary/50"
        onClick={() => selectSeries(game)}
      >
        <div className="flex items-center gap-2 w-full justify-center">
          <div className="flex -space-x-1.5 shrink-0">
            {teamALogo && (
              <img src={teamALogo} alt="" className="h-5 w-5 rounded-full border border-background bg-white p-0.5" />
            )}
            {teamBLogo && (
              <img src={teamBLogo} alt="" className="h-5 w-5 rounded-full border border-background bg-white p-0.5" />
            )}
          </div>
          <span className="text-xs font-bold truncate">
            {getTeamAbbreviation(teamAName)} vs {getTeamAbbreviation(teamBName)}
          </span>
        </div>
        <span className="text-[9px] uppercase tracking-tighter opacity-60 font-medium truncate w-full text-center">
          {game.round}
        </span>
      </Button>
    );
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="space-y-3">
        <h1 className="text-3xl md:text-4xl font-medium text-left">Win Probability</h1>
        <p className="text-muted-foreground">
          Select a series and a statistical model to calculate <span className="whitespace-nowrap">Game 7</span> win probability
        </p>
      </div>

      {!showDetails ? (
        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
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
                        {[1, 2, 3, 4, 5, 6].map((g) => {
                          const scoreRow = selectedSeries.source === 'custom'
                            ? undefined
                            : selectedSeries.data?.series_game_scores?.find((row) => row.game_number === g);
                          const scoreA = selectedSeries.source === 'custom' 
                            ? (customInput[`game_${g}_score_a` as keyof PredictionInput] as number | undefined)
                            : scoreRow
                              ? (scoreRow.home_team_id === selectedSeries.data?.team_a_id ? scoreRow.home_score : scoreRow.away_score)
                              : undefined;
                          
                          const scoreB = selectedSeries.source === 'custom'
                            ? (customInput[`game_${g}_score_b` as keyof PredictionInput] as number | undefined)
                            : scoreRow
                              ? (scoreRow.home_team_id === selectedSeries.data?.team_a_id ? scoreRow.away_score : scoreRow.home_score)
                              : undefined;

                          if (selectedSeries.source === 'custom') {
                            const keyA = `game_${g}_score_a`;
                            const keyB = `game_${g}_score_b`;
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
                                      value={(customInput[`game_${g}_score_a` as keyof PredictionInput] as number | undefined) ?? ''}
                                      onChange={(e) => setCustomInput({ 
                                        ...customInput, 
                                        [`game_${g}_score_a`]: e.target.value === '' ? undefined : Number(e.target.value) 
                                      })}
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
                                      value={(customInput[`game_${g}_score_b` as keyof PredictionInput] as number | undefined) ?? ''}
                                      onChange={(e) => setCustomInput({ 
                                        ...customInput, 
                                        [`game_${g}_score_b`]: e.target.value === '' ? undefined : Number(e.target.value) 
                                      })}
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
                <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-2xl max-h-[90dvh] flex flex-col p-0 overflow-hidden">
                  <DialogHeader className="p-6 pb-2">
                    <DialogTitle>Select Series</DialogTitle>
                    <DialogDescription>
                      Choose a season to view its Game 7s, or create a custom series
                    </DialogDescription>
                  </DialogHeader>
                  
                  <div className="flex-1 overflow-y-auto p-6 pt-2 space-y-6">
                    {seriesListFailed ? (
                      // Story 1.3: the picker explains itself instead of
                      // showing an empty list; Retry re-runs the mount fetch.
                      <ErrorRetryPanel
                        heading="Couldn't load the series list."
                        message="Retry fetches the archive again. Your current selection stays put."
                        onRetry={() => {
                          setSeriesListFailed(false);
                          void fetchAllGames();
                        }}
                      />
                    ) : (
                    <div className="space-y-4">
                      {selectionLevel === 'decades' && games.some((game) => game.status === 'active') && (
                        <div className="space-y-4">
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Current Game 7s</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {games
                              .filter((game) => game.status === 'active')
                              .sort((a, b) => b.year - a.year)
                              .map((game) => renderSeriesOption(game))}
                          </div>
                        </div>
                      )}

                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {selectionLevel === 'decades' ? 'Select Decade' : 
                         selectionLevel === 'years' ? `Select Year from ${selectedDecade}s` : 
                         `Select Series from ${selectedYear}`}
                      </p>
                      
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {selectionLevel === 'decades' && (
                          [2020, 2010, 2000, 1990, 1980, 1970, 1960, 1950, 1940].map(decade => (
                            <Button
                              key={decade}
                              variant="outline"
                              className="h-20 flex flex-col gap-1 transition-all duration-200 hover:border-primary/50"
                              onClick={() => {
                                setSelectedDecade(decade);
                                setSelectionLevel('years');
                              }}
                            >
                              <span className="text-xl font-bold">{decade}s</span>
                              <span className="text-[10px] uppercase opacity-60">View Years</span>
                            </Button>
                          ))
                        )}

                        {selectionLevel === 'years' && (
                          <>
                            <Button
                              variant="ghost"
                              className="h-20 flex flex-col gap-1 border border-dashed border-border/60 hover:border-primary/50 hover:bg-primary/5"
                              onClick={() => {
                                setSelectionLevel('decades');
                                setSelectedDecade(null);
                              }}
                            >
                              <ChevronRight className="h-5 w-5 rotate-180" />
                              <span className="text-[10px] uppercase font-bold">Go Back</span>
                            </Button>
                            {(() => {
                              const allYears = Array.from(new Set([...games.map(g => g.year)]))
                                .filter(y => y >= selectedDecade! && y < selectedDecade! + 10)
                                .sort((a, b) => b - a);

                              return allYears.map(year => (
                                <Button
                                  key={year}
                                  variant="outline"
                                  className="h-20 flex flex-col gap-1 transition-all duration-200 hover:border-primary/50"
                                  onClick={() => {
                                    setSelectedYear(year);
                                    setSelectionLevel('series');
                                  }}
                                >
                                  <span className="text-xl font-bold">{year}</span>
                                  <span className="text-[10px] uppercase opacity-60">
                                    {games.some(g => g.year === year && g.status === 'active') ? 'Current' : 'View Series'}
                                  </span>
                                </Button>
                              ));
                            })()}
                          </>
                        )}

                        {selectionLevel === 'series' && (
                          <>
                            <Button
                              variant="ghost"
                              className="h-20 flex flex-col gap-1 border border-dashed border-border/60 hover:border-primary/50 hover:bg-primary/5"
                              onClick={() => {
                                setSelectionLevel('years');
                                setSelectedYear(null);
                              }}
                            >
                              <ChevronRight className="h-5 w-5 rotate-180" />
                              <span className="text-[10px] uppercase font-bold">Go Back</span>
                            </Button>
                            {(() => {
                              const yearGames = games.filter(g => g.year === selectedYear);

                              return yearGames.map((game) => renderSeriesOption(game));
                            })()}
                          </>
                        )}
                      </div>

                      {selectionLevel === 'decades' && (
                        <div className="space-y-4 pt-6 border-t border-border/40">
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Or Create Custom</p>
                          <div className="grid gap-4">
                            <Button
                              variant="outline"
                              className={`w-full h-14 border-dashed justify-start px-6 gap-4 hover:border-primary/50 hover:bg-primary/5 transition-all duration-300 ${selectedSeries?.source === 'custom' ? 'border-primary bg-primary/5 ring-1 ring-primary' : ''}`}
                              onClick={() => {
                                setSelectedSeries({ source: 'custom' });
                                setIsSeriesDialogOpen(false);
                                toast.success('Custom series selected');
                                posthog?.capture('custom_series_selected');
                              }}
                            >
                              <Settings className="h-5 w-5 text-muted-foreground" />
                              <div className="flex flex-col items-start text-left">
                                <span className="font-semibold text-sm">Custom Matchup</span>
                                <span className="text-[10px] text-muted-foreground uppercase">Manual score entry</span>
                              </div>
                            </Button>
                            <p className="text-center text-[10px] text-muted-foreground leading-relaxed px-4">
                              Input your own teams and scores for custom probability analysis. Supporting simulated matchups.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </Card>

            <Card className="h-full flex flex-col overflow-hidden">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Method
                </CardTitle>
                <CardDescription>Choose a prediction method</CardDescription>
              </CardHeader>
              <Dialog open={isMethodDialogOpen} onOpenChange={setIsMethodDialogOpen}>
                <DialogTrigger asChild>
                  {/* Decision 1 (Story 1.5): nothing interactive is nested in the
                      method card's body — text and logos only — so it converts to
                      a real focusable `<button>` directly, with the same copy. */}
                  <Button
                    type="button"
                    variant="ghost"
                    className="group flex h-auto w-full flex-1 cursor-pointer flex-col items-stretch gap-0 space-y-4 whitespace-normal rounded-lg p-6 pt-0 text-left transition-colors hover:bg-muted/50"
                  >
                    <span className="block flex-1 space-y-4">
                      <span className="block space-y-2">
                        <span className="block text-lg font-medium text-center group-hover:text-primary transition-colors">{getMethodLabel()}</span>
                        {/* Same accname gap as the Series trigger: without this
                            space NVDA reads "Not selectedClick to choose method"
                            and "Logistic RegressionA statistical model…". */}
                        {' '}
                        {!selectedMethod ? (
                          <span className="block text-xs text-muted-foreground text-center">
                            Click to choose method
                          </span>
                        ) : (
                          <span className="block space-y-4 pt-2">
                            <span className="block text-xs text-muted-foreground leading-relaxed">
                              {(() => {
                                switch (selectedMethod) {
                                  case 'logistic_regression':
                                    return "A statistical model that predicts the probability of a binary outcome based on individual game point differentials from the series.";
                                  case 'bayes':
                                    return "A Bayesian inference model that sequentially updates win probability using point differentials from each game as evidence.";
                                  case 'elo':
                                    return "An Elo-based rating system where team ratings update after each game based on the result and margin of victory.";
                                  case 'exponential_smoothing':
                                    return "A momentum-based model that applies a decay factor, giving exponentially more weight to recent game results.";
                                  default:
                                    return "";
                                }
                              })()}
                            </span>
                          </span>
                        )}
                      </span>
                    </span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Select Method</DialogTitle>
                    <DialogDescription>
                      Choose a statistical approach for the <span className="whitespace-nowrap">Game 7</span> prediction. {' '}
                      <Link to="/maths" className="text-primary hover:underline font-medium inline-flex items-center gap-1">
                        Learn about our methodology <ChevronRight className="h-3 w-3" />
                      </Link>
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <Button
                      variant={selectedMethod === 'logistic_regression' ? 'default' : 'outline'}
                      className="w-full justify-between h-14 px-4"
                      onClick={() => {
                        setSelectedMethod('logistic_regression');
                        setIsMethodDialogOpen(false);
                        toast.success('Logistic Regression selected');
                        posthog?.capture('prediction_method_selected', { method: 'logistic_regression' });
                      }}
                    >
                      <div className="flex items-center gap-2">
                        {selectedMethod === 'logistic_regression' && <Check className="h-4 w-4" />}
                        <span>Logistic Regression</span>
                      </div>
                      <Link 
                        to="/maths#logistic-regression" 
                        className="text-[10px] text-muted-foreground hover:text-primary transition-colors uppercase tracking-widest font-semibold ml-4"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Details
                      </Link>
                    </Button>

                    <Button
                      variant={selectedMethod === 'bayes' ? 'default' : 'outline'}
                      className="w-full justify-between h-14 px-4"
                      onClick={() => {
                        setSelectedMethod('bayes');
                        setIsMethodDialogOpen(false);
                        toast.success('Bayes Method selected');
                        posthog?.capture('prediction_method_selected', { method: 'bayes' });
                      }}
                    >
                      <div className="flex items-center gap-2">
                        {selectedMethod === 'bayes' && <Check className="h-4 w-4" />}
                        <span>Bayes Method</span>
                      </div>
                      <Link 
                        to="/maths#bayesian-inference" 
                        className="text-[10px] text-muted-foreground hover:text-primary transition-colors uppercase tracking-widest font-semibold ml-4"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Details
                      </Link>
                    </Button>

                    <Button
                      variant={selectedMethod === 'elo' ? 'default' : 'outline'}
                      className="w-full justify-between h-14 px-4"
                      onClick={() => {
                        setSelectedMethod('elo');
                        setIsMethodDialogOpen(false);
                        toast.success('Elo Rating selected');
                        posthog?.capture('prediction_method_selected', { method: 'elo' });
                      }}
                    >
                      <div className="flex items-center gap-2">
                        {selectedMethod === 'elo' && <Check className="h-4 w-4" />}
                        <span>Elo Rating</span>
                      </div>
                      <Link 
                        to="/maths#elo-rating" 
                        className="text-[10px] text-muted-foreground hover:text-primary transition-colors uppercase tracking-widest font-semibold ml-4"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Details
                      </Link>
                    </Button>

                    <Button
                      variant={selectedMethod === 'exponential_smoothing' ? 'default' : 'outline'}
                      className="w-full justify-between h-14 px-4"
                      onClick={() => {
                        setSelectedMethod('exponential_smoothing');
                        setIsMethodDialogOpen(false);
                        toast.success('Exponential Smoothing selected');
                        posthog?.capture('prediction_method_selected', { method: 'exponential_smoothing' });
                      }}
                    >
                      <div className="flex items-center gap-2">
                        {selectedMethod === 'exponential_smoothing' && <Check className="h-4 w-4" />}
                        <span>Exponential Smoothing</span>
                      </div>
                      <Link 
                        to="/maths#exponential-smoothing" 
                        className="text-[10px] text-muted-foreground hover:text-primary transition-colors uppercase tracking-widest font-semibold ml-4"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Details
                      </Link>
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </Card>
        </div>

        <Card 
          className={`h-full flex flex-col ${!selectedSeries || !selectedMethod ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-muted/30 transition-colors'}`}
            onClick={() => {
              if (selectedSeries && selectedMethod && !loading) {
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
                      // Only clear the flag when there is something to
                      // re-fetch; otherwise Retry would dismiss the panel
                      // and fetch nothing.
                      const seriesId = searchParams.get('series');
                      if (!seriesId) return;
                      setSeriesLoadFailed(false);
                      void loadSeriesById(seriesId);
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
                const fallbackTeamA = selectedSeries?.source === 'custom' ? customInput.team_a : selectedSeries?.data?.team_a?.full_name;
                const fallbackTeamB = selectedSeries?.source === 'custom' ? customInput.team_b : selectedSeries?.data?.team_b?.full_name;
                const teamAName = prediction.team_a || fallbackTeamA || 'Team A';
                const teamBName = prediction.team_b || fallbackTeamB || 'Team B';
                const teamALogo = resolveTeamLogoUrl(prediction.team_a_logo) || resolveTeamLogoUrl(selectedSeries?.data?.team_a?.logo_url) || getTeamLogo(teamAName);
                const teamBLogo = resolveTeamLogoUrl(prediction.team_b_logo) || resolveTeamLogoUrl(selectedSeries?.data?.team_b?.logo_url) || getTeamLogo(teamBName);
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
                          <p className="text-3xl font-medium">{getTeamAbbreviation(prediction.predicted_winner)}</p>
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
                          ? getTeamAbbreviation(teamBName)
                          : getTeamAbbreviation(teamAName)}
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
                        setShowDetails(true);
                        posthog?.capture('detailed_analysis_viewed', {
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
        </div>
      ) : (() => {
        if (!result) return null;
        const prediction = result;
        const fallbackTeamA = selectedSeries?.source === 'custom' ? customInput.team_a : selectedSeries?.data?.team_a?.full_name;
        const fallbackTeamB = selectedSeries?.source === 'custom' ? customInput.team_b : selectedSeries?.data?.team_b?.full_name;
        const teamAName = prediction.team_a || fallbackTeamA || 'Team A';
        const teamBName = prediction.team_b || fallbackTeamB || 'Team B';
        const teamALogo = resolveTeamLogoUrl(prediction.team_a_logo) || resolveTeamLogoUrl(selectedSeries?.data?.team_a?.logo_url) || getTeamLogo(teamAName);
        const teamBLogo = resolveTeamLogoUrl(prediction.team_b_logo) || resolveTeamLogoUrl(selectedSeries?.data?.team_b?.logo_url) || getTeamLogo(teamBName);
        const mathsAnchor = METHOD_MATHS_ANCHORS[prediction.method_used];
        return (
          <div className="space-y-8">
            <Card>
              <CardHeader>
                <CardTitle>Prediction Result</CardTitle>
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
                          <span className="text-sm font-medium">{getTeamAbbreviation(teamAName)}</span>
                        </div>
                        <span className="text-muted-foreground">vs</span>
                        <div className="flex items-center gap-2">
                          {teamBLogo && <img src={teamBLogo} alt={teamBName} className="h-10 w-10 object-contain" />}
                          <span className="text-sm font-medium">{getTeamAbbreviation(teamBName)}</span>
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
                        <p className="text-4xl md:text-5xl font-medium">{getTeamAbbreviation(prediction.predicted_winner)}</p>
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
                        ? getTeamAbbreviation(teamBName)
                        : getTeamAbbreviation(teamAName)}
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
                onClick={() => setShowDetails(false)}
              >
                Back to Analysis
              </Button>
              <Button
                variant="default"
                className="flex-1"
                onClick={() => {
                  posthog?.capture('prediction_reset');
                  setResult(null);
                  setSelectedSeries(null);
                  setSelectedMethod(null);
                  setShowDetails(false);
                }}
              >
                New Prediction
              </Button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
