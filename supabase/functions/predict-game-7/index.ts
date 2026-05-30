import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const W = [0.03, 0.03, 0.01, 0, 0.03, -0.01];
const B = 0;

interface PredictionInput {
  team_a: string;
  team_b: string;
  game_1_score_a: number;
  game_1_score_b: number;
  game_2_score_a: number;
  game_2_score_b: number;
  game_3_score_a: number;
  game_3_score_b: number;
  game_4_score_a: number;
  game_4_score_b: number;
  game_5_score_a: number;
  game_5_score_b: number;
  game_6_score_a: number;
  game_6_score_b: number;
  home_team?: string;
  method?: 'logistic_regression' | 'bayes' | 'elo' | 'exponential_smoothing';
  parameters?: Record<string, number>;
}

interface ContributingFactor {
  factor: string;
  description: string;
  impact: number;
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

function calculateFeatures(input: PredictionInput): Record<string, number> {
  const diffs = [
    input.game_1_score_a - input.game_1_score_b,
    input.game_2_score_a - input.game_2_score_b,
    input.game_3_score_a - input.game_3_score_b,
    input.game_4_score_a - input.game_4_score_b,
    input.game_5_score_a - input.game_5_score_b,
    input.game_6_score_a - input.game_6_score_b,
  ];

  const cumulative_margin = diffs.reduce((sum, d) => sum + d, 0);
  const recent_margin = diffs[4] + diffs[5];
  const home_advantage = input.home_team === input.team_a ? 1 : (input.home_team === input.team_b ? -1 : 0);
  const game_6_winner = diffs[5] > 0 ? 1 : -1;

  return {
    diffs_0: diffs[0],
    diffs_1: diffs[1],
    diffs_2: diffs[2],
    diffs_3: diffs[3],
    diffs_4: diffs[4],
    diffs_5: diffs[5],
    cumulative_margin,
    recent_margin,
    home_advantage,
    game_6_winner,
  };
}

function predict(features: Record<string, number>): number {
  const x = [
    features.diffs_0,
    features.diffs_1,
    features.diffs_2,
    features.diffs_3,
    features.diffs_4,
    features.diffs_5,
  ];
  const z = x.reduce((sum, xi, i) => sum + W[i] * xi, 0) + B;
  return sigmoid(z);
}

function getContributingFactors(
  features: Record<string, number>,
  input: PredictionInput
): ContributingFactor[] {
  const factors: ContributingFactor[] = [];
  const diffs = [
    features.diffs_0, features.diffs_1, features.diffs_2,
    features.diffs_3, features.diffs_4, features.diffs_5,
  ];

  // Game 6 result
  const lastWinnerIsA = features.diffs_5 > 0;
  factors.push({
    factor: `Game 6 ${lastWinnerIsA ? input.team_a : input.team_b} victory`,
    description: `${lastWinnerIsA ? input.team_a : input.team_b} won Game 6 by ${Math.abs(features.diffs_5)} pts — Game 6 winners take Game 7 ~62% of the time.`,
    impact: Math.abs(W[5] * features.diffs_5),
  });

  // Cumulative margin
  if (Math.abs(features.cumulative_margin) >= 10) {
    const leader = features.cumulative_margin > 0 ? input.team_a : input.team_b;
    factors.push({
      factor: `${leader} leads cumulative differential`,
      description: `${leader} outscored the opposition by ${Math.abs(features.cumulative_margin)} total points across all 6 games.`,
      impact: Math.abs(features.cumulative_margin) * 0.01,
    });
  }

  // Closing streak
  let streakCount = 1;
  const lastIsA = diffs[5] > 0;
  for (let i = 4; i >= 0; i--) {
    if ((diffs[i] > 0) === lastIsA) streakCount++;
    else break;
  }
  if (streakCount >= 2) {
    const streakTeam = lastIsA ? input.team_a : input.team_b;
    factors.push({
      factor: `${streakTeam} on a ${streakCount}-game closing streak`,
      description: `${streakTeam} won the last ${streakCount} games — strong momentum heading into Game 7.`,
      impact: streakCount * 0.05,
    });
  }

  // Blowout loss (15+ pt margin)
  const blowoutIdx = diffs.findIndex((d, i) => i > 0 && Math.abs(d) >= 15);
  if (blowoutIdx !== -1) {
    const loser = diffs[blowoutIdx] > 0 ? input.team_b : input.team_a;
    factors.push({
      factor: `${loser} blowout loss in Game ${blowoutIdx + 1}`,
      description: `${loser} lost Game ${blowoutIdx + 1} by ${Math.abs(diffs[blowoutIdx])} pts — a potential sign of fatigue or tactical breakdown.`,
      impact: Math.abs(diffs[blowoutIdx]) * 0.01,
    });
  }

  // Home court
  if (features.home_advantage !== 0) {
    const homeTeam = features.home_advantage > 0 ? input.team_a : input.team_b;
    factors.push({
      factor: `${homeTeam} has home court for Game 7`,
      description: `Home teams win ~62% of Game 7s historically.`,
      impact: 0.3,
    });
  }

  // Recent momentum (Games 5–6)
  if (Math.abs(features.recent_margin) >= 10) {
    const leader = features.recent_margin > 0 ? input.team_a : input.team_b;
    factors.push({
      factor: `${leader} dominated Games 5–6`,
      description: `${leader} outscored the opposition by ${Math.abs(features.recent_margin)} pts across the last two games.`,
      impact: Math.abs(features.recent_margin) * 0.02,
    });
  }

  factors.sort((a, b) => b.impact - a.impact);
  return factors.slice(0, 3);
}

function predictElo(input: PredictionInput): number {
  const K = 20;
  let eloA = 1500;
  let eloB = 1500;

  const scores = [
    [input.game_1_score_a, input.game_1_score_b],
    [input.game_2_score_a, input.game_2_score_b],
    [input.game_3_score_a, input.game_3_score_b],
    [input.game_4_score_a, input.game_4_score_b],
    [input.game_5_score_a, input.game_5_score_b],
    [input.game_6_score_a, input.game_6_score_b],
  ];

  for (const [sa, sb] of scores) {
    const expectedA = 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
    const expectedB = 1 - expectedA;
    const actualA = sa > sb ? 1 : 0;
    const actualB = 1 - actualA;

    // Margin multiplier — larger wins shift Elo more
    const margin = Math.abs(sa - sb);
    const marginMultiplier = Math.log(margin + 1);

    eloA += K * marginMultiplier * (actualA - expectedA);
    eloB += K * marginMultiplier * (actualB - expectedB);
  }

  // Convert final Elo difference to win probability
  return 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
}

function predictExponentialSmoothing(input: PredictionInput): number {
  const alpha = 0.7; // recency weight — higher = more weight on recent games

  const diffs = [
    input.game_1_score_a - input.game_1_score_b,
    input.game_2_score_a - input.game_2_score_b,
    input.game_3_score_a - input.game_3_score_b,
    input.game_4_score_a - input.game_4_score_b,
    input.game_5_score_a - input.game_5_score_b,
    input.game_6_score_a - input.game_6_score_b,
  ];

  // Start with Game 1 differential, then smooth forward
  let smoothed = diffs[0];
  for (let i = 1; i < diffs.length; i++) {
    smoothed = alpha * diffs[i] + (1 - alpha) * smoothed;
  }

  // Scale factor controls how aggressively the smoothed value maps to probability
  // A smoothed diff of ~10 should give ~73%, ~20 should give ~88%
  const scaleFactor = 0.1;
  return sigmoid(smoothed * scaleFactor);
}

function predictBayes(features: Record<string, number>, input: PredictionInput): number {
  // Bayesian approach using point differences from all 6 games
  // Prior probability (Team A win prob before considering games)
  let prob_a = 0.5;
  
  // Home court advantage update
  if (features.home_advantage > 0) {
    const likelihood = 0.62; // 62% win rate for home teams in Game 7
    prob_a = (prob_a * likelihood) / (prob_a * likelihood + (1 - prob_a) * (1 - likelihood));
  } else if (features.home_advantage < 0) {
    const likelihood = 0.38; // 38% win rate for away teams in Game 7
    prob_a = (prob_a * likelihood) / (prob_a * likelihood + (1 - prob_a) * (1 - likelihood));
  }
  
  // Game-by-game point difference updates
  // Sensitivity k: how much a point difference affects likelihood
  const k = 0.04; 
  
  const diffs = [
    features.diffs_0, features.diffs_1, features.diffs_2,
    features.diffs_3, features.diffs_4, features.diffs_5
  ];
  
  for (const d of diffs) {
    // Likelihood P(d | Win) modeled by a sigmoid relationship
    // More accurately, we use the likelihood ratio directly
    const likelihood = 1 / (1 + Math.exp(-k * d));
    prob_a = (prob_a * likelihood) / (prob_a * likelihood + (1 - prob_a) * (1 - likelihood));
  }
  
  return prob_a;
}

function getContributingFactorsBayes(
  features: Record<string, number>,
  input: PredictionInput
): ContributingFactor[] {
  const factors: ContributingFactor[] = [];
  const diffs = [
    features.diffs_0, features.diffs_1, features.diffs_2,
    features.diffs_3, features.diffs_4, features.diffs_5,
  ];
  
  // Identify the most significant Bayesian updates
  const gameContributions = diffs.map((d, i) => ({
    index: i + 1,
    diff: d,
    impact: Math.abs(0.5 - (1 / (1 + Math.exp(-0.04 * d))))
  }));
  
  gameContributions.sort((a, b) => b.impact - a.impact);
  
  // Add top game-based evidence
  gameContributions.slice(0, 2).forEach(gc => {
    if (gc.impact > 0.05) {
      const winner = gc.diff > 0 ? input.team_a : input.team_b;
      factors.push({
        factor: `Game ${gc.index} Differential Evidence`,
        description: `${winner}'s ${Math.abs(gc.diff)}pt Game ${gc.index} victory provides significant Bayesian evidence for a Game 7 win.`,
        impact: gc.impact,
      });
    }
  });

  if (features.home_advantage !== 0) {
    const home_team = features.home_advantage > 0 ? input.team_a : input.team_b;
    factors.push({
      factor: 'Home Court Prior',
      description: `Historical data gives ${home_team} a 62% prior probability as the home team.`,
      impact: 0.12, // 0.62 - 0.50
    });
  }
  
  if (Math.abs(features.cumulative_margin) > 0) {
    const leader = features.cumulative_margin > 0 ? input.team_a : input.team_b;
    factors.push({
      factor: 'Series Aggregate Evidence',
      description: `The total ${Math.abs(features.cumulative_margin)}pt differential across 6 games shifts the Bayesian posterior towards ${leader}.`,
      impact: Math.min(Math.abs(features.cumulative_margin) * 0.005, 0.2),
    });
  }
  
  factors.sort((a, b) => b.impact - a.impact);
  return factors.slice(0, 3);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const startTime = performance.now();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const input: PredictionInput = await req.json();
    
    if (!input.team_a || !input.team_b) {
      return new Response(
        JSON.stringify({ error: 'Team names are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const method = input.method || 'logistic_regression';
    const features = calculateFeatures(input);
    
    let probability_a: number;
    let contributing_factors: ContributingFactor[];
    
    if (method === 'bayes') {
      probability_a = predictBayes(features, input);
      contributing_factors = getContributingFactorsBayes(features, input);
    } else if (method === 'elo') {
      probability_a = predictElo(input);
      contributing_factors = getContributingFactors(features, input);
    } else if (method === 'exponential_smoothing') {
      probability_a = predictExponentialSmoothing(input);
      contributing_factors = getContributingFactors(features, input);
    } else {
      // Logistic regression
      probability_a = predict(features);
      contributing_factors = getContributingFactors(features, input);
    }
    
    const probability_b = 1 - probability_a;
    
    const predicted_winner = probability_a > 0.5 ? input.team_a : input.team_b;
    const max_prob = Math.max(probability_a, probability_b);
    
    let confidence_level = 'Low';
    if (max_prob > 0.7) {
      confidence_level = 'High';
    } else if (max_prob > 0.6) {
      confidence_level = 'Medium';
    }
    
    const endTime = performance.now();
    const computation_time_ms = endTime - startTime;
    
    // Fetch team logos
    const { data: logoData } = await supabase
      .from('teams')
      .select('full_name, logo_url')
      .in('full_name', [input.team_a, input.team_b]);
    
    const logoMap = new Map((logoData || []).map((team) => [team.full_name, team.logo_url]));
    const team_a_logo = logoMap.get(input.team_a);
    const team_b_logo = logoMap.get(input.team_b);
    
    const result = {
      predicted_winner,
      team_a: input.team_a,
      team_b: input.team_b,
      team_a_logo,
      team_b_logo,
      win_probability_a: Math.round(probability_a * 100 * 100) / 100,
      win_probability_b: Math.round(probability_b * 100 * 100) / 100,
      confidence_level,
      contributing_factors,
      computation_time_ms: Math.round(computation_time_ms),
      method_used: method,
    };
    
    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
