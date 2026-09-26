// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ErrorRetryPanel from '@/components/common/ErrorRetryPanel';

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

describe('ErrorRetryPanel', () => {
  it('announces as a status region with the heading and the classifier message', () => {
    render(
      <ErrorRetryPanel
        heading="Couldn't generate the prediction."
        message="Couldn't reach the prediction service. It may be briefly unavailable."
        onRetry={() => {}}
      />
    );

    const panel = screen.getByRole('status');
    expect(panel).toHaveTextContent("Couldn't generate the prediction.");
    expect(panel).toHaveTextContent("Couldn't reach the prediction service.");
  });

  it('moves focus to the panel container on mount', () => {
    render(<ErrorRetryPanel message="The prediction service returned no result." onRetry={() => {}} />);

    const active = document.activeElement as HTMLElement | null;
    expect(active?.getAttribute('role')).toBe('status');
    expect(active?.tabIndex).toBe(-1);
  });

  it('makes Retry the first tab stop inside the panel', () => {
    render(<ErrorRetryPanel message="boom" onRetry={() => {}} />);

    const stops = screen.getByRole('status').querySelectorAll(FOCUSABLE);
    expect(stops).toHaveLength(1);
    expect(stops[0]).toBe(screen.getByRole('button', { name: 'Retry' }));
  });

  it('re-fires the attempt through onRetry without bubbling to outer click handlers', () => {
    const onRetry = vi.fn();
    render(
      <div onClick={() => onRetry()}>
        <ErrorRetryPanel message="boom" onRetry={onRetry} />
      </div>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    // stopPropagation keeps a card-level click from double-firing the attempt;
    // one call comes from the button itself.
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('hides the warning tile icon from assistive tech', () => {
    render(<ErrorRetryPanel message="boom" onRetry={() => {}} />);
    const svg = screen.getByRole('status').querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });
});
