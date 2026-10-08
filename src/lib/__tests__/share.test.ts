import { describe, expect, it, vi } from 'vitest';

import {
  absoluteShareUrl,
  customPredictionSharePath,
  seriesPageSharePath,
  seriesPredictionSharePath,
  shareLink,
} from '@/lib/share';
import { decodeSharePayload } from '@/lib/share-payload';
import type { SharePayload } from '@/types/prediction';

const ID = '06715a85-ec33-46a4-8383-d058055eefe6';
const ORIGIN = 'https://ujsolon.github.io';
const BASE = '/predictgame7/';

const payload: SharePayload = {
  v: 1,
  team_a: 'Montréal',
  team_b: 'Miami Heat',
  scores: [101, 91, 92, 102, 103, 93, 94, 104, 105, 95, 96, 106],
  method: 'bayes',
};

describe('share URLs (AD-6, Story 4.4)', () => {
  it('series prediction: the trailing-slash series page with the method and utm_source', () => {
    expect(absoluteShareUrl(seriesPredictionSharePath(ID, 'elo'), ORIGIN, BASE)).toBe(
      `${ORIGIN}/predictgame7/series/${ID}/?method=elo&utm_source=share`
    );
  });

  it('custom prediction: /predict/ with the decodable payload and utm_source', () => {
    const url = new URL(absoluteShareUrl(customPredictionSharePath(payload), ORIGIN, BASE));
    expect(`${url.origin}${url.pathname}`).toBe(`${ORIGIN}/predictgame7/predict/`);
    expect([...url.searchParams.keys()]).toEqual(['custom', 'utm_source']);
    expect(url.searchParams.get('utm_source')).toBe('share');
    expect(decodeSharePayload(url.searchParams.get('custom'))).toEqual(payload);
  });

  it('series page header: the canonical page or result URL plus utm_source (matrix: series header share)', () => {
    expect(absoluteShareUrl(seriesPageSharePath(ID, 'page'), ORIGIN, BASE)).toBe(
      `${ORIGIN}/predictgame7/series/${ID}/?utm_source=share`
    );
    expect(absoluteShareUrl(seriesPageSharePath(ID, 'result'), ORIGIN, BASE)).toBe(
      `${ORIGIN}/predictgame7/series/${ID}/result/?utm_source=share`
    );
  });

  it('tolerates a base without its trailing slash and a path with a leading one', () => {
    expect(absoluteShareUrl('/predict/?utm_source=share', 'http://localhost:4317', '/predictgame7')).toBe(
      'http://localhost:4317/predictgame7/predict/?utm_source=share'
    );
    expect(absoluteShareUrl('predict/', 'http://localhost:5173', '/')).toBe('http://localhost:5173/predict/');
  });
});

function abortError() {
  const err = new Error('Share canceled');
  err.name = 'AbortError';
  return err;
}

describe('shareLink (EXPERIENCE.md · Share button)', () => {
  const url = `${ORIGIN}/predictgame7/series/${ID}/?utm_source=share`;

  it('uses the native sheet where it exists, with the url and title, and never touches the clipboard', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();
    const outcome = await shareLink(url, 'Title', { share, clipboard: { writeText } as never });
    expect(outcome).toBe('native');
    expect(share).toHaveBeenCalledWith({ url, title: 'Title' });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('a user cancel (AbortError) is cancelled — no clipboard fallback', async () => {
    const share = vi.fn().mockRejectedValue(abortError());
    const writeText = vi.fn();
    expect(await shareLink(url, 'Title', { share, clipboard: { writeText } as never })).toBe('cancelled');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('a native sheet that fails for another reason falls back to the clipboard', async () => {
    const share = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
    const writeText = vi.fn().mockResolvedValue(undefined);
    expect(await shareLink(url, 'Title', { share, clipboard: { writeText } as never })).toBe('copied');
    expect(writeText).toHaveBeenCalledWith(url);
  });

  it('without navigator.share, copies the url (matrix: desktop)', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    expect(await shareLink(url, 'Title', { clipboard: { writeText } as never })).toBe('copied');
    expect(writeText).toHaveBeenCalledWith(url);
  });

  it('a rejected copy is failed, never a throw (matrix: clipboard blocked)', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    await expect(shareLink(url, 'Title', { clipboard: { writeText } as never })).resolves.toBe('failed');
  });

  it('a synchronously throwing copy, or no clipboard at all, is failed too', async () => {
    const writeText = vi.fn(() => {
      throw new Error('boom');
    });
    expect(await shareLink(url, 'Title', { clipboard: { writeText } as never })).toBe('failed');
    expect(await shareLink(url, 'Title', { clipboard: undefined as never })).toBe('failed');
  });
});
