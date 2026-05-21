import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/db/supabase';
import { InsightCache } from '@/types/types';
import { Loader2, TrendingUp, Home, Target } from 'lucide-react';
import { toast } from 'sonner';

interface InsightData {
  game_6_winner_stats: {
    total_game_sevens: number;
    game_6_winners_won: number;
    win_rate: number;
  };
  home_team_stats: {
    total_game_sevens: number;
    home_team_wins: number;
    win_rate: number;
  };
  avg_point_differential: {
    average: number;
    median: number;
    max: number;
    min: number;
  };
}

export default function InsightsPage() {
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState<InsightData | null>(null);

  useEffect(() => {
    fetchInsights();
  }, []);

  const fetchInsights = async () => {
    try {
      const { data, error } = await supabase
        .from('insights_cache')
        .select('*');

      if (error) throw error;

      if (data && Array.isArray(data)) {
        const insightData: Partial<InsightData> = {};
        
        for (const item of data) {
          if (item.insight_key === 'game_6_winner_stats') {
            insightData.game_6_winner_stats = item.insight_value as InsightData['game_6_winner_stats'];
          } else if (item.insight_key === 'home_team_stats') {
            insightData.home_team_stats = item.insight_value as InsightData['home_team_stats'];
          } else if (item.insight_key === 'avg_point_differential') {
            insightData.avg_point_differential = item.insight_value as InsightData['avg_point_differential'];
          }
        }
        
        setInsights(insightData as InsightData);
      }
    } catch (err) {
      console.error('Error fetching insights:', err);
      toast.error('Failed to load insights');
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

  if (!insights) {
    return (
      <div className="max-w-5xl mx-auto">
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <p className="text-lg font-medium">No Insights Available</p>
            <p className="text-sm text-muted-foreground">
              Insights data is currently unavailable
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="space-y-3">
        <h1 className="text-3xl md:text-4xl font-medium">Insights Dashboard</h1>
        <p className="text-muted-foreground">
          Statistical patterns and key factors that influence <span className="whitespace-nowrap">Game 7</span> outcomes
        </p>
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        <Card className="h-full flex flex-col">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-accent rounded-lg shrink-0">
                <TrendingUp className="h-5 w-5 text-accent-foreground" />
              </div>
              <CardTitle className="text-base">{"Game 6 Impact"}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col">
            <div className="space-y-4 flex-1">
              <div className="text-center py-4">
                <p className="text-4xl font-medium">
                  {insights.game_6_winner_stats?.win_rate?.toFixed(2) || 0}%
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  Win rate for Game 6 winners
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                {`Based on ${insights.game_6_winner_stats?.total_game_sevens || 0} historical Game 7s, teams that won Game 6 went on to win Game 7 in ${insights.game_6_winner_stats?.game_6_winners_won || 0} cases`}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="h-full flex flex-col">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-accent rounded-lg shrink-0">
                <Home className="h-5 w-5 text-accent-foreground" />
              </div>
              <CardTitle className="text-base">Home Court Advantage</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col">
            <div className="space-y-4 flex-1">
              <div className="text-center py-4">
                <p className="text-4xl font-medium">
                  {insights.home_team_stats?.win_rate?.toFixed(1) || 0}%
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  Home team win rate
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                {`Home teams won ${insights.home_team_stats?.home_team_wins || 0} out of ${insights.home_team_stats?.total_game_sevens || 0} Game 7s, demonstrating the importance of home court advantage`}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="h-full flex flex-col">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-accent rounded-lg shrink-0">
                <Target className="h-5 w-5 text-accent-foreground" />
              </div>
              <CardTitle className="text-base">Point Differential</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col">
            <div className="space-y-4 flex-1">
              <div className="text-center py-4">
                <p className="text-4xl font-medium">
                  {insights.avg_point_differential?.average?.toFixed(2) || 0}
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  Average margin of victory
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                {`Game 7s are typically decided by an average of ${insights.avg_point_differential?.average?.toFixed(2) || 0} points, with margins ranging from ${insights.avg_point_differential?.min || 0} to ${insights.avg_point_differential?.max || 0} points`}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Key Patterns</CardTitle>
          <CardDescription>
            Important patterns observed in historical Game 7 data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="p-4 border border-border rounded-lg space-y-2">
              <p className="font-medium text-sm">Momentum Matters</p>
              <p className="text-sm text-muted-foreground">
                {`Teams that win Game 6 carry significant momentum into Game 7, with a ${insights.game_6_winner_stats?.win_rate?.toFixed(2) || 0}% success rate. This suggests that recent performance is a strong predictor of Game 7 outcomes.`}
              </p>
            </div>

            <div className="p-4 border border-border rounded-lg space-y-2">
              <p className="font-medium text-sm">Home Court Advantage</p>
              <p className="text-sm text-muted-foreground">
                {`Playing at home provides a measurable advantage in Game 7, with home teams winning ${insights.home_team_stats?.win_rate?.toFixed(1) || 0}% of the time. The familiar environment and crowd support can be decisive factors.`}
              </p>
            </div>

            <div className="p-4 border border-border rounded-lg space-y-2">
              <p className="font-medium text-sm">Close Contests</p>
              <p className="text-sm text-muted-foreground">
                {`Game 7s are typically competitive, with an average margin of victory of just ${insights.avg_point_differential?.average?.toFixed(2) || 0} points. This highlights the high-stakes, evenly-matched nature of these decisive games.`}
              </p>
            </div>

            <div className="p-4 border border-border rounded-lg space-y-2">
              <p className="font-medium text-sm">Series Context</p>
              <p className="text-sm text-muted-foreground">
                Cumulative point differential across Games 1-6 provides insight into overall team strength and can help predict Game 7 outcomes when combined with momentum and home court factors.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
