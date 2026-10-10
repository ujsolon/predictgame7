/**
 * The contract between Story 4.8's server entry (`entry-server.tsx`) and its
 * orchestration (`build.ts`). JSX-free on purpose: the Node runner's program
 * (`tsconfig.pipeline.json`) reaches it through `build.ts`, and no JSX may
 * enter that program.
 */

export interface PrerenderFile {
  /** Path relative to `dist/`. */
  path: string;
  content: string;
}

export interface PrerenderSummary {
  rows: number;
  /** Rows with `is_featured` (Story 4.5). */
  featured: number;
  record: number;
  preview: number;
  result: number;
  shells: number;
  /** Story 6.1: uuid, `/series/` and `/series/<year>/` redirect stubs (never in the sitemap). */
  stubs: number;
  sitemapUrls: number;
}

export interface PrerenderOutput {
  files: PrerenderFile[];
  /** `dist/`-relative OG cards the pages reference; each must exist before anything is written. */
  cards: string[];
  /** `dist/`-relative editorial images the pages reference (Story 4.5); each must exist before anything is written. */
  assets: string[];
  errors: string[];
  summary: PrerenderSummary;
}
