import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/db/supabase';
import { getTeamAbbreviation } from '@/lib/nba-utils';
import { getTeamLogo, resolveTeamLogoUrl } from '@/lib/team-logos';
import { PredictionInput, PredictionResult, Series } from '@/types/types';
import { Check, Settings, TrendingUp, Trophy, Loader2, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

type SeriesSource = 'current' | 'historical' | 'custom';
type PredictionMethod = 'logistic_regression' | 'bayesian' | 'elo' | 'exponential_smoothing' | 'ensemble_v1' | 'margin_model_v1';

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

export default function PredictPage() {
  const [searchParams] = useSearchParams();
  const [selectedSeries, setSelectedSeries] = useState<SelectedSeries | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<PredictionMethod | null>(null);
  const [isSeriesDialogOpen, setIsSeriesDialogOpen] = useState(false);
  const [isMethodDialogOpen, setIsMethodDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PredictionResult | null>(null);
  
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

  useEffect(() => {
    fetchAllGames();
    
    // Load series from query parameter if provided
    const seriesId = searchParams.get('series');
    if (seriesId) {
      loadSeriesById(seriesId);
    }
  }, [searchParams]);


  useEffect(() => {
    setResult(null);
    setShowDetails(false);
  }, [selectedSeries, selectedMethod, customInput]);

  const fetchAllGames = async () => {
    try {
      const { data, error } = await supabase
        .from('series')
        .select(SERIES_SELECT)
        .order('year', { ascending: false });

      if (error) throw error;
      setGames(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching series:', err);
    }
  };

  const loadSeriesById = async (seriesId: string) => {
    try {
      const { data, error } = await supabase
        .from('series')
        .select(SERIES_SELECT)
        .eq('id', seriesId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSelectedSeries({ source: data.status === 'active' ? 'current' : 'historical', data });
      } else {
        toast.error('Series not found');
      }
    } catch (err) {
      console.error('Error loading series:', err);
      toast.error('Failed to load series');
    }
  };

  const handlePredict = async () => {
    if (!selectedSeries || !selectedMethod) {
      toast.error('Please select both a series and a method');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      let inputData: PredictionInput;

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

      if (selectedSeries.source === 'custom') {
        if (!validateScores(customInput)) {
          setLoading(false);
          return;
        }

        inputData = {
          ...customInput,
          team_a: (customInput.team_a ?? '').trim() || 'Team A',
          team_b: (customInput.team_b ?? '').trim() || 'Team B',
          home_team: undefined,
          method: selectedMethod,
        } as PredictionInput;
      } else if (selectedSeries.data) {
        const series = selectedSeries.data;
        const scores = series.series_game_scores ?? [];
        const sortedScores = [...scores].sort((a, b) => a.game_number - b.game_number);

        if (sortedScores.length < 6) {
          toast.error('Selected series does not include enough game scores for prediction.');
          setLoading(false);
          return;
        }

        const seriesInput: any = {
          series_id: series.id,
          team_a: series.team_a?.full_name || 'Team A',
          team_b: series.team_b?.full_name || 'Team B',
          method: selectedMethod,
        };

        for (let i = 1; i <= 6; i++) {
          const scoreRow = sortedScores.find((row) => row.game_number === i);
          if (!scoreRow) {
            toast.error(`Game ${i} is missing for the selected series.`);
            setLoading(false);
            return;
          }

          const isTeamAHome = scoreRow.home_team_id === series.team_a_id;
          seriesInput[`game_${i}_score_a`] = isTeamAHome ? scoreRow.home_score : scoreRow.away_score;
          seriesInput[`game_${i}_score_b`] = isTeamAHome ? scoreRow.away_score : scoreRow.home_score;
        }

        if (!validateScores(seriesInput)) {
          setLoading(false);
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
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke<PredictionResult>('predict-game-7', {
        body: inputData,
      });

      if (error) {
        const errorMsg = await error?.context?.text();
        throw new Error(errorMsg || error?.message);
      }

      if (data) {
        const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
        setResult(parsedData as PredictionResult);
        toast.success('Prediction generated successfully');
      }
    } catch (err) {
      console.error('Prediction error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to generate prediction');
    } finally {
      setLoading(false);
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
    switch (selectedMethod) {
      case 'logistic_regression': return 'Logistic Regression';
      case 'bayesian': return 'Bayes Method';
      case 'elo': return 'Elo Rating';
      case 'exponential_smoothing': return 'Exponential Smoothing';
      case 'ensemble_v1': return 'Ensemble V1';
      case 'margin_model_v1': return 'Margin Model V1';
      default: return 'Not selected';
    }
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
                <DialogTrigger asChild>
                  <CardContent className="flex-1 flex flex-col space-y-4 cursor-pointer hover:bg-muted/50 transition-colors group">
                    <div className="flex-1 space-y-4 py-4">
                      <div className="space-y-1">
                        <div className="flex items-center justify-center gap-4 py-2">
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
                                <p className="text-xl font-medium group-hover:text-primary transition-colors">{getSeriesLabel()}</p>
                                {teamBLogo && (
                                  <img src={teamBLogo} alt="" className="h-10 w-10 object-contain" />
                                )}
                              </>
                            );
                          })()}
                          {!selectedSeries && (
                            <p className="text-lg font-medium text-center group-hover:text-primary transition-colors">Select a Series</p>
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
                                <p className="text-xl font-medium group-hover:text-primary transition-colors">{getSeriesLabel()}</p>
                                {teamBLogo && (
                                  <img src={teamBLogo} alt="" className="h-10 w-10 object-contain" />
                                )}
                              </>
                            );
                          })()}
                        </div>
                        {!selectedSeries && (
                          <p className="text-xs text-muted-foreground text-center">
                            Click to choose series
                          </p>
                        )}
                      </div>

                      {selectedSeries && selectedSeries.source === 'custom' && (
                        <div className="grid grid-cols-2 gap-2 pt-2" onClick={(e) => e.stopPropagation()}>
                          <div className="space-y-1">
                            <Label className="text-[10px] uppercase text-muted-foreground">Team A</Label>
                            <div className="flex items-center gap-2">
                              {(getTeamLogo((customInput.team_a ?? '').trim() || 'Team A') || getTeamLogo('Team A')) && (
                                <img
                                  src={getTeamLogo((customInput.team_a ?? '').trim() || 'Team A') || getTeamLogo('Team A')}
                                  alt=""
                                  className="h-8 w-8 object-contain shrink-0"
                                />
                              )}
                            <Input 
                              size={1}
                              className="h-8 text-xs"
                              value={customInput.team_a}
                              onChange={(e) => setCustomInput({ ...customInput, team_a: e.target.value })}
                              placeholder="e.g. BOS"
                            />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] uppercase text-muted-foreground">Team B</Label>
                            <div className="flex items-center gap-2">
                              {(getTeamLogo((customInput.team_b ?? '').trim() || 'Team B') || getTeamLogo('Team B')) && (
                                <img
                                  src={getTeamLogo((customInput.team_b ?? '').trim() || 'Team B') || getTeamLogo('Team B')}
                                  alt=""
                                  className="h-8 w-8 object-contain shrink-0"
                                />
                              )}
                            <Input 
                              size={1}
                              className="h-8 text-xs"
                              value={customInput.team_b}
                              onChange={(e) => setCustomInput({ ...customInput, team_b: e.target.value })}
                              placeholder="e.g. MIA"
                            />
                            </div>
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
                              return (
                                <div key={g} className="flex items-center justify-between gap-4" onClick={(e) => e.stopPropagation()}>
                                  <span className="text-xs text-muted-foreground font-medium w-12">Game {g}</span>
                                  <div className="flex-1 grid grid-cols-2 gap-2">
                                    <Input
                                      type="number"
                                      className="h-8 text-center text-xs px-1"
                                      value={(customInput[`game_${g}_score_a` as keyof PredictionInput] as number | undefined) ?? ''}
                                      onChange={(e) => setCustomInput({ 
                                        ...customInput, 
                                        [`game_${g}_score_a`]: e.target.value === '' ? undefined : Number(e.target.value) 
                                      })}
                                      placeholder="A"
                                    />
                                    <Input
                                      type="number"
                                      className="h-8 text-center text-xs px-1"
                                      value={(customInput[`game_${g}_score_b` as keyof PredictionInput] as number | undefined) ?? ''}
                                      onChange={(e) => setCustomInput({ 
                                        ...customInput, 
                                        [`game_${g}_score_b`]: e.target.value === '' ? undefined : Number(e.target.value) 
                                      })}
                                      placeholder="B"
                                    />
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
                </DialogTrigger>
                <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-2xl max-h-[90dvh] flex flex-col p-0 overflow-hidden">
                  <DialogHeader className="p-6 pb-2">
                    <DialogTitle>Select Series</DialogTitle>
                    <DialogDescription>
                      Choose a season to view its Game 7s, or create a custom series
                    </DialogDescription>
                  </DialogHeader>
                  
                  <div className="flex-1 overflow-y-auto p-6 pt-2 space-y-6">
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
                <CardContent className="flex-1 flex flex-col space-y-4 cursor-pointer hover:bg-muted/50 transition-colors group">
                  <div className="flex-1 space-y-4">
                    <div className="space-y-2">
                      <p className="text-lg font-medium text-center group-hover:text-primary transition-colors">{getMethodLabel()}</p>
                      {!selectedMethod ? (
                        <p className="text-xs text-muted-foreground text-center">
                          Click to choose method
                        </p>
                      ) : (
                        <div className="space-y-4 pt-2">
                          <p className="text-xs text-muted-foreground leading-relaxed">
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
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
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
                {!selectedSeries || !selectedMethod 
                  ? 'Select series and method first' 
                  : 'Click to generate prediction'}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col justify-center items-center space-y-6">
              {loading ? (
                <div className="text-center space-y-4">
                  <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
                  <p className="text-sm text-muted-foreground">Analyzing series data...</p>
                </div>
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
        return (
          <div className="space-y-8">
            <Card>
              <CardHeader>
                <CardTitle>Prediction Result</CardTitle>
                <CardDescription className="flex items-center gap-2">
                  <span>Method: {prediction.method_used === 'logistic_regression' ? 'Logistic Regression' : 
                                prediction.method_used === 'bayes' ? 'Bayes Method' :
                                prediction.method_used === 'elo' ? 'Elo Rating' : 'Exponential Smoothing'}</span>
                  <span className="text-muted-foreground/30">•</span>
                  <Link 
                    to={`/maths#${prediction.method_used === 'logistic_regression' ? 'logistic-regression' : 
                                  prediction.method_used === 'bayes' ? 'bayesian-inference' :
                                  prediction.method_used === 'elo' ? 'elo-rating' : 'exponential-smoothing'}`}
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
