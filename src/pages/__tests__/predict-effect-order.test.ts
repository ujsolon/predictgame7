import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Story 6.0: the Predict page's effects run in declaration order, and that
// order (selection reset → notice retire → URL arrival → field-error clear) is
// what the two sequence guards rely on. `usePredictController.ts` declares all
// four, in that order; the hooks it composes must declare none, or their
// effects would run at their call site, ahead of the reset.
const DIR = fileURLToPath(new URL('../predict/', import.meta.url));
const EFFECT_FREE = ['useSeriesArrival.ts', 'usePrediction.ts', 'useSeriesCatalog.ts'];

describe('Predict effect order (Story 6.0)', () => {
  for (const file of EFFECT_FREE) {
    it(`${file} declares no effects`, () => {
      const source = readFileSync(join(DIR, file), 'utf8');
      expect(
        /\buse(Layout)?Effect\b/.test(source),
        `${file} must not call useEffect/useLayoutEffect: every Predict effect is declared in usePredictController.ts, in the order its docstring fixes (reset before arrival). Expose the effect body as a function and register it there.`,
      ).toBe(false);
    });
  }

  it('the controller declares its four effects in the fixed order', () => {
    const source = readFileSync(join(DIR, 'usePredictController.ts'), 'utf8');
    const bodies = [...source.matchAll(/useEffect\(\(\) => \{([\s\S]*?)\}, \[([^\]]*)\]\);/g)];
    expect(bodies.map((m) => m[2])).toEqual([
      'selectedSeries, selectedMethod, customInput',
      'selectedSeries',
      'searchParams',
      'selectedSeries, selectedMethod',
    ]);
    expect(bodies[0][1]).toContain('seriesLoadSeq.current++');
    expect(bodies[0][1]).toContain('predictSeq.current++');
    expect(bodies[2][1]).toContain('arrival.arrive()');
  });
});
