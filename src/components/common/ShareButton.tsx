import { Share2 } from 'lucide-react';
import { type MouseEvent, useRef } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { EVENTS, track } from '@/lib/analytics';
import { absoluteShareUrl, shareLink } from '@/lib/share';
import { cn } from '@/lib/utils';

export const SHARE_COPIED = 'Link copied.';
export const SHARE_COPY_FAILED = "Couldn't copy — long-press the address bar to share.";

interface ShareButtonProps {
  /** The share path under the app base (`src/lib/share.ts` builders), query included. */
  path: string;
  /** The native share sheet's title. */
  title: string;
  /** `prediction_shared` props: where the button sits and what it shares. */
  surface: 'predict' | 'series';
  kind: 'series' | 'custom';
  /** `icon`: ghost, icon-only (series header). `labelled`: outline "Share" (Predict detailed view). */
  appearance: 'icon' | 'labelled';
  /** The icon-only button's accessible name. */
  label?: string;
  className?: string;
}

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

/**
 * The one Share affordance (EXPERIENCE.md · Share button, Story 4.4): one tap,
 * no menu — the native sheet where `navigator.share` exists (no toast; a
 * cancel does nothing), otherwise the clipboard and "Link copied." for 2s,
 * and the address-bar advice if the copy fails.
 *
 * SSR-safe: render reads no browser global — `window` and `navigator` are
 * touched in the click handler only — so the prerendered series pages render
 * and hydrate with it in place. Hit area 44×44 in both appearances.
 */
export default function ShareButton({ path, title, surface, kind, appearance, label = 'Share this series', className }: ShareButtonProps) {
  // One share at a time: a second tap while the sheet or the copy is pending
  // would make `navigator.share` reject (InvalidStateError), fall back to the
  // clipboard, and toast and emit twice.
  const busy = useRef(false);
  const onClick = async (event: MouseEvent<HTMLButtonElement>) => {
    // Never also a click on whatever card or row the button sits in.
    event.stopPropagation();
    if (busy.current) return;
    busy.current = true;
    try {
      const outcome = await shareLink(absoluteShareUrl(path), title);
      if (outcome === 'copied') toast.success(SHARE_COPIED, { duration: 2000 });
      else if (outcome === 'failed') toast.error(SHARE_COPY_FAILED);
      if (outcome === 'native' || outcome === 'copied') {
        try {
          track(EVENTS.PREDICTION_SHARED, { surface, kind, channel: outcome === 'native' ? 'native' : 'clipboard' });
        } catch (err) {
          // The share already happened; analytics must not turn it into a failure.
          console.error('prediction_shared emit failed:', err);
        }
      }
    } finally {
      busy.current = false;
    }
  };

  if (appearance === 'icon') {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={label}
        className={cn('h-11 w-11 shrink-0 text-foreground', FOCUS, className)}
        onClick={onClick}
        data-share-button=""
      >
        <Share2 aria-hidden="true" />
      </Button>
    );
  }
  return (
    <Button
      type="button"
      variant="outline"
      className={cn('h-11 min-w-11 shrink-0 px-4 text-foreground', FOCUS, className)}
      onClick={onClick}
      data-share-button=""
    >
      <Share2 aria-hidden="true" />
      Share
    </Button>
  );
}
