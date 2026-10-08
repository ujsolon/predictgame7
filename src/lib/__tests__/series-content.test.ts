// Story 4.5 · the editorial content contract: `parseSeriesContent` over parts,
// videos and the markdown image/link rules, and the preview strip.
import { describe, expect, it } from 'vitest';

import { contentFlagship, contentRows, flagship2016, RESOLUTION_VIDEO_ID } from '@/pages/__tests__/series-fixtures';
import { stripOutcome } from '@/prerender/preload';
import {
  editorialImagePaths,
  editorialImageUrl,
  isEditorialImageSrc,
  markdownProblems,
  parseSeriesContent,
  withoutResolution,
} from '@/lib/series-content';

const ID = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

function row(part: string, fields: Record<string, unknown> = {}) {
  return { series_id: ID, part, headline: null, body_md: null, videos: [], updated_at: 'x', ...fields };
}

describe('parseSeriesContent', () => {
  it('reads both parts of a valid set', () => {
    const parsed = parseSeriesContent(contentRows(ID));
    expect(parsed.errors).toEqual([]);
    expect(parsed.before?.headline).toBe('Before-part headline: the Bay waits');
    expect(parsed.before?.videos).toEqual([{ youtube_id: 'BeforeVid01', title: 'Before-part video title', credit: 'Before Channel', credit_url: undefined }]);
    expect(parsed.resolution?.videos[0]).toMatchObject({ youtube_id: RESOLUTION_VIDEO_ID, credit_url: 'https://www.youtube.com/@resolution' });
  });

  it('no rows, null or undefined: no parts and no errors (a bare series)', () => {
    for (const rows of [[], null, undefined]) expect(parseSeriesContent(rows)).toEqual({ before: null, resolution: null, errors: [] });
  });

  it('a part with nothing in it is absent, not an empty section', () => {
    const parsed = parseSeriesContent([row('before', { headline: '  ', body_md: '\n' })]);
    expect(parsed).toEqual({ before: null, resolution: null, errors: [] });
  });

  it('a headline alone is a part (it overrides the hero headline)', () => {
    expect(parseSeriesContent([row('resolution', { headline: ' The block ' })]).resolution).toEqual({ headline: 'The block', body: null, videos: [] });
  });

  it('rejects a bad youtube_id, an empty title and a non-https credit_url, naming series and part', () => {
    const parsed = parseSeriesContent([
      row('before', {
        videos: [
          { youtube_id: 'short', title: 'A' },
          { youtube_id: 'abcdefghijk', title: '  ' },
          { youtube_id: 'abcdefghijk', title: 'B', credit: 'C', credit_url: 'http://example.com/' },
        ],
      }),
    ]);
    expect(parsed.before).toBeNull();
    expect(parsed.errors).toHaveLength(3);
    expect(parsed.errors[0]).toMatch(new RegExp(`^series ${ID} · before: videos\\[0\\]\\.youtube_id`));
    expect(parsed.errors[1]).toContain('videos[1].title');
    expect(parsed.errors[2]).toContain('videos[2].credit_url: credit_url must be an https URL');
  });

  it('an invalid part drops only that part', () => {
    const parsed = parseSeriesContent([row('before', { videos: 'nope' }), row('resolution', { body_md: 'Fine.' })]);
    expect(parsed.before).toBeNull();
    expect(parsed.resolution?.body).toBe('Fine.');
    expect(parsed.errors).toEqual([`series ${ID} · before: videos must be an array`]);
  });

  it('rejects an unknown part and a duplicated part', () => {
    const parsed = parseSeriesContent([row('after'), row('before', { body_md: 'a' }), row('before', { body_md: 'b' })]);
    expect(parsed.before).toBeNull();
    expect(parsed.errors.join('\n')).toContain('unknown part "after"');
    expect(parsed.errors.join('\n')).toContain('more than one before row');
  });

  it('uses the given series id when a row carries none', () => {
    expect(parseSeriesContent([{ part: 'x' }], 'abc').errors[0]).toMatch(/^series abc:/);
  });
});

describe('markdown rules', () => {
  it('accepts editorial images with alt text, with or without a caption, and http(s) links', () => {
    expect(
      markdownProblems('![Alt](editorial/a.jpg "Caption")\n\n![Alt](/editorial/sub/b-2.webp)\n\n[x](https://a.b/) <https://c.d/>')
    ).toEqual([]);
  });

  it('rejects an image without alt, off editorial/, on a third-party host, or escaping the folder', () => {
    expect(markdownProblems('![](editorial/a.jpg)')).toEqual(['image "editorial/a.jpg" has no alt text']);
    expect(markdownProblems('![A](images/a.jpg)')[0]).toContain('must be a site-relative path under editorial/');
    expect(markdownProblems('![A](https://i.imgur.com/a.jpg)')[0]).toContain('must be a site-relative path under editorial/');
    expect(markdownProblems('![A](editorial/../secret.jpg)')).toHaveLength(1);
    expect(markdownProblems('![A](//cdn.example.com/editorial/a.jpg)')).toHaveLength(1);
  });

  it('checks reference-style images through their definition', () => {
    expect(markdownProblems('![A][pic]\n\n[pic]: editorial/a.jpg')).toEqual([]);
    expect(markdownProblems('![A][pic]\n\n[pic]: https://evil.example/a.jpg')[0]).toContain('under editorial/');
  });

  it('a duplicated definition resolves to the FIRST one, as CommonMark renders it', () => {
    const invalidFirst = '![A][pic]\n\n[pic]: https://evil.example/a.jpg\n[pic]: editorial/a.jpg';
    expect(markdownProblems(invalidFirst)).toHaveLength(1);
    expect(markdownProblems(invalidFirst)[0]).toContain('image "https://evil.example/a.jpg" must be a site-relative path under editorial/');
    expect(markdownProblems('![A][pic]\n\n[pic]: editorial/a.jpg\n[pic]: https://evil.example/a.jpg')).toEqual([]);
    expect(editorialImagePaths('![A][pic]\n\n[pic]: editorial/a.jpg\n[pic]: editorial/b.jpg')).toEqual(['editorial/a.jpg']);
  });

  it('lists the editorial image paths a body renders, dist-relative', () => {
    expect(editorialImagePaths('![A](/editorial/x.jpg) ![B](editorial/y.png) ![C](editorial/x.jpg)')).toEqual(['editorial/x.jpg', 'editorial/y.png']);
    expect(editorialImagePaths('No images.')).toEqual([]);
  });

  it('rejects non-http(s) links', () => {
    expect(markdownProblems('[x](javascript:alert(1))')[0]).toContain('must be an http(s) URL');
    expect(markdownProblems('[x](/predict)')[0]).toContain('must be an http(s) URL');
    expect(markdownProblems('<me@example.com>')[0]).toContain('must be an http(s) URL');
  });

  it('raw HTML is not a validation error — it renders as text', () => {
    expect(markdownProblems('<script>alert(1)</script>')).toEqual([]);
  });

  it('serves editorial images under the app base', () => {
    expect(isEditorialImageSrc('editorial/a.jpg')).toBe(true);
    expect(editorialImageUrl('editorial/a.jpg', '/predictgame7/')).toBe('/predictgame7/editorial/a.jpg');
    expect(editorialImageUrl('/editorial/a.jpg', '/')).toBe('/editorial/a.jpg');
  });
});

describe('the preview strip carries the before part only', () => {
  it('stripOutcome drops the resolution row and keeps the before row', () => {
    expect(withoutResolution(contentRows(ID)).map((r) => r.part)).toEqual(['before']);
    const stripped = stripOutcome(contentFlagship);
    expect(stripped.series_content?.map((r) => r.part)).toEqual(['before']);
    expect(JSON.stringify(stripped)).not.toContain(RESOLUTION_VIDEO_ID);
  });

  it('a row with no content embed stays without one', () => {
    expect('series_content' in stripOutcome(flagship2016)).toBe(false);
  });
});
