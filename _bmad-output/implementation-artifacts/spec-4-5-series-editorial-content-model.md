---
title: 'Story 4.5 — Series editorial content model (FR-13 pilot) + Home pending-Game-7 highlight'
type: 'feature'
created: '2026-10-08'
status: 'done'
baseline_commit: '8b9a44d207512cbf0ed9cda7c98202bacd85a24d'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-predictgame7-2026-09-25/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-predictgame7-2026-09-25/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Series pages can only show bare facts. There is nowhere to store the flagship pilot's write-ups and videos (FR-13, owner decision 2026-09-25, which lifts the gate for the five-series pilot only). Flagship-ness is a hard-coded id list. Home's pending Game 7s are plain text links straight into Predict, with no treatment and no empty state.

**Approach:** Implement `epics.md` Story 4.5:
- **Schema (migration `00019`):** a `series_content` table (one optional "before" part and one optional "resolution" part per series) plus a `series.is_featured` flag seeded for the five pinned ids. It replaces `src/lib/flagship-series.ts`.
- **Rendering:** the content renders on the series pages, prerendered by 4.8's pipeline, with spoiler discipline kept: no resolution content anywhere in a preview's source.
- **Home:** the pending-Game-7 list becomes the highlight card from the 2026-09-29 decision.

## Boundaries & Constraints

**Always:**
- **Migration `00019`** (`NNNNN_snake_case`, written here, **applied by the owner with `npx supabase db push`**, and applied before the deploy that reads it; the prerender read fails loud until then):
  - `series.is_featured boolean NOT NULL DEFAULT false`, set true for the five ids now in `FLAGSHIP_SERIES_IDS`;
  - `series_content`:
    - `series_id uuid` FK → `series(id)` `ON DELETE CASCADE`;
    - `part text CHECK (part IN ('before','resolution'))`, with PK `(series_id, part)`;
    - `headline text NULL`, `body_md text NULL`;
    - `videos jsonb NOT NULL DEFAULT '[]'` with `CHECK (jsonb_typeof(videos)='array')`;
    - `updated_at timestamptz NOT NULL DEFAULT now()`.
  - RLS on, with the `00011` idempotent anon/authenticated `SELECT USING (true)` pattern. No insert, update or delete policy: writes are service-role owner SQL or scripts only (AD-8).
  - `docs/CURRENT_DATA_MODEL.md` documents both, in the same commit.
- **Video item shape** (validated in the app with zod): `{ youtube_id: /^[A-Za-z0-9_-]{11}$/, title: string, credit?: string, credit_url?: https URL }`. Videos may sit on either part.
- **Markdown** uses `react-markdown` (new dependency) with **raw HTML disabled**.
  - Links are `http(s)` only, external ones with `rel="noopener noreferrer"`.
  - Images need non-empty alt text. Their `src` must be site-relative under `editorial/` (files committed to `public/editorial/`, no third-party image hosts). The markdown title becomes a `label`-style caption. The image is full column width, `rounded-xl`.
  - It renders inside the 65ch longform column and is SSR-safe.
- **Content validity.** One pure `parseSeriesContent(rows)` covers parts, videos and image rules.
  - The prerender **fails the build** listing every invalid item by series id.
  - The client renders the page without the invalid part and reports it through `captureError`, never throwing.
- **Placement** (DESIGN.md · Flagship series page):
  - **Preview:** hero → strip → **before** write-up and before videos → method links → CTA → reveal.
  - **Result:** hero → strip → **resolution** write-up → **resolution** videos → CTA.
  - **Non-flagship record page:** whatever exists, before then resolution.
  - **Headlines:** the editorial `headline` overrides the default hero headline (the preview uses `before.headline`; the result and record use `resolution.headline`). The document `<title>`/meta stay data-built.
  - A missing section leaves no heading, placeholder or gap. A series with no content renders exactly as today.
- **Spoiler discipline.** A preview's preload and prerendered HTML carry the **before** part only. `stripOutcome` (or its sibling) drops the resolution part, and a test asserts that no resolution string or video id appears anywhere in a preview file.
- **Flagship-ness = `series.is_featured`** everywhere `isFlagship` decides today (`SeriesRoute`, `SeriesResultRoute` (now decided after the fetch), `SeriesPreview` reveal, `plan.ts`). `src/lib/flagship-series.ts` and its test are deleted.
  - The prerender's "pinned flagship absent / not archived" check becomes: a featured row that is archived gets the pair, and a featured pending row gets the preview only.
  - The build logs the featured count.
  - The probe's five-flagship row checks `is_featured` on the live table.
- **Data reads.** A new `SERIES_PAGE_SELECT` (`SERIES_SELECT` + `is_featured` + the `series_content` embed) is used by `useSeriesRecord` and the prerender read. `SERIES_SELECT` (Predict, Home, OG cards) gains only `is_featured`.
- **Video facade** (EXPERIENCE.md · Video embed):
  - **Prerendered markup:** a 16:9 `rounded-xl` frame with a `<img alt="" loading="lazy">` thumbnail from `https://i.ytimg.com/vi/<id>/hqdefault.jpg`, the visible video title, and a labelled play `<button>` (`Play: {title}`) as the only activation control, at least 44×44 px.
  - **Credit line:** "Highlights via {credit} ↗" in `#767676`, underlined, linking `credit_url` or else the YouTube watch URL. Omitted only when `credit` is absent.
  - **On activation:** an iframe `https://www.youtube-nocookie.com/embed/<id>?autoplay=1` with `title="{title} — via {credit}"` replaces the facade and takes focus.
  - Nothing autoplays without the tap, and `prefers-reduced-motion` is respected.
- **Home highlight.** `PendingGameSevens` becomes a div of cards, one per derived-pending series, with no new state and nothing read from `status`. Each card shows:
  - the eyebrow `GAME 7 · {YEAR} {ROUND}`;
  - a spoiler-neutral "{A} and {B} stand three games apiece", plus "Game 7 stands.";
  - a primary link to `/series/<id>` ("Read the series →");
  - a secondary deep link to `/predict?series=<id>` ("Model Game 7 →").

  With zero pending series it shows the EXPERIENCE.md empty state: "No active series right now — the next Game 7 is coming." plus a link "Every Game 7 has a history." → `/historical`. A failed read still logs and renders nothing (Story 2.7).
- **Layout:** AA, responsive, targets at least 44×44 px, visible focus, no new tokens.

**Never:**
- Author or load real content (Story 4.6).
- Add the archive-overlay link or Home featured cards (4.6).
- Add a similar-series slot.
- Host media or use Supabase Storage.
- Add a client write path.
- Read `series.status`.
- Add analytics events.
- Change the OG cards.
- Apply the migration from an agent session.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Bare series | no `series_content` rows | page identical to today (snapshot of the prerendered root unchanged) | N/A |
| Flagship preview with content | before (headline, md, 1 video) + resolution | preview shows the before headline, write-up, video facade; **file contains no resolution text or its video id** | N/A |
| Flagship result | same | resolution headline, write-up, resolution videos; before part absent | N/A |
| Non-flagship with content | both parts | record page renders before then resolution | N/A |
| Video activation | click play | iframe with title replaces facade, focused; no network to YouTube before the click except the thumbnail | N/A |
| Invalid content at build | bad youtube_id / image without alt / image `src` off `editorial/` | build fails listing series id + reason | non-zero, outputs removed |
| Invalid content in client | same row via fetch | page renders without that part; `captureError` once | no throw |
| Raw HTML in markdown | `<script>` / `<img onerror>` in `body_md` | rendered as text, never as elements | N/A |
| `is_featured` pending series | featured, games 1–6 | preview only, no reveal, `/result` 404 | N/A |
| Home, pending exists | 1 pending row | card with both links | N/A |
| Home, none pending | 0 rows | empty-state line + archive link | read error → nothing rendered, logged |

</frozen-after-approval>

## Code Map

- `supabase/migrations/00019_series_editorial_content.sql` (new). The RLS pattern is in `00011_enable_rls_on_public_release_tables.sql:34-48`.
- `docs/CURRENT_DATA_MODEL.md`: add a `series_content` `###` entry under "Active public schema tables" in the `teams` entry's format (`:7-16`), plus the `is_featured` column note under `series` (`:18-32`), marked "written, apply pending (owner `npx supabase db push`)".
- `src/types/types.ts`: `Series.is_featured?`, `series_content?: SeriesContentRow[]`; new content types.
- `src/lib/series-query.ts`: `SERIES_SELECT` + `is_featured`; new `SERIES_PAGE_SELECT`.
- New `src/lib/series-content.ts`: the zod schemas and `parseSeriesContent`, which is pure, returns `{ before, resolution, errors }`, and enforces the image `src`/alt rules over the markdown AST or with a pre-scan.
- New `src/components/series/EditorialBody.tsx` (react-markdown, no raw HTML) and `src/components/series/VideoEmbed.tsx` (facade → iframe, focus).
- `src/pages/series/SeriesPreview.tsx` (`:45` reveal from `is_featured`; the before section goes between the hero and methods), `SeriesFullRecord.tsx` (resolution between the hero and CTA), `SeriesHero.tsx` (headline override already a prop).
- `src/pages/SeriesRoute.tsx:74`, `SeriesResultRoute.tsx:23` (fetch first, then 404 unless featured and archived), `src/pages/series/useSeriesRecord.ts` (use `SERIES_PAGE_SELECT`).
- `src/prerender/preload.ts`: `stripOutcome` also removes the resolution content row. `plan.ts:15,53,120-124`: flagship from `is_featured`; drop the `flagshipIds` parameter and the pinned checks; content-validity errors join the plan errors.
- `scripts/prerender/run.ts`: fetch with `SERIES_PAGE_SELECT` (do not change `scripts/og/render.ts`'s read beyond what `SERIES_SELECT` gains).
- `src/pages/HomePage.tsx:37-112` (`PendingGameSevens`), with its test `src/pages/__tests__/home-pending.test.tsx`.
- Delete `src/lib/flagship-series.ts` and `src/lib/__tests__/flagship-series.test.ts`. Fixtures in `src/pages/__tests__/series-fixtures.ts` gain `is_featured` (true for the 2016 and 2026 fixtures).
- `scripts/probe-deep-links.mjs`: row 5 (five flagships) reads `is_featured`.
- `package.json`: add `react-markdown`.

## Tasks & Acceptance

**Execution:**
- [x] Migration `00019`, plus `CURRENT_DATA_MODEL.md` -- the schema, RLS and seed.
- [x] Types, selects, `series-content.ts` -- the contract and validation.
- [x] `EditorialBody`, `VideoEmbed`, the series pages, the routes, `is_featured` replacing `flagship-series.ts` -- rendering.
- [x] `preload.ts`, `plan.ts`, `run.ts` -- prerender carries content, preview stripped, invalid content fails the build.
- [x] `HomePage.tsx` -- the highlight card and the empty state.
- [x] Tests:
  - every matrix row;
  - the 4.8 prerender and hydration tests extended with a content fixture (hydration stays clean);
  - a migration static test (file exists, RLS enabled, a SELECT-only policy, the five seeded ids);
  - no computed accessible-name assertions.
- [x] Probe:
  - row 5 reads `is_featured` (it will FAIL until the owner applies `00019`; that is expected and must be stated in the run report);
  - a facade row on a local build seeded through a fixture is **not** required, since no real content exists until 4.6.

**Acceptance Criteria:**
- Given `npm run gate`, then green.
- Given the migration applied by the owner and a fresh build, card render and prerender, when the probe runs, then it is GREEN. The prerender writes the same 183 series pages, and with no content rows yet, every series page renders as it does today.
- Until the owner applies `00019`, the prerender and probe cannot pass, because the read selects `is_featured`. The implementation report says so instead of claiming them. `00019` is additive (a new column and a new table), so applying it before this code ships does not affect the live site.

## Implementation Notes

**Files touched.**
- Schema and docs: `supabase/migrations/00019_series_editorial_content.sql` (new), `docs/CURRENT_DATA_MODEL.md`.
- Contract: `src/types/types.ts`, `src/lib/series-query.ts` (`SERIES_SELECT` + `is_featured`; new `SERIES_PAGE_SELECT`), `src/lib/series-content.ts` (new: zod video schema, `parseSeriesContent`, `markdownProblems`, `editorialImagePaths`, YouTube URL helpers).
- Rendering: `src/components/series/EditorialBody.tsx`, `VideoEmbed.tsx`, `SeriesContentSection.tsx` (new, with `useSeriesContent`); `src/pages/series/SeriesPreview.tsx`, `SeriesFullRecord.tsx`, `useSeriesRecord.ts`; `src/pages/SeriesRoute.tsx`, `SeriesResultRoute.tsx`; `src/pages/HomePage.tsx`.
- Prerender: `src/prerender/preload.ts`, `plan.ts`, `entry-server.tsx`, `build.ts`, `types.ts`; `scripts/prerender/run.ts` (own `fetchSeriesPageRows` over `SERIES_PAGE_SELECT`, exported as `PRERENDER_SELECT`, client injectable); `scripts/og/render.ts` (comment only).
- Probe: `scripts/probe-deep-links.mjs` row 5.
- Deleted: `src/lib/flagship-series.ts`, `src/lib/__tests__/flagship-series.test.ts`.
- Tests: new `src/lib/__tests__/series-content.test.ts`, `migration-00019.test.ts`, `series-query.test.ts`; extended `src/prerender/__tests__/prerender.test.tsx`, `hydration.test.tsx`, `src/pages/__tests__/series-pages.test.tsx`, `series-route.test.tsx`, `home-pending.test.tsx`, `series-fixtures.ts`, `tests/prerender/run.test.ts`; `tests/pipeline/insights-refresh.test.ts` names `00019` as the new migration head.
- Dependencies: `react-markdown` ^10.1.0 and `mdast-util-from-markdown` ^2.1.0.

**Decisions.**
- **`mdast-util-from-markdown` is a direct dependency.** The spec names only `react-markdown`. The validator checks image and link rules on the parsed CommonMark tree (the same parser `react-markdown` uses through `remark-parse`), not with a regex pre-scan, so reference-style images, autolinks and duplicate definitions are judged the way they render. It was already installed transitively at the same version, and the lockfile dedupes it.
- **Duplicate link-reference definitions resolve to the first one**, as CommonMark does; the validator and `editorialImagePaths` both keep the first.
- **The `is_featured` boolean guard.** `planSeriesPages` fails the build for any row whose `is_featured` is not a boolean (a read from before `00019`, or a projection that dropped the column). It also fails when no row is featured, which restores the floor the removed pinned-flagship check gave. No row count is asserted in the migration, because CI's migration rehearsal replays onto an empty database.
- **Editorial images are required build assets.** Every `editorial/…` image a row's content references must exist in `dist/` (copied from `public/editorial/`), or `runPrerender` fails listing the missing file. This uses a sibling `assets` list next to `cards`.
- **`/result` for a non-featured id now makes one fetch before its 404**, because flagship-ness lives on the row. A malformed id still makes no request.
- **Home.** Cards use `toSeriesView` + `spoilerNeutralView`, so the eyebrow and headline match the series preview. While the read is in flight, the block reserves the empty state's height with no copy (`min-h-36`). A failed read renders nothing and logs it. A pending row the card cannot show is reported through `captureError` once per id. Production has no pending series, so Home shows the empty state once this ships.
- **Markdown images** are rendered as spans, not `<figure>`, because markdown wraps them in a `<p>` and a block element there breaks hydration.

**Before deploy.** `00019` must be applied (owner, `npx supabase db push`) **before** the deploy that ships this code. `SERIES_SELECT` now selects `is_featured`, so Predict, Home, the OG card render, the series pages and the prerender read all fail against a schema without it. The migration only adds things, so applying it early is safe. Until then, `npm run prerender` and probe row 5 fail by design.

**Measured.** `npm run gate` is green at implementation (45 files / 846 tests at the first pass). The client bundle is 1,045 kB (316 kB gzip); the increase from the markdown libraries was not measured against the baseline. Nothing live has been run: no prerender, no probe and no browser screenshots. Those wait on `00019`.

- **Orchestrator re-check (2026-10-08).** After the review-pass-1 patches, `npm run gate` exits 0: lint 185 files, `tsc -b`, 46 files / 857 tests, and the build with the prefix and 404 checks.
  - **Live schema, read over anon REST the same day:** `series?select=is_featured` returns `400 42703 column series.is_featured does not exist`, and `series_content` returns `404 PGRST205`. So `00019` is **not applied**, and the prerender and probe ACs are **not yet met**.
  - **Owed by the owner:** `npx supabase db push`. Then `npm run build && npm run og:cards && npm run prerender` and the probe against `vite preview`; the expected result is GREEN, with row 5 seeing the five pilots featured.
  - Until then, `npm run deploy` fails at `prerender` by design, which is what keeps 4.4 and 4.5 from shipping against the old schema.
  - 4.5 stays at `review` in `sprint-status.yaml` until that run is recorded here.

- **00019 applied and verified (2026-10-08).** The owner ran `npx supabase db push`. Read over anon REST:
  - `is_featured=eq.true` returns exactly the five pilot ids (2013, 2016, 2019, 2025, 2026);
  - `series_content` returns `200 []`;
  - an anon `POST` is refused with `401 42501 new row violates row-level security policy`.

  Then `npm run build && npm run og:cards && npm run prerender` exits 0 (183 series pages, 5 featured read from the table), and `probe-deep-links.mjs` against `vite preview --port 4341` is **GREEN, 115 rows**, with row 5 seeing all five pilots archived and featured. The acceptance criteria are met.
- **Migration rehearsal (CI) went red on `fe43c64`** (run `37760362339`): the commit added `00019` without bumping `scripts/rehearse-migration-00014.mjs`'s `COVERED_THROUGH` (the spec-2-8 E1 same-commit rule). The follow-up commit bumps it to 19 and adds section 8 for 00019's post-conditions:
  - the column shape and the seed;
  - the PK, the CHECKs and the cascade;
  - RLS with one SELECT policy, and an anon insert refused;
  - re-apply idempotence.

  No local Docker engine was running, so the next CI rehearsal run is the first evidence for section 8. 4.5 moves to `done` once that run is green.
- **CI migration rehearsal green (2026-10-08, run `37767944147` on `f6007a2`)**: sections 8a–8e all `ok` (column shape, seed, PK/CHECKs/cascade, RLS, re-apply). 4.5 is `done`.

- **Post-release owner decision (2026-10-08, after the 0.2.10 deploy): the Home empty state is withdrawn.** On the live front page "No active series right now — the next Game 7 is coming." read badly. With nothing pending, Home now renders nothing (loading and failed reads too), as before 4.5. The frozen block's empty-state clause and matrix row "Home, none pending" are superseded by this decision. The pending cards stay unchanged. The redesign, with a design session and a mockup of simulated active series first, is **Story 4.9** (`epics.md`, `sprint-status.yaml`).

## Spec Change Log

## Review Triage Log

Pass 1 (2026-10-08). Layers: blind-hunter (B), edge-case-hunter (E), verification-gap (V), plus one orchestrator note (O). The diff ran from `8b9a44d` to the working tree, excluding `package-lock.json`.

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| B4/E3 | An editorial image is checked only for path shape. A mistyped or missing `public/editorial/` file ships a broken image on a flagship page, while the build already checks `dist/og/<id>.png` the same way | medium | Verified: `isEditorialImageSrc` is a regex, and the prerender's asset check covers only cards. Fix: add every referenced editorial image to the required-assets list `runPrerender` checks | patch |
| V1/B14 | The `series_content(...)` embed in `SERIES_PAGE_SELECT`, and the prerender read going through it, are pinned by nothing: the mocks and injected rows supply content whatever the select says | medium | Pre-verified by V. Dropping the embed or reverting `run.ts` to `fetchSeriesAnon` keeps the gate green and silently ships pages without content | patch |
| B2/E5/E6(del) | The pinned-flagship build check was removed with no floor. A read that loses its flags (or a seed that matched nothing) prerenders no preview/result pairs and does not fail | medium | Verified: `plan.ts` no longer errors on flagships. A row-count assertion in the migration is rejected: the CI `migration-rehearsal` replays onto an empty DB, where 0 rows match. Fix: `planSeriesPages` errors when no row is featured | patch |
| B7/E4 | Home drops a pending row whose `toSeriesView` is null without a trace; if it was the only one, the empty state claims no active series | low | Verified at the `PendingGameSevens` map. The series routes report the same case (`SeriesUnshowable`). Direct fix: `captureError` with the id | patch |
| B6 | Home's empty state mounts after the read under the hero `<h1>`, so every Home load shifts the layout | low | True on every off-season Home load (everyday use). Direct fix: reserve the block's height while loading | patch |
| B5 | Probe row 5 asserts the featured set is *exactly* the five and that all are archived, which re-pins the list in data and will fail on a featured pending series in 2027 | low | Verified in the probe diff. Fix: assert the five pilots carry `is_featured`, and drop exact equality | patch |
| V2 | The credit link's fallback `href` (the YouTube watch URL when `credit_url` is absent) is unasserted | low | Pre-verified by V. Only the `credit_url` branch is checked. A one-line test | patch |
| E1 | Duplicate link-reference definitions: the validator keeps the last, CommonMark renders the first, so a bad `src` can pass | low | Verified at `series-content.ts` (the definitions map overwrites). Direct correction: first one wins | patch |
| B3 | `series_content.updated_at` changes only on insert (no trigger) | low | True. 4.6's owner scripts are the only writers; recorded for them | defer |
| O1 | The main bundle grew from 858 kB to 1,045 kB (263 → 316 kB gzipped) on every page: `react-markdown` and its tree load even where no content renders | medium | Measured from the gate build output. Lazy-loading conflicts with synchronous SSR for the prerender; needs a measured decision (NFR-P1 via `perf:predict`) | defer |
| B1 | `SERIES_SELECT` gains `is_featured`, so Predict, Home and the OG cards break if the code deploys before `00019` | false | `npm run deploy` runs the prerender in `predeploy`, which fails loud on the missing column, so no deploy can ship before the migration. The spec mandates the column on `SERIES_SELECT` | reject |
| B8 | Relative/internal links are rejected; `rel` without `target` | low | Spec rule ("links are http(s) only"); `rel` is harmless. Changing it edits the spec | reject |
| B9/E2 | A definition shared by an image and a link: validator and renderer disagree | low | Unlikely in owner-authored content; the fix adds a branch | reject |
| B10 | Reduced motion is not honoured by `autoplay=1` after the tap | false | The tap is the explicit play request (EXPERIENCE.md: "swaps to the YouTube iframe and autoplays"); the facade has no UI motion to suppress | reject |
| B11 | `text-[#767676]` is a raw hex that fails AA in dark mode | false | DESIGN.md specifies `#767676` for the credit; the app is light-only (DESIGN.md, EXPERIENCE.md) | reject |
| B12 | `i.ytimg.com` thumbnails load before any tap, against the images-in-repo reasoning | low | Spec-mandated thumbnail source; the fix edits the spec. It is noted for the owner | reject |
| B13 | The tracking docs disagree, the tasks are unticked, and the notes are empty | false | In flight: ticked and noted at close; sprint-status syncs at step 5 | reject |
| E6 | A non-featured `/result` now fetches before the 404 | false | Spec-mandated ("now decided after the fetch") | reject |

## Design Notes

**Why a table, not columns.** Two optional parts per series, each with its own headline, body and videos, is one row per part. A `(series_id, part)` PK makes "at most one before, one resolution" a database fact. The spoiler strip removes one row, not a set of columns.

**Why images live in the repo.** "No media hosting" plus static GitHub Pages: a committed `public/editorial/` file ships with the deploy, cannot rot or be hot-swapped by a third party, and keeps the no-third-party-tracker posture (NFR-V1). YouTube is the one external embed the owner approved (Q-5), and it loads only on tap (`youtube-nocookie`).
