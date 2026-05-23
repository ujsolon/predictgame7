import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { supabase } from '@/db/supabase';
import { GameSeven } from '@/types/types';
import { Loader2, ChevronDown, Check, Search, FilterX } from 'lucide-react';
import { toast } from 'sonner';
import { getTeamAbbreviation, getRoundImportance } from '@/lib/nba-utils';
import { getTeamLogo } from '@/lib/team-logos';

export default function HistoricalPage() {
  const [loading, setLoading] = useState(true);
  const [games, setGames] = useState<GameSeven[]>([]);
  const [visibleCount, setVisibleCount] = useState(10);
  const [selectedGame, setSelectedGame] = useState<GameSeven | null>(null);
  
  // Filter states
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [teamSearch, setTeamSearch] = useState<string>('');

  useEffect(() => {
    fetchHistoricalGames().finally(() => setLoading(false));
  }, []);

  const fetchHistoricalGames = async () => {
    try {
      const { data, error } = await supabase
        .from('game_sevens')
        .select('*');

      if (error) throw error;

      if (data) {
        const sortedData = [...data].sort((a, b) => {
          if (b.year !== a.year) return b.year - a.year;
          return getRoundImportance(b.round) - getRoundImportance(a.round);
        });
        setGames(sortedData);
      }
    } catch (err) {
      console.error('Error fetching historical games:', err);
      toast.error('Failed to load historical data');
    }
  };



  const years = useMemo(() => {
    const uniqueYears = Array.from(new Set(games.map(g => g.year))).sort((a, b) => b - a);
    return uniqueYears;
  }, [games]);

  const filteredGames = useMemo(() => {
    return games.filter(game => {
      const matchesYear = yearFilter === 'all' || game.year.toString() === yearFilter;
      const matchesTeam = teamSearch === '' || 
        game.team_a.toLowerCase().includes(teamSearch.toLowerCase()) || 
        game.team_b.toLowerCase().includes(teamSearch.toLowerCase());
      return matchesYear && matchesTeam;
    });
  }, [games, yearFilter, teamSearch]);

  const loadMore = () => {
    setVisibleCount(prev => prev + 10);
  };

  const resetFilters = () => {
    setYearFilter('all');
    setTeamSearch('');
    setVisibleCount(10);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const visibleGames = filteredGames.slice(0, visibleCount);

  return (
    <div className="max-w-5xl mx-auto space-y-12 pb-20 animate-in fade-in duration-700">
      <div className="space-y-4">
        <h1 className="text-4xl md:text-5xl font-medium tracking-tight font-montserrat">{"Archives"}</h1>
        <p className="text-muted-foreground text-lg md:text-xl max-w-2xl leading-relaxed text-pretty">
          Explore the complete archive of every series-deciding game in NBA history, analyzed and preserved.
        </p>
      </div>

      {/* Filters Section */}
      <div className="flex flex-col md:flex-row gap-4 items-end bg-muted/20 p-4 rounded-lg border border-border/50">
        <div className="w-full md:w-[200px] space-y-2">
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold px-1">Filter Year</label>
          <Select value={yearFilter} onValueChange={(val) => { setYearFilter(val); setVisibleCount(10); }}>
            <SelectTrigger className="bg-background border-border/60">
              <SelectValue placeholder="Select Year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              {years.map(year => (
                <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
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
              {visibleGames.length > 0 ? (
                visibleGames.map((game) => {
                  const isTeamAWinner = game.winner === game.team_a;
                  const abbrevA = getTeamAbbreviation(game.team_a);
                  const abbrevB = getTeamAbbreviation(game.team_b);
                  const logoA = getTeamLogo(game.team_a);
                  const logoB = getTeamLogo(game.team_b);
                  
                  return (
                    <TableRow 
                      key={game.id} 
                      className="group border-b border-border/40 hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => setSelectedGame(selectedGame?.id === game.id ? null : game)}
                    >
                      <TableCell className="py-8 font-normal text-muted-foreground align-top">
                        {game.year}
                      </TableCell>
                      <TableCell className="py-8">
                        <div className="flex flex-col space-y-2">
                          <div className="flex items-center gap-4 text-lg md:text-xl">
                            <div className="flex items-center gap-3 min-w-[120px]">
                              {logoA && <img src={logoA} alt={game.team_a} className="h-6 w-6 object-contain grayscale group-hover:grayscale-0 transition-all" />}
                              <span className={`transition-colors ${isTeamAWinner ? 'font-semibold text-foreground' : 'text-muted-foreground/60'}`}>
                                {abbrevA}
                              </span>
                            </div>
                            <span className="text-muted-foreground/30 font-light">vs</span>
                            <div className="flex items-center gap-3 min-w-[120px]">
                              <span className={`transition-colors ${!isTeamAWinner ? 'font-semibold text-foreground' : 'text-muted-foreground/60'}`}>
                                {abbrevB}
                              </span>
                              {logoB && <img src={logoB} alt={game.team_b} className="h-6 w-6 object-contain grayscale group-hover:grayscale-0 transition-all" />}
                            </div>
                          </div>
                          <span className="text-xs uppercase tracking-widest text-muted-foreground/50 font-medium">{game.round}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-8 text-right pr-8">
                        <div className="flex items-center justify-end gap-3 text-lg md:text-xl tabular-nums">
                          <span className={`transition-all duration-300 ${isTeamAWinner ? 'font-semibold text-primary' : 'text-muted-foreground/60'}`}>
                            {game.game_7_score_a}
                          </span>
                          <span className="text-muted-foreground/20 font-light">−</span>
                          <span className={`transition-all duration-300 ${!isTeamAWinner ? 'font-semibold text-primary' : 'text-muted-foreground/60'}`}>
                            {game.game_7_score_b}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={3} className="py-20 text-center text-muted-foreground">
                    No games found matching your filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {visibleCount < filteredGames.length && (
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
      {selectedGame && (
        <div className="fixed inset-x-0 bottom-0 z-50 p-4 md:p-8 pointer-events-none flex justify-center">
          <Card className="w-full max-w-2xl shadow-2xl border-border/50 pointer-events-auto animate-in slide-in-from-bottom-8 duration-500 bg-background/95 backdrop-blur-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="flex items-center gap-4">
                <div className="flex -space-x-2">
                  {getTeamLogo(selectedGame.team_a) && (
                    <img src={getTeamLogo(selectedGame.team_a)} alt={selectedGame.team_a} className="h-10 w-10 rounded-full border-2 border-background bg-white p-1" />
                  )}
                  {getTeamLogo(selectedGame.team_b) && (
                    <img src={getTeamLogo(selectedGame.team_b)} alt={selectedGame.team_b} className="h-10 w-10 rounded-full border-2 border-background bg-white p-1" />
                  )}
                </div>
                <div className="space-y-1">
                  <CardTitle className="text-xl">{selectedGame.year} {selectedGame.round}</CardTitle>
                  <CardDescription>{selectedGame.team_a} vs {selectedGame.team_b}</CardDescription>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedGame(null)} className="h-8 w-8 p-0 rounded-full">
                <span className="sr-only">Close</span>
                ×
              </Button>
            </CardHeader>
            <CardContent className="space-y-6 pt-4">
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                {[1, 2, 3, 4, 5, 6, 7].map((gameNum) => {
                  const scoreA = selectedGame[`game_${gameNum}_score_a` as keyof GameSeven] as number;
                  const scoreB = selectedGame[`game_${gameNum}_score_b` as keyof GameSeven] as number;
                  const winnerA = scoreA > scoreB;
                  
                  return (
                    <div key={gameNum} className="flex flex-col items-center gap-1.5 p-2 rounded-lg bg-muted/30 border border-border/30">
                      <span className="text-[10px] uppercase tracking-tighter text-muted-foreground">G{gameNum}</span>
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
                    <p className="text-base font-medium">{selectedGame.winner}</p>
                  </div>
                </div>
                {selectedGame.home_team && (
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Home Team</p>
                    <p className="text-sm">{selectedGame.home_team}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

