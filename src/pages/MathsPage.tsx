import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BookOpen, Calculator, Sigma, TrendingUp, History, Trophy } from 'lucide-react';

export default function MathsPage() {
  const methods = [
    {
      id: 'logistic-regression',
      title: 'Logistic Regression',
      icon: Calculator,
      description: 'Probability estimation based on historical outcomes and scoring differentials.',
      math: 'P(Win) = 1 / (1 + e^-(β₀ + β₁X₁ + β₂X₂ + ...))',
      details: 'Our regression model analyzes the relationship between Game 1-6 outcomes and the final Game 7 result. It considers variables such as cumulative point differential, home-court status, and series momentum (e.g., whether the winner of Game 6 historically carries that advantage).',
    },
    {
      id: 'bayesian-inference',
      title: 'Bayesian Inference',
      icon: Sigma,
      description: 'Updating historical priors with current series observations.',
      math: 'P(A|B) = [P(B|A) * P(A)] / P(B)',
      details: 'This method starts with a "prior" probability — the historical win rate of home teams in Game 7s (approx. 75%). As the current series unfolds, this probability is updated based on the "likelihood" of the observed Game 1-6 results, providing a posterior probability that balances history with current reality.',
    },
    {
      id: 'elo-rating',
      title: 'Elo Rating System',
      icon: Trophy,
      description: 'Dynamic relative skill assessment through point exchange.',
      math: 'R\' = R + K * (S - E)',
      details: 'Originally designed for chess, we adapt Elo to track team strength throughout a 7-game series. Teams "gain" points by winning and "lose" points by losing, with the magnitude of exchange determined by the score margin and the expected outcome. Game 7 probability is derived from the rating gap between the two teams.',
    },
    {
      id: 'exponential-smoothing',
      title: 'Exponential Smoothing',
      icon: TrendingUp,
      description: 'Weighted momentum analysis emphasizing recent performance.',
      math: 'Sₜ = α * yₜ + (1 - α) * Sₜ₋₁',
      details: 'Not all games are created equal. This model applies a higher weight (smoothing factor α) to the most recent games (Game 5 and 6) while decaying the influence of earlier games. This captures the "momentum" factor that often dictates the psychological state of teams heading into a decider.',
    },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-12 pb-20 animate-in fade-in duration-700">
      <div className="space-y-4">
        <div className="flex items-center gap-3 text-primary">
          <Sigma className="h-6 w-6" />
          <span className="text-sm font-semibold uppercase tracking-widest">Mathematical Reference</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-medium tracking-tight font-montserrat">Methodology</h1>
        <p className="text-muted-foreground text-lg md:text-xl max-w-2xl leading-relaxed text-pretty font-light">
          Predicting a Game 7 isn't just about heart — it's about statistics. We utilize four distinct mathematical models to calculate win probabilities.
        </p>
      </div>

      <div className="grid gap-8">
        {methods.map((method, index) => {
          const Icon = method.icon;
          return (
            <Card key={index} id={method.id} className="border-border/40 bg-card/50 backdrop-blur-sm overflow-hidden group hover:border-border/80 transition-all duration-500 scroll-mt-20">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform duration-500">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-xl md:text-2xl">{method.title}</CardTitle>
                    <CardDescription className="text-base">{method.description}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="py-6 px-4 md:px-8 bg-muted/30 rounded-2xl border border-border/20 flex items-center justify-center">
                  <code className="text-lg md:text-2xl font-mono text-primary/80 tracking-tight">
                    {method.math}
                  </code>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <BookOpen className="h-3 w-3" />
                    Conceptual Breakdown
                  </div>
                  <p className="text-muted-foreground leading-relaxed text-pretty font-light">
                    {method.details}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="pt-8 border-t border-border/40">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 bg-muted/20 p-8 rounded-[32px] border border-border/20">
          <div className="space-y-2 text-center md:text-left">
            <h3 className="text-xl font-medium">Ready to test the models?</h3>
            <p className="text-muted-foreground font-light">Apply these mathematical principles to real matchups.</p>
          </div>
          <Link 
            to="/predict" 
            className="inline-flex h-12 items-center justify-center rounded-full bg-primary px-8 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            Start Predicting
          </Link>
        </div>
      </div>
    </div>
  );
}
