# Epic 6 plan: Discoverability & flagship launch

*Owner-facing summary, agreed 2026-10-09. The authoritative sources are [epics.md § Epic 6](../planning-artifacts/epics.md), [sprint-status.yaml](sprint-status.yaml), [sprint-change-proposal-2026-10-09.md](../planning-artifacts/sprint-change-proposal-2026-10-09.md) and the [Epic 4 retro](epic-4-retro-2026-10-09.md). If this page and those disagree, they win; update this page.*

**Goal:** every series page is reachable and has a readable, shareable URL; Home is designed and fast; the five flagship series launch with real content.

**Hard date: live by about Feb 4–18, 2027** (6–8 weeks before the Apr 1, 2027 Traffic Gate window).

**Epic order:** Epic 4 (done) → **Epic 6** → Epic 3 → Epic 5.

## Story order

| # | Story | What it delivers | Your part |
|---|---|---|---|
| 1 | **6.0** PredictPage refactor | Splits the 1,418-line Predict page into smaller pieces. No visible change; the existing tests are the safety net | Review only |
| 2 | **6.9** ABA Game 7 venue spike | Finds a source for the real Game 7 home team of the 18 ABA series (research only, no writes) | Rule on any series the sources can't settle |
| 3 | **6.10** Re-key the archive to home-court first | Migration `00020`: swaps the teams (and their scores) for the **42 NBA/BAA series** where the stored first team isn't the Game 7 home team, plus the ABA rows per 6.9 | Apply it with `npx supabase db push` |
| 4 | **6.8** One team order everywhere | Every "X vs Y" on the site shows the **home team first**, by showing stored order (re-keyed in 6.10); the alphabetical helper is retired | — |
| 5 | **6.1** Readable series URLs | `/series/<year>/<slug>/`, with old uuid links kept as pages pointing to the new URL, `/series/` and `/series/<year>` redirecting to Historical, and image alt text. The missing tests and small Epic 4 fixes come first (the share card's league, the probe's flagship count) | — |
| 6 | **6.2** Entry points | A "Series page" link for every series from Historical and Predict; the reset button gets a label and a 44px target | — |
| 7 | **6.3** Home design session | A mockup with simulated live series and the flagship cards; Home's image budget, font, favicon, and title/meta; the stale share-card mockup fixed | Approve the mockup |
| 8 | **6.4** Home build | Home built from the mockup, with load time re-measured | — |
| 9 | **6.5** Flagship content | Your five flagship pairs, written and loaded; licensed images with credit lines | **Write the content**: 2013 Heat–Spurs, 2016 Cavs–Warriors, 2019 Raptors–76ers, 2025 Thunder–Pacers, 2026 Thunder–Spurs |
| 10 | **6.6** Bundle trim | Re-measures the JavaScript size, then you decide on trimming | Decide |
| 11 | **6.7** Epic verification | Live checks before the window, plus the deploy date against Feb 4–18 | OG debugger check |

## Standing rules that apply

- **Deploys:** you run `npm run deploy` after any content or featured-flag change, and in the playoff window after every new or finished series. Pages, cards and the sitemap only reflect data as of the last deploy.
- **Migrations:** the agent writes them, and you apply them (`npx supabase db push`) before the deploy that needs them.
- **AGENTS.md and the PRD addendum:** edited only between epics, in one batched commit, with the diff shown to you first.
- **UI stories:** you see a preview (mockup or screenshot) before the spec freezes (Epic 4 retro lesson).

## Carried in from the Epic 4 retro

- **Before Story 3.4:** check whether a series share arrival double-counts its page view.
- **At Epic 6 start:** a planning-doc cleanup (page counts 182/172 → 183/173, "prerender in `npm run build`" → `predeploy`, AD-6's title).
- **Later, not in Epic 6:** consolidating and type-checking the probe scripts, and the hydration test's analytics parity.

## Next step

Push your local commits, then run `bmad-build` on **Story 6.0**.
