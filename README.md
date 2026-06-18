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

Create a local env file such as `.env.local` with:

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

## Analytics

PostHog is wired into the frontend for:

- prediction flow events
- homepage interaction events
- historical archive interaction events
- auth events
- frontend exception capture

## Repo docs

- [CHANGELOG.md](./CHANGELOG.md)
- [CURRENT_DATA_MODEL.md](./CURRENT_DATA_MODEL.md)
- [APP_FUNCTIONALITY_OVERVIEW.md](./APP_FUNCTIONALITY_OVERVIEW.md)

## Current version

`0.2.0`
