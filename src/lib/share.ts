/**
 * Share mechanics and share URLs (AD-6, Story 4.4).
 *
 * URLs: every share link is absolute, under the app's base path, in the
 * trailing-slash directory form (the canonical URL Story 4.8 prerenders), so
 * it never depends on GitHub Pages' 301 keeping the query. Each carries
 * `utm_source=share` for SM-3 attribution. The path builders are pure and
 * SSR-safe; only `absoluteShareUrl` and `shareLink` read browser globals, and
 * they are called from a click handler only.
 */
import { encodeSharePayload } from '@/lib/share-payload';
import type { MethodSlug, SharePayload } from '@/types/prediction';

export const SHARE_UTM = 'utm_source=share';

/** Predict with a stored series: lands on the series page, which redirects to Predict preloaded. */
export function seriesPredictionSharePath(seriesId: string, method: MethodSlug): string {
  return `series/${seriesId}/?method=${method}&${SHARE_UTM}`;
}

/** Predict with a custom matchup: the payload prefills the form (unfurls with the fallback card). */
export function customPredictionSharePath(payload: SharePayload): string {
  return `predict/?custom=${encodeSharePayload(payload)}&${SHARE_UTM}`;
}

/** A series page's own canonical URL (`/series/<id>/` or `/series/<id>/result/`). */
export function seriesPageSharePath(seriesId: string, variant: 'page' | 'result'): string {
  return `series/${seriesId}/${variant === 'result' ? 'result/' : ''}?${SHARE_UTM}`;
}

/** `origin` + the app base (`import.meta.env.BASE_URL`) + a share path. */
export function absoluteShareUrl(
  path: string,
  origin: string = window.location.origin,
  base: string = import.meta.env.BASE_URL
): string {
  const root = base.endsWith('/') ? base : `${base}/`;
  return `${origin}${root}${path.replace(/^\/+/, '')}`;
}

export type ShareOutcome = 'native' | 'copied' | 'cancelled' | 'failed';

type ShareNavigator = Pick<Navigator, 'clipboard'> & { share?: Navigator['share'] };

function isAbort(error: unknown): boolean {
  return !!error && typeof error === 'object' && (error as { name?: unknown }).name === 'AbortError';
}

/**
 * One share attempt, one code path (EXPERIENCE.md · Share button): the native
 * sheet where `navigator.share` exists, otherwise the clipboard. A user cancel
 * (`AbortError`) is `cancelled`; a native sheet that fails for any other
 * reason falls back to the clipboard, so a share never dead-ends. Never throws.
 */
export async function shareLink(url: string, title: string, nav: ShareNavigator = navigator): Promise<ShareOutcome> {
  if (typeof nav.share === 'function') {
    try {
      await nav.share({ url, title });
      return 'native';
    } catch (error) {
      if (isAbort(error)) return 'cancelled';
    }
  }
  try {
    if (!nav.clipboard || typeof nav.clipboard.writeText !== 'function') return 'failed';
    await nav.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}
