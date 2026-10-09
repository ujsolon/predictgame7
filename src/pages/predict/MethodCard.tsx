import { useState } from 'react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Link } from 'react-router-dom';
import { EVENTS, track } from '@/lib/analytics';
import { METHOD_DESCRIPTIONS, METHOD_LABELS } from '@/lib/method-display';
import type { MethodSlug } from '@/types/prediction';
import { Check, ChevronRight, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';

interface MethodCardProps {
  selectedMethod: MethodSlug | null;
  setSelectedMethod: (method: MethodSlug) => void;
}

/** The Method card: its trigger and the method dialog. */
export default function MethodCard({ selectedMethod, setSelectedMethod }: MethodCardProps) {
  const [isMethodDialogOpen, setIsMethodDialogOpen] = useState(false);

  const getMethodLabel = () => {
    if (!selectedMethod) return 'Not selected';
    return METHOD_LABELS[selectedMethod];
  };

  return (
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
                      {METHOD_DESCRIPTIONS[selectedMethod]}
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
                toast.success(`${METHOD_LABELS.logistic_regression} selected`);
                track(EVENTS.PREDICTION_METHOD_SELECTED, { method: 'logistic_regression' });
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
                toast.success(`${METHOD_LABELS.bayes} selected`);
                track(EVENTS.PREDICTION_METHOD_SELECTED, { method: 'bayes' });
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
                toast.success(`${METHOD_LABELS.elo} selected`);
                track(EVENTS.PREDICTION_METHOD_SELECTED, { method: 'elo' });
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
                toast.success(`${METHOD_LABELS.exponential_smoothing} selected`);
                track(EVENTS.PREDICTION_METHOD_SELECTED, { method: 'exponential_smoothing' });
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
  );
}
