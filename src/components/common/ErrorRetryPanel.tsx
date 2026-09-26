import { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorRetryPanelProps {
  /** One line naming what failed — the classifier's message, never raw JSON. */
  message: string;
  /** Re-fires the same attempt; preserving selections is the page's job. */
  onRetry: () => void;
  heading?: string;
}

/**
 * In-place retry panel (EXPERIENCE.md · Component Patterns + Accessibility
 * Floor, DESIGN.md · Components · Retry panel): `muted` fill, `rounded-lg`,
 * hairline border, no shadow. Announced on appearance via `role="status"`,
 * focus lands on the container on mount, and Retry is the first tab stop
 * inside it. The warning-tile icon is `aria-hidden` decoration — the
 * heading carries the meaning.
 */
export default function ErrorRetryPanel({
  message,
  onRetry,
  heading = "Couldn't complete this.",
}: ErrorRetryPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Never silently to <body>: the swap is announced from the focused container.
    containerRef.current?.focus();
  }, []);

  return (
    <div
      ref={containerRef}
      role="status"
      tabIndex={-1}
      className="w-full max-w-md space-y-2 rounded-lg border border-border bg-muted p-6 text-left focus:outline-none"
    >
      <div
        className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-warning"
        aria-hidden="true"
      >
        <AlertTriangle className="h-5 w-5" />
      </div>
      <h3 className="text-base font-medium text-foreground">{heading}</h3>
      <p className="text-sm text-on-muted">{message}</p>
      <Button
        type="button"
        // ≥44px hit area (NFR-U1); first — and only — tab stop inside the panel.
        className="mt-2 h-11 px-6"
        // The panel can sit inside the clickable Predict card; Retry must
        // fire the attempt once, not via the card's own click handler too.
        onClick={(event) => {
          event.stopPropagation();
          onRetry();
        }}
      >
        Retry
      </Button>
    </div>
  );
}
