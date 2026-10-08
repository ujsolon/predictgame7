// @vitest-environment jsdom
// Story 4.8: a static shell arrives as `/predict/` (GitHub Pages 301s a
// directory URL), so the nav's active item ignores the trailing slash.
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import Layout from '@/components/layouts/Layouts';

function activeLinks(entry: string): string[] {
  const { container } = render(
    <MemoryRouter initialEntries={[entry]}>
      <Layout>
        <span>page</span>
      </Layout>
    </MemoryRouter>
  );
  return Array.from(container.querySelectorAll('nav a'))
    .filter((a) => a.classList.contains('bg-accent'))
    .map((a) => a.getAttribute('href') ?? '');
}

describe('Layout nav: the active item', () => {
  it('/predict/ marks only Predict', () => {
    expect(activeLinks('/predict/')).toEqual(['/predict']);
  });

  it('/predict marks only Predict', () => {
    expect(activeLinks('/predict')).toEqual(['/predict']);
  });

  it('/ marks only Home', () => {
    expect(activeLinks('/')).toEqual(['/']);
  });
});
