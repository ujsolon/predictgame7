import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { supabase } from '@/db/supabase';
import { Series, SeriesGameScore, Team } from '@/types/types';
import { Loader2, ChevronDown, Check, Search, FilterX } from 'lucide-react';
import { toast } from 'sonner';
import { getTeamAbbreviation, getRoundImportance } from '@/lib/nba-utils';
import { getTeamLogo, resolveTeamLogoUrl } from '@/lib/team-logos';

interface SeriesWithNestedTeams extends Series {
  team_a?: Team;
  team_b?: Team;
  winner_team?: Team;
  series_game_scores?: SeriesGameScore[];
}

export default function HistoricalPage() {
  const [loading, setLoading] = useState(true);
  const [seriesList, setSeriesList] = useState<SeriesWithNestedTeams[]>([]);
  const [visibleCount, setVisibleCount] = useState(10);
  const [selectedSeries, setSelectedSeries] = useState<SeriesWithNestedTeams | null>(null);
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [teamSearch, setTeamSearch] = useState<string>('');

  useEffect(() => {
    fetchHistoricalSeries().finally(() => setLoading(false));
  }, []);

  const fetchHistoricalSeries = async () => {
    try {
      const { data, error } = await supabase
        .from('series')
        .select('*, team_a:team_a_id(*), team_b:team_b_id(*), winner_team:winner_team_id(*), series_game_scores(*)')
        .eq('status', 'historical');

      if (error) throw error;

      if (data) {
        const sortedData = [...data].sort((a, b) => {
          if (b.year !== a.year) return b.year - a.year;
          return getRoundImportance(b.round) - getRoundImportance(a.round);
        });
        setSeriesList(sortedData);
      }
    } catch (err) {
      console.error('Error fetching historical series:', err);
      toast.error('Failed to load historical data');
    }
  };

  const years = useMemo(() => {
    const uniqueYears = Array.from(new Set(seriesList.map((series) => series.year))).sort((a, b) => b - a);
    return uniqueYears;
  }, [seriesList]);

  const filteredSeries = useMemo(() => {
    return seriesList.filter((series) => {
      const teamAName = series.team_a?.full_name ?? '';
      const teamBName = series.team_b?.full_name ?? '';
      const matchesYear = yearFilter === 'all' || series.year.toString() === yearFilter;
      const matchesTeam =
        teamSearch === '' ||
        teamAName.toLowerCase().includes(teamSearch.toLowerCase()) ||
        teamBName.toLowerCase().includes(teamSearch.toLowerCase());
      return matchesYear && matchesTeam;
    });
  }, [seriesList, yearFilter, teamSearch]);

  const loadMore = () => {
    setVisibleCount((prev) => prev + 10);
  };

  const resetFilters = () => {
    setYearFilter('all');
    setTeamSearch('');
    setVisibleCount(10);
  };

  const formatGame7Score = (series: SeriesWithNestedTeams) => {
    const scoreRow = series.series_game_scores?.find((score) => score.game_number === 7);
    if (!scoreRow || !series.team_a || !series.team_b) return null;
    const teamAId = series.team_a_id;
    const scoreA = scoreRow.home_team_id === teamAId ? scoreRow.home_score : scoreRow.away_score;
    const scoreB = scoreRow.home_team_id === teamAId ? scoreRow.away_score : scoreRow.home_score;
    return { scoreA, scoreB };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const visibleSeries = filteredSeries.slice(0, visibleCount);

  return (
    <div className="max-w-5xl mx-auto space-y-12 pb-20 animate-in fade-in duration-700">
      <div className="space-y-4">
        <h1 className="text-4xl md:text-5xl font-medium tracking-tight font-montserrat">Archives</h1>
        <p className="text-muted-foreground text-lg md:text-xl max-w-2xl leading-relaxed text-pretty">
          Explore the complete archive of every series-deciding game in NBA history, analyzed and preserved.
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-end bg-muted/20 p-4 rounded-lg border border-border/50">
        <div className="w-full md:w-[200px] space-y-2">
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold px-1">Filter Year</label>
          <Select value={yearFilter} onValueChange={(val) => { setYearFilter(val); setVisibleCount(10); }}>
            <SelectTrigger className="bg-background border-border/60">
              <SelectValue placeholder="Select Year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              {years.map((year) => (
                <SelectItem key={year} value={year.toString()}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full md:flex-1 space-y-2">
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold px-1">Search Team</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by team name..."
              className="pl-9 bg-background border-border/60"
              value={teamSearch}
              onChange={(e) => { setTeamSearch(e.target.value); setVisibleCount(10); }}
            />
          </div>
        </div>
        {(yearFilter !== 'all' || teamSearch !== '') && (
          <Button variant="ghost" size="icon" onClick={resetFilters} className="h-10 w-10 text-muted-foreground hover:text-destructive transition-colors">
            <FilterX className="h-5 w-5" />
          </Button>
        )}
      </div>

      <div className="space-y-8">
        <div className="w-full overflow-x-auto -mx-4 px-4 md:-mx-0 md:px-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-b border-border/60">
                <TableHead className="w-[80px] font-medium text-muted-foreground py-4 uppercase tracking-widest text-[10px]">Year</TableHead>
                <TableHead className="font-medium text-muted-foreground py-4 uppercase tracking-widest text-[10px]">Matchup & Round</TableHead>
                <TableHead className="text-right font-medium text-muted-foreground py-4 uppercase tracking-widest text-[10px] pr-8">Final Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleSeries.length > 0 ? (
                visibleSeries.map((series) => {
                  const teamAName = series.team_a?.full_name ?? 'Team A';
                  const teamBName = series.team_b?.full_name ?? 'Team B';
                  const isTeamAWinner = series.winner_team_id === series.team_a_id;
                  const abbrevA = getTeamAbbreviation(teamAName);
                  const abbrevB = getTeamAbbreviation(teamBName);
                  const logoA = resolveTeamLogoUrl(series.team_a?.logo_url) || getTeamLogo(teamAName);
                  const logoB = resolveTeamLogoUrl(series.team_b?.logo_url) || getTeamLogo(teamBName);
                  const finalScore = formatGame7Score(series);

                  return (
                    <TableRow
                      key={series.id}
                      className="group border-b border-border/40 hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => setSelectedSeries(selectedSeries?.id === series.id ? null : series)}
                    >
                      <TableCell className="py-8 font-normal text-muted-foreground align-top">
                        {series.year}
                      </TableCell>
                      <TableCell className="py-8">
                        <div className="flex flex-col space-y-2">
                          <div className="flex items-center gap-4 text-lg md:text-xl">
                            <div className="flex items-center gap-3 min-w-[120px]">
                              {logoA && (
                                <img src={logoA} alt={teamAName} className="h-6 w-6 object-contain grayscale group-hover:grayscale-0 transition-all" />
                              )}
                              <span className={`transition-colors ${isTeamAWinner ? 'font-semibold text-foreground' : 'text-muted-foreground/60'}`}>
                                {abbrevA}
                              </span>
                            </div>
                            <span className="text-muted-foreground/30 font-light">vs</span>
                            <div className="flex items-center gap-3 min-w-[120px]">
                              <span className={`transition-colors ${!isTeamAWinner ? 'font-semibold text-foreground' : 'text-muted-foreground/60'}`}>
                                {abbrevB}
                              </span>
                              {logoB && (
                                <img src={logoB} alt={teamBName} className="h-6 w-6 object-contain grayscale group-hover:grayscale-0 transition-all" />
                              )}
                            </div>
                          </div>
                          <span className="text-xs uppercase tracking-widest text-muted-foreground/50 font-medium">{series.round}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-8 text-right pr-8">
                        <div className="flex items-center justify-end gap-3 text-lg md:text-xl tabular-nums">
                          <span className={`transition-all duration-300 ${isTeamAWinner ? 'font-semibold text-primary' : 'text-muted-foreground/60'}`}>
                            {finalScore?.scoreA ?? '-'}
                          </span>
                          <span className="text-muted-foreground/20 font-light">−</span>
                          <span className={`transition-all duration-300 ${!isTeamAWinner ? 'font-semibold text-primary' : 'text-muted-foreground/60'}`}>
                            {finalScore?.scoreB ?? '-'}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={3} className="py-20 text-center text-muted-foreground">
                    No series found matching your filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {visibleCount < filteredSeries.length && (
          <div className="flex justify-center pt-8">
            <Button
              variant="ghost"
              onClick={loadMore}
              className="text-muted-foreground hover:text-foreground transition-all duration-300 gap-2 hover:bg-transparent"
            >
              <ChevronDown className="h-4 w-4" />
              Load More History
            </Button>
          </div>
        )}
      </div>

      {selectedSeries && (
        <div className="fixed inset-x-0 bottom-0 z-50 p-4 md:p-8 pointer-events-none flex justify-center">
          <Card className="w-full max-w-2xl shadow-2xl border-border/50 pointer-events-auto animate-in slide-in-from-bottom-8 duration-500 bg-background/95 backdrop-blur-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="flex items-center gap-4">
                <div className="flex -space-x-2">
                  {resolveTeamLogoUrl(selectedSeries.team_a?.logo_url) && (
                    <img src={resolveTeamLogoUrl(selectedSeries.team_a?.logo_url)} alt={selectedSeries.team_a.full_name} className="h-10 w-10 rounded-full border-2 border-background bg-white p-1" />
                  )}
                  {resolveTeamLogoUrl(selectedSeries.team_b?.logo_url) && (
                    <img src={resolveTeamLogoUrl(selectedSeries.team_b?.logo_url)} alt={selectedSeries.team_b.full_name} className="h-10 w-10 rounded-full border-2 border-background bg-white p-1" />
                  )}
                </div>
                <div className="space-y-1">
                  <CardTitle className="text-xl">{selectedSeries.year} {selectedSeries.round}</CardTitle>
                  <CardDescription>{selectedSeries.team_a?.full_name} vs {selectedSeries.team_b?.full_name}</CardDescription>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedSeries(null)} className="h-8 w-8 p-0 rounded-full">
                <span className="sr-only">Close</span>
                ×
              </Button>
            </CardHeader>
            <CardContent className="space-y-6 pt-4">
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                {selectedSeries.series_game_scores?.sort((a, b) => a.game_number - b.game_number).map((score) => {
                  const isTeamAHome = score.home_team_id === selectedSeries.team_a_id;
                  const scoreA = isTeamAHome ? score.home_score : score.away_score;
                  const scoreB = isTeamAHome ? score.away_score : score.home_score;
                  const winnerA = scoreA > scoreB;

                  return (
                    <div key={score.id} className="flex flex-col items-center gap-1.5 p-2 rounded-lg bg-muted/30 border border-border/30">
                      <span className="text-[10px] uppercase tracking-tighter text-muted-foreground">G{score.game_number}</span>
                      <div className="flex flex-col items-center gap-0.5 font-mono text-[10px]">
                        <span className={winnerA ? 'font-bold text-primary' : ''}>{scoreA}</span>
                        <span className={!winnerA ? 'font-bold text-primary' : ''}>{scoreB}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between px-4 py-3 bg-muted/40 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Check className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Series Winner</p>
                    <p className="text-base font-medium">{selectedSeries.winner_team?.full_name || 'TBD'}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Series Status</p>
                  <p className="text-sm capitalize">{selectedSeries.status}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

