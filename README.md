# Predict Game 7

Predict Game 7 is a React and Supabase app for exploring NBA Game 7 history, generating win probability predictions, and comparing multiple statistical approaches to the most pressurized game in basketball.

## What the app does

- Browse a normalized archive of historical series-deciding games
- Surface current Game 7 matchups when active series exist
- Generate predictions from historical, active, or custom series inputs
- Compare multiple prediction methods, including logistic regression, Bayesian, Elo, and exponential smoothing
- View score-driven prediction outputs, contributing factors, and confidence levels
- Explore high-level historical insights and methodology pages
- Use canonical team records and team logo assets across the app

## Tech stack

- React
- TypeScript
- Vite
- Tailwind CSS
- Radix UI
- Supabase
  - Postgres
  - Edge Functions
  - Auth
- PostHog

## Project structure

```text
src/
  components/        UI building blocks and shared layout pieces
  contexts/          App-wide state such as auth
  db/                Supabase client setup
  lib/               Team utilities, logo helpers, and shared logic
  pages/             Route-level screens
  types/             Shared frontend types

supabase/
  functions/         Edge Functions, including prediction and contact handling
  migrations/        Schema and data migrations
  scripts/           One-off data loading utilities
```

## Key product areas

- `Home`: product story, featured series links, contact form
- `Predict`: select a historical/current/custom series and generate a prediction
- `Historical`: searchable archive of series-deciding games
- `Insights`: summarized patterns from the data
- `Maths`: explanation of the prediction methods

## Local development

### 1. Install dependencies

```bash
npm install
```

### 2. Create environment variables

Create a local `.env` file (gitignored — `.env.local` is not used here) with:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_POSTHOG_KEY=your_posthog_project_key
VITE_POSTHOG_HOST=https://us.i.posthog.com
```

Notes:

- Restart the Vite dev server after changing env vars.
- Browser ad blockers can block PostHog locally and make analytics appear broken.

### 3. Start the app

```bash
npm run dev
```

### 4. Build and lint

```bash
npm run build
npm run lint
npm run typecheck
```

## Deployment notes

- The app is configured with `base: '/predictgame7/'` in [vite.config.ts](./vite.config.ts)
- Routing uses `basename={import.meta.env.BASE_URL}` in [App.tsx](./src/App.tsx)
- The current npm scripts include GitHub Pages deployment via:

```bash
npm run predeploy
npm run deploy
```

## Data model

The normalized schema centers on:

- `teams`
- `series`
- `series_game_scores`
- `prediction_methods`
- `predictions`

Legacy migration and backfill work is tracked in `supabase/migrations`, including the Release 1 normalized data model rollout and historical backfills.

## Edge functions

- `predict-game-7`: prediction engine used by the Predict page
- `handle-contact`: contact form submission handler

What checks them:

- `npm run lint` (Biome) covers `supabase/functions/**/*.ts`, so those files are parsed and
  linted locally with the rest of the repo.
- `npm run typecheck` reaches two of them: `tsc -b`'s program is `src` + `vite.config.ts`, and the
  `_shared/` modules those files import (`contract.ts`, `predict-request.ts`) are type-checked with
  it. The `index.ts` entry points are not.
- The two `index.ts` entry points are type-checked only by a `deno check` step in CI
  (`.github/workflows/ci.yml`), which is the sole reason that step exists. This repo deliberately
  does not require a local Deno install, which means **a CI run on
  `master` is the first evidence that step can produce**; nothing you run locally substitutes for
  it. The step is also **not hermetic**: `deno check` needs network egress and resolves every
  remote specifier (jsr.io, esm.sh, deno.land) plus the npm packages in the runner's
  `node_modules`, so registry availability and upstream type releases are gate dependencies — the
  step can go red with no change in this repo. Its first run on 2026-09-30 did exactly that, when
  a floating `jsr:@supabase/supabase-js@2` resolved to a version whose npm sub-dependencies were
  newer than the pinned client in `node_modules`; both functions now import that client from
  `https://esm.sh/…`, whose graph resolves entirely over HTTPS.
- Deploys are a separate, ungated mechanism (`supabase functions deploy`), so the live function
  can be behind `master`. `node scripts/probe-predict-contract.mjs --expect=baseline|validated`
  hits the deployed function and fails on a mismatch, which is how that difference is measured
  rather than assumed. The two modes answer different questions: `validated` is the post-deploy
  check and the one expected to pass now; `baseline` records what the pre-validation function
  answered, so after the validator ships it goes red on the rejection rows by design — evidence the
  probe can fail, not a regression.

## Analytics

PostHog is wired into the frontend for:

- prediction flow events
- homepage interaction events
- historical archive interaction events
- auth events
- frontend exception capture

## Repo docs

- [CHANGELOG.md](./docs/CHANGELOG.md)
- [CURRENT_DATA_MODEL.md](./docs/CURRENT_DATA_MODEL.md)
- [PLAYOFF_RUNBOOK.md](./docs/PLAYOFF_RUNBOOK.md) — the Apr–Jun playoff-window operator procedure (hand births, recovery, offseason reset)
- Archived (superseded by the PRD baseline in `_bmad-output/`): [APP_FUNCTIONALITY_OVERVIEW.md](./docs/archive/APP_FUNCTIONALITY_OVERVIEW.md) · [posthog-setup-report.md](./docs/archive/posthog-setup-report.md)
