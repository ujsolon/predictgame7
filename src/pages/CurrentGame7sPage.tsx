import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/db/supabase';
import { GameSeven } from '@/types/types';
import { Trophy, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function CurrentGame7sPage() {
  const [loading, setLoading] = useState(true);
  const [currentGames, setCurrentGames] = useState<GameSeven[]>([]);

  useEffect(() => {
    fetchCurrentGames();
  }, []);

  const fetchCurrentGames = async () => {
    try {
      const { data, error } = await supabase
        .from('game_sevens')
        .select('*')
        .eq('is_current', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setCurrentGames(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching current games:', err);
      toast.error('Failed to load current Game 7s');
    } finally {
      setLoading(false);
    }
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
      {currentGames.length === 0 ? (
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
          {currentGames.map((game) => (
            <Card key={game.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <CardTitle className="text-xl">
                      {game.team_a} vs {game.team_b}
                    </CardTitle>
                    <CardDescription>
                      {game.year} {game.round}
                    </CardDescription>
                  </div>
                  {game.predicted_winner && (
                    <div className="text-right shrink-0">
                      <p className="text-xs text-muted-foreground">Predicted Winner</p>
                      <p className="text-sm font-medium">{game.predicted_winner}</p>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {game.win_probability_a !== null && game.win_probability_b !== null && (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="p-6 bg-accent rounded-lg space-y-2">
                      <p className="text-sm text-muted-foreground">{game.team_a}</p>
                      <p className="text-3xl font-medium">{game.win_probability_a}%</p>
                      <p className="text-xs text-muted-foreground">Win Probability</p>
                    </div>
                    <div className="p-6 bg-accent rounded-lg space-y-2">
                      <p className="text-sm text-muted-foreground">{game.team_b}</p>
                      <p className="text-3xl font-medium">{game.win_probability_b}%</p>
                      <p className="text-xs text-muted-foreground">Win Probability</p>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <p className="text-sm font-medium">Series Scores (Games 1-6)</p>
                  <div className="grid gap-3">
                    {[1, 2, 3, 4, 5, 6].map((gameNum) => {
                      const scoreA = game[`game_${gameNum}_score_a` as keyof GameSeven] as number;
                      const scoreB = game[`game_${gameNum}_score_b` as keyof GameSeven] as number;
                      const winner = scoreA > scoreB ? game.team_a : game.team_b;
                      
                      return (
                        <div key={gameNum} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                          <span className="text-sm font-medium">Game {gameNum}</span>
                          <div className="flex items-center gap-4">
                            <span className={`text-sm ${scoreA > scoreB ? 'font-medium' : 'text-muted-foreground'}`}>
                              {game.team_a}: {scoreA}
                            </span>
                            <span className={`text-sm ${scoreB > scoreA ? 'font-medium' : 'text-muted-foreground'}`}>
                              {game.team_b}: {scoreB}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {game.home_team && (
                  <p className="text-xs text-muted-foreground">
                    Home court advantage: {game.home_team}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
