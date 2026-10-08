/**
 * The series editorial content contract (Story 4.5, FR-13 pilot, migration
 * `00019`): what a `series_content` row may carry, and the one pure validator
 * every reader goes through.
 *
 * - A series has at most one `before` part and one `resolution` part.
 * - A part carries an optional `headline`, an optional markdown `body_md` and
 *   a `videos` array of `{ youtube_id, title, credit?, credit_url? }`.
 * - Markdown images need non-empty alt text and a site-relative `src` under
 *   `editorial/` (files committed to `public/editorial/`, never a third-party
 *   host). Links and link definitions are `http(s)` only.
 *
 * `parseSeriesContent` never throws: an invalid part comes back `null` with
 * every reason listed in `errors`, named by series id. The prerender fails the
 * build on any error; the client renders without the invalid part and reports
 * it (`useSeriesContent`).
 *
 * Pure and platform-free: no React, no `window`, no Node APIs.
 */
import { fromMarkdown } from 'mdast-util-from-markdown';
import { z } from 'zod';
import type { SeriesContentPart } from '@/types/types';

export type { SeriesContentPart };

export const SERIES_CONTENT_PARTS: readonly SeriesContentPart[] = ['before', 'resolution'];

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** `editorial/<path>` (a leading `/` tolerated), no `..`, no `//`, no scheme, no query. */
const EDITORIAL_SRC = /^\/?editorial\/(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9][A-Za-z0-9._/-]*$/;

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export function isEditorialImageSrc(src: string): boolean {
  return EDITORIAL_SRC.test(src);
}

/** An editorial image `src` → its served path under the app base (`/predictgame7/editorial/…`). */
export function editorialImageUrl(src: string, base: string): string {
  return `${base.replace(/\/+$/, '')}/${src.replace(/^\/+/, '')}`;
}

const blankToUndefined = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

export const seriesVideoSchema = z.object({
  youtube_id: z.string().regex(YOUTUBE_ID, 'youtube_id must be 11 characters of A–Z, a–z, 0–9, _ or -'),
  title: z.string().trim().min(1, 'title must be a non-empty string'),
  credit: z.string().nullish().transform(blankToUndefined),
  credit_url: z
    .string()
    .nullish()
    .transform(blankToUndefined)
    .refine((value) => value === undefined || isHttpsUrl(value), 'credit_url must be an https URL'),
});

export type SeriesVideo = z.output<typeof seriesVideoSchema>;

/** A validated part, ready to render. Never empty: a part with nothing in it is absent (`null`). */
export interface SeriesContentPartView {
  headline: string | null;
  body: string | null;
  videos: SeriesVideo[];
}

export interface ParsedSeriesContent {
  before: SeriesContentPartView | null;
  resolution: SeriesContentPartView | null;
  /** Every invalid item, each naming its series id and part. Empty when everything is valid. */
  errors: string[];
}

interface MdNode {
  type: string;
  url?: string;
  alt?: string | null;
  identifier?: string;
  children?: MdNode[];
}

/** The markdown rules over the parsed tree (CommonMark — the same parser `react-markdown` uses). */
export function markdownProblems(body: string): string[] {
  const problems: string[] = [];
  let tree: MdNode;
  try {
    tree = fromMarkdown(body) as unknown as MdNode;
  } catch (error) {
    return [`body_md does not parse: ${error instanceof Error ? error.message : String(error)}`];
  }

  const nodes: MdNode[] = [];
  const walk = (node: MdNode) => {
    nodes.push(node);
    for (const child of node.children ?? []) walk(child);
  };
  walk(tree);

  // CommonMark resolves a reference to the FIRST definition of its label; later duplicates are ignored.
  const definitions = new Map<string, string>();
  for (const node of nodes) {
    if (node.type === 'definition' && node.identifier && !definitions.has(node.identifier)) definitions.set(node.identifier, node.url ?? '');
  }

  for (const node of nodes) {
    if (node.type === 'image' || node.type === 'imageReference') {
      const src = node.type === 'image' ? (node.url ?? '') : definitions.get(node.identifier ?? '');
      const where = `image "${src ?? `[${node.identifier}]`}"`;
      if (!node.alt?.trim()) problems.push(`${where} has no alt text`);
      if (src === undefined) problems.push(`${where} references an undefined image`);
      else if (!isEditorialImageSrc(src)) problems.push(`${where} must be a site-relative path under editorial/`);
    } else if (node.type === 'link' && !isHttpUrl(node.url ?? '')) {
      problems.push(`link "${node.url}" must be an http(s) URL`);
    }
  }
  // A definition only an image uses must be an editorial path; any other must be a link target.
  const imageIds = new Set(nodes.filter((n) => n.type === 'imageReference').map((n) => n.identifier));
  for (const node of nodes) {
    if (node.type !== 'definition' || imageIds.has(node.identifier)) continue;
    if (!isHttpUrl(node.url ?? '')) problems.push(`link definition "${node.url}" must be an http(s) URL`);
  }
  return problems;
}

/**
 * Every image `src` a (valid) body renders, as a `dist/`-relative path
 * (`editorial/…`, leading slash dropped). The prerender requires each to exist
 * in `dist/`, so a file missing from `public/editorial/` fails the build.
 */
export function editorialImagePaths(body: string): string[] {
  let tree: MdNode;
  try {
    tree = fromMarkdown(body) as unknown as MdNode;
  } catch {
    return [];
  }
  const nodes: MdNode[] = [];
  const walk = (node: MdNode) => {
    nodes.push(node);
    for (const child of node.children ?? []) walk(child);
  };
  walk(tree);
  const definitions = new Map<string, string>();
  for (const node of nodes) {
    if (node.type === 'definition' && node.identifier && !definitions.has(node.identifier)) definitions.set(node.identifier, node.url ?? '');
  }
  const paths = new Set<string>();
  for (const node of nodes) {
    const src = node.type === 'image' ? node.url : node.type === 'imageReference' ? definitions.get(node.identifier ?? '') : undefined;
    if (src && isEditorialImageSrc(src)) paths.add(src.replace(/^\/+/, ''));
  }
  return [...paths];
}

function zodProblems(error: z.ZodError, prefix: string): string[] {
  return error.issues.map((issue) => `${prefix}${issue.path.length ? `.${issue.path.join('.')}` : ''}: ${issue.message}`);
}

function parsePart(row: Record<string, unknown>): { part: SeriesContentPartView | null; problems: string[] } {
  const problems: string[] = [];

  const headline = row.headline;
  if (headline != null && typeof headline !== 'string') problems.push('headline must be text or null');
  const body = row.body_md;
  if (body != null && typeof body !== 'string') problems.push('body_md must be text or null');

  const videos: SeriesVideo[] = [];
  const rawVideos = row.videos ?? [];
  if (!Array.isArray(rawVideos)) {
    problems.push('videos must be an array');
  } else {
    rawVideos.forEach((item, index) => {
      const parsed = seriesVideoSchema.safeParse(item);
      if (parsed.success) videos.push(parsed.data);
      else problems.push(...zodProblems(parsed.error, `videos[${index}]`));
    });
  }

  const bodyText = typeof body === 'string' && body.trim() ? body : null;
  if (bodyText) problems.push(...markdownProblems(bodyText).map((p) => `body_md: ${p}`));

  if (problems.length > 0) return { part: null, problems };
  const headlineText = typeof headline === 'string' && headline.trim() ? headline.trim() : null;
  if (!headlineText && !bodyText && videos.length === 0) return { part: null, problems };
  return { part: { headline: headlineText, body: bodyText, videos }, problems };
}

/**
 * Validates a series' `series_content` rows (as read, untrusted). `seriesId`
 * names the series in errors when a row lacks its own `series_id`.
 */
export function parseSeriesContent(rows: unknown, seriesId?: string): ParsedSeriesContent {
  const result: ParsedSeriesContent = { before: null, resolution: null, errors: [] };
  if (rows == null) return result;
  if (!Array.isArray(rows)) {
    result.errors.push(`series ${seriesId ?? '?'}: series_content must be an array of rows`);
    return result;
  }

  const seen = new Set<string>();
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') {
      result.errors.push(`series ${seriesId ?? '?'}: a series_content row is not an object`);
      continue;
    }
    const row = raw as Record<string, unknown>;
    const id = typeof row.series_id === 'string' ? row.series_id : (seriesId ?? '?');
    const part = row.part;
    if (part !== 'before' && part !== 'resolution') {
      result.errors.push(`series ${id}: unknown part ${JSON.stringify(part)} (expected "before" or "resolution")`);
      continue;
    }
    if (seen.has(part)) {
      result.errors.push(`series ${id} · ${part}: more than one ${part} row`);
      result[part] = null;
      continue;
    }
    seen.add(part);
    const { part: view, problems } = parsePart(row);
    for (const problem of problems) result.errors.push(`series ${id} · ${part}: ${problem}`);
    result[part] = view;
  }
  return result;
}

/** The row a spoiler-free preview may carry: the `before` part only. */
export function withoutResolution<T extends { part: string }>(rows: readonly T[]): T[] {
  return rows.filter((row) => row.part !== 'resolution');
}

/** A YouTube video's static thumbnail (the facade image). */
export function youtubeThumbnail(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

/** The privacy-enhanced embed, autoplaying because it is only ever mounted by the play tap. */
export function youtubeEmbedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1`;
}

export function youtubeWatchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}
