# AGENTS.md — predictgame7

Standing instructions for AI agents working in this repo.

## Project

NBA Game 7 prediction analytics app — live at https://ujsolon.github.io/predictgame7/.
Stack: React 18 + TypeScript + Vite 8 (Rolldown-powered), Tailwind, Radix/shadcn, react-router 7 (basename `/predictgame7/`), Supabase (Postgres + Edge Functions `predict-game-7` / `handle-contact` + Auth), PostHog analytics, GitHub Pages hosting, Biome lint, Vitest (Node by default, per-file jsdom for component tests).

## Requirements source of truth

- PRD baseline: `_bmad-output/planning-artifacts/prds/prd-predictgame7-2026-09-22/prd.md` (+ `addendum.md` beside it). Read it before proposing or building features.
- Triaging an issue/feature request: start from the issue→FR map in addendum §E. FR status tags **[LIVE] / [PLANNED] / [PLANNED-GATED]** decide "new vs. change".
- **PLANNED-GATED** work (accounts FR-22/23, betting-adjacent FR-26..29, video FR-13) is blocked on the Traffic Gate (SM-1, Apr–Jun 2027) — never build it without an explicit owner decision.
- Addendum lifecycle rule: implementation depth gets promoted to downstream docs (architecture/UX/epics) with a pointer left behind; decision evidence (§D–§G) stays as audit trail. Do not re-decide what is recorded there.

## Docs layout

- `README.md` — root, repo front page. Carries **no version number** (NFR-D2).
- `docs/CHANGELOG.md` — release history; gains an entry at every release.
- `docs/CURRENT_DATA_MODEL.md` — active schema documentation; update it when the schema changes.
- `docs/archive/` — superseded source docs (kept for provenance; content absorbed into the PRD baseline).

## Verification gate (before any deploy or "done" claim)

- `npm run lint` (Biome), `npm run typecheck` (`tsc -b`), `npm test` (Vitest), and `npm run build` all pass. `npm run gate` runs all four in that order and is the single definition of the gate. The build doubles as a base-path check: it fails if `dist/index.html` loses the `/predictgame7/` asset prefix. Note: `typecheck` covers `src` + `vite.config.ts` only — `supabase/functions/**` is type-checked by nothing in the repo.
- Enforcement is local: a `pre-push` hook runs `npm run gate` on any push whose target is `refs/heads/master`, and the push aborts on red. Tracked source is `.githooks/pre-push`; after editing it reinstall with `npm run hooks:install` (copies it to `.git/hooks/pre-push` — `core.hooksPath` is deliberately unset). `git push --no-verify` bypasses it, so only use it on the owner's explicit instruction. CI (`.github/workflows/ci.yml`) also runs all four on every push to `master`, but it **reports** rather than blocks: `master` has no branch protection, and a required status check would gate pull requests, not direct pushes.
- Local secrets live in `.env` — never committed (`.env.local` is not used here). Vite needs a dev-server restart after env changes.
- Deploy = publish to `gh-pages` branch via `npm run predeploy` / `npm run deploy` (`predeploy` runs `npm run gate`). Note: `gh-pages` publishes are additive — `gh-pages` history mode does not prune files removed elsewhere, so clean stray paths off that branch explicitly if a publish ever leaves something behind. Only run deploys when the owner asks for a release. Edge Function deploys are a separate mechanism (`supabase functions deploy`) and are gated by nothing — probe the live function before blaming client code.

## Evidence discipline

- **Look for the programmatic substitute before writing a step for the human, and state which one you tried.** "No harness can see it" has been wrong four times in one epic; the usual truth is that the harness ran out, not that the measurement is inherently human. What CDP reaches here is demonstrated rather than assumed — `node scripts/measure-predict-latency.mjs --probe-evidence` (against `npm run preview`) prints the computed style of a focused element, a real screenshot, and the accessibility tree, from a headless Chrome that script spawns itself. What genuinely stays human: screen-reader announcement *behaviour*, and "does this look right".
- **Re-read the edited region of a markdown artifact in the same turn.** These files are load-bearing and Biome's `files.includes` covers `src/**` only, so a duplicated paragraph, a dropped table row or a broken code fence passes every gate in the repo and still reads as authoritative to the next agent.
- **No test may assert a computed accessible *name* in jsdom.** `dom-accessibility-api` inserts a separator between block-level siblings that Chrome's accname implementation does not, so `getByRole({ name })` can stay green on a tree real AT reads as fused (`qa-matrix-1-5.md` §5 note 4, finding F16). Assert `textContent` for the raw concatenation, or settle names over CDP / with real AT.

## Versioning (NFR-D2)

- `package.json` is the single source of truth for the version.
- Bump at releases only: **minor** for a major release (e.g. 0.3.0 for the pre-playoff release), **patch** for fixes/docs releases in between.
- Every release adds a `docs/CHANGELOG.md` entry in the same commit as the version bump.

## Commits

- Agents commit directly to `master` (solo repo; owner reviews via git log).
- Title: short imperative prose — "Add OG card rendering". When the change maps to a requirement or issue, append references: "Add OG card rendering (FR-31, #7)".
- Confirm with the owner before: deploys, database migrations, deleting files/branches, anything touching shared state.
- Review `git status` before staging; stage specific files, not `git add -A`.

## Security (NFR-S1)

- Server secrets (Supabase `service_role`, email provider keys) must never appear in the repo or the client bundle. `VITE_*` env vars are client-visible by design — nothing secret goes in them.
- `contact_submissions` writes go only through the `handle-contact` Edge Function — never re-enable direct public inserts.
- RLS stays enabled on all public tables; `predictions` stays private-by-default.
- History: a `service_role` JWT leaked into the repo once (issue #1; key rotated 2026-09-22). Treat every new secret with that level of care.

## Product guardrails (PRD §7 / NFRs — things agents could accidentally violate)

- Never add wagering, odds markets, or "guaranteed picks" mechanics of any shape.
- All analytics code (SDK init, event definitions, exception capture, metric queries) goes through the single isolated integration layer (NFR-V1). Feature code emits events declaratively through it. Preserve the 10 event names in addendum §A.1 until FR-25 metrics are re-pointed.
- No live/in-game scoring features — Active Series data updates only via the pipeline cadence (FR-20/21).
- New surfaces: WCAG 2.1 AA is the standing bar (NFR-A1); responsive on mobile and desktop (NFR-U1).
- `prediction_methods` has no runtime read path today (FR-4 note) — don't write code assuming catalog-driven behavior until that changes.
- A series' phase is **derived, never stored**: `winner_team_id IS NULL` means Game 7 pending, `IS NOT NULL` means archive (AD-4, 2026-09-29). Do not branch on `series.status` in new code — it is a vestigial remnant of the un-cascaded two-table merge. Do not derive phase from dates or `created_at`.
