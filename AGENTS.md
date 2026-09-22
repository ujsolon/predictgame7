# AGENTS.md — predictgame7

Standing instructions for AI agents working in this repo.

## Project

NBA Game 7 prediction analytics app — live at https://ujsolon.github.io/predictgame7/.
Stack: React 18 + TypeScript + Vite (`rolldown-vite`), Tailwind, Radix/shadcn, react-router 7 (basename `/predictgame7/`), Supabase (Postgres + Edge Functions `predict-game-7` / `handle-contact` + Auth), PostHog analytics, GitHub Pages hosting, Biome lint.

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

- `npm run build` passes and Biome lint is clean.
- Local secrets live in `.env.local` — never committed. Vite needs a dev-server restart after env changes.
- Deploy = publish to `gh-pages` branch via `npm run predeploy` / `npm run deploy`. Only run deploys when the owner asks for a release.

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
- `series.status` has no defined value domain yet (addendum §B) — don't build on it until pipeline work fixes the enumeration.
