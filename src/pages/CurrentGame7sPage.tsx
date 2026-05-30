import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/db/supabase';
import { Series, Team, SeriesGameScore } from '@/types/types';
import { Trophy, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getTeamLogo, resolveTeamLogoUrl } from '@/lib/team-logos';

interface SeriesWithNestedTeams extends Series {
  team_a?: Team;
  team_b?: Team;
  winner_team?: Team;
  series_game_scores?: SeriesGameScore[];
}

export default function CurrentGame7sPage() {
  const [loading, setLoading] = useState(true);
  const [currentSeries, setCurrentSeries] = useState<SeriesWithNestedTeams[]>([]);

  useEffect(() => {
    fetchCurrentSeries();
  }, []);

  const fetchCurrentSeries = async () => {
    try {
      const { data, error } = await supabase
        .from('series')
        .select('*, team_a:team_a_id(*), team_b:team_b_id(*), winner_team:winner_team_id(*), series_game_scores(*)')
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCurrentSeries(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching current series:', err);
      toast.error('Failed to load current Game 7s');
    } finally {
      setLoading(false);
    }
  };

  const formatScore = (series: SeriesWithNestedTeams, score: SeriesGameScore) => {
    if (!series.team_a || !series.team_b) return null;
    const teamAId = series.team_a_id;
    const teamAScore = score.home_team_id === teamAId ? score.home_score : score.away_score;
    const teamBScore = score.home_team_id === teamAId ? score.away_score : score.home_score;

    return {
      gameNumber: score.game_number,
      scoreA: teamAScore,
      scoreB: teamBScore,
      winner: teamAScore > teamBScore ? series.team_a.full_name : series.team_b.full_name,
    };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="space-y-3">
        <p className="text-muted-foreground">
          Active NBA Game 7 matchups with win probability predictions
        </p>
      </div>

      {currentSeries.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <Trophy className="h-12 w-12 mx-auto text-muted-foreground" />
            <p className="text-lg font-medium">No Active Game 7s</p>
            <p className="text-sm text-muted-foreground">
              There are currently no active Game 7 matchups in the NBA playoffs
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {currentSeries.map((series) => {
            const teamAName = series.team_a?.full_name || 'Team A';
            const teamBName = series.team_b?.full_name || 'Team B';
            const logoA = resolveTeamLogoUrl(series.team_a?.logo_url) || getTeamLogo(teamAName);
            const logoB = resolveTeamLogoUrl(series.team_b?.logo_url) || getTeamLogo(teamBName);
            const scores = (series.series_game_scores ?? [])
              .sort((a, b) => a.game_number - b.game_number)
              .slice(0, 6)
              .map((score) => formatScore(series, score));
            return (
              <Card key={series.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <CardTitle className="text-xl">
                        {teamAName} vs {teamBName}
                      </CardTitle>
                      <CardDescription>
                        {series.year} {series.round}
                      </CardDescription>
                    </div>
                    {series.winner_team && (
                      <div className="text-right shrink-0">
                        <p className="text-xs text-muted-foreground">Predicted Winner</p>
                        <p className="text-sm font-medium">{series.winner_team.full_name}</p>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="p-6 bg-accent rounded-lg space-y-2">
                      <p className="text-sm text-muted-foreground">{teamAName}</p>
                      <p className="text-3xl font-medium">—</p>
                      <p className="text-xs text-muted-foreground">Win Probability</p>
                    </div>
                    <div className="p-6 bg-accent rounded-lg space-y-2">
                      <p className="text-sm text-muted-foreground">{teamBName}</p>
                      <p className="text-3xl font-medium">—</p>
                      <p className="text-xs text-muted-foreground">Win Probability</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p className="text-sm font-medium">Series Scores</p>
                    <div className="grid gap-3">
                      {scores.map((item) => (
                        item ? (
                          <div key={item.gameNumber} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                            <span className="text-sm font-medium">Game {item.gameNumber}</span>
                            <div className="flex items-center gap-4">
                              <span className={`text-sm ${item.scoreA > item.scoreB ? 'font-medium' : 'text-muted-foreground'}`}>
                                {teamAName}: {item.scoreA}
                              </span>
                              <span className={`text-sm ${item.scoreB > item.scoreA ? 'font-medium' : 'text-muted-foreground'}`}>
                                {teamBName}: {item.scoreB}
                              </span>
                            </div>
                          </div>
                        ) : null
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {logoA && <img src={logoA} alt={teamAName} className="h-10 w-10 object-contain" />}
                    {logoB && <img src={logoB} alt={teamBName} className="h-10 w-10 object-contain" />}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
