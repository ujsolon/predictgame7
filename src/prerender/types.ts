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
  record: number;
  preview: number;
  result: number;
  shells: number;
  sitemapUrls: number;
}

export interface PrerenderOutput {
  files: PrerenderFile[];
  /** `dist/`-relative OG cards the pages reference; each must exist before anything is written. */
  cards: string[];
  errors: string[];
  summary: PrerenderSummary;
}
