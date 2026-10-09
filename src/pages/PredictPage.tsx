import { useState } from 'react';
import DetailedResult from './predict/DetailedResult';
import MethodCard from './predict/MethodCard';
import PredictCard from './predict/PredictCard';
import SeriesCard from './predict/SeriesCard';
import { usePredictController } from './predict/usePredictController';

// Story 6.0: the page is a composition. State, effects and the two sequence
// guards live in `usePredictController` (and the hooks it composes); the cards
// live beside it in `./predict/`. The page owns the layout and the switch
// between the cards and the detailed result.
export default function PredictPage() {
  const [showDetails, setShowDetails] = useState(false);
  const {
    selectedSeries,
    setSelectedSeries,
    selectedMethod,
    setSelectedMethod,
    customInput,
    setCustomInput,
    setCustomScore,
    catalog,
    loading,
    result,
    predictFailure,
    customFieldErrors,
    handlePredict,
    seriesLoadFailed,
    seriesNotFound,
    retryPreload,
    startOver,
  } = usePredictController(() => setShowDetails(false));

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
            <SeriesCard
              selectedSeries={selectedSeries}
              setSelectedSeries={setSelectedSeries}
              customInput={customInput}
              setCustomInput={setCustomInput}
              setCustomScore={setCustomScore}
              customFieldErrors={customFieldErrors}
              seriesNotFound={seriesNotFound}
              catalog={catalog}
            />
            <MethodCard selectedMethod={selectedMethod} setSelectedMethod={setSelectedMethod} />
          </div>

          <PredictCard
            selectedSeries={selectedSeries}
            selectedMethod={selectedMethod}
            customInput={customInput}
            rowFor={catalog.rowFor}
            loading={loading}
            result={result}
            predictFailure={predictFailure}
            seriesLoadFailed={seriesLoadFailed}
            handlePredict={handlePredict}
            retryPreload={retryPreload}
            onShowDetails={() => setShowDetails(true)}
          />
        </div>
      ) : result ? (
        <DetailedResult
          result={result}
          selectedSeries={selectedSeries}
          customInput={customInput}
          rowFor={catalog.rowFor}
          onBack={() => setShowDetails(false)}
          onNewPrediction={() => {
            startOver();
            setShowDetails(false);
          }}
        />
      ) : null}
    </div>
  );
}
