# Story 1.5 — Manual QA Matrix + Epic 1 Verification Pass

Generated: 2026-09-28 · Spec: `spec-1-5-manual-qa-matrix-epic-verification-pass.md` · Baseline commit: `7f19589687609b6e96f00be765976d9f5575c39e`

## Verdict legend

| Mark | Meaning |
| --- | --- |
| `[x]` | Driven in a real browser against a real backend, observed pass, evidence line below |
| `[!]` | **Finding.** Driven, observed a problem or an unverifiable-by-data condition. Not a failure of this story — a fact the matrix now records |
| `[ ]` | **Not driven.** Needs a human, a device, or an assistive technology this harness does not have. Never inferred. Owner-side run sheet in §6 |

Rule held throughout: no cell is `[x]` because it "should" pass. Three observations that looked like defects during the run were traced to harness artifacts and are recorded as measurement notes in §5, not as `[!]` cells.

## 1. Setup

- **Build under test:** `npm run build` + `npm run preview` → `http://localhost:4173/predictgame7/` (production bundle, `BASE_URL=/predictgame7/`). Not the live site — `gh-pages` still ships only up to Story 1.1 (project memory: *Live Site Lags Master*), so a pass here is a pass on `master`, not on `https://ujsolon.github.io/predictgame7/`.
- **How to re-run (all rows):** `npm run gate && npm run preview`, then open the URLs each row names. Every row is reproducible from the evidence line without a login.
- **Viewports:** driven through same-origin iframes sized 1440×900 ("desktop") and 390×844 ("mobile"). Same-origin fixed-size iframes give true CSS viewports — media queries and `useIsMobile` respond to the frame width, so the mobile rows are the real responsive layout, not a narrow window.
- **Data-shape facts measured from the backend (PostgREST) before driving.** These gate several rows, so they belong in the setup section:
  - `series`: **178 rows, all `status: 'historical'`** (`Prefer: count=exact`, then paged past the silent 1000-row cap with `Range: 0-999` / `1000-1999`). There is **no active series in the database**, so the "active" prediction axis cannot be exercised end-to-end today.
  - `series_game_scores`: **1246 rows**.
  - `insights_cache`: renders "Based on **8** historical Game 7s" (`InsightsPage.tsx:117` reads `game_6_winner_stats`/`home_team_stats`/`avg_point_differential` by `insight_key`) against 1246 score rows and 178 series carrying a Game 7 → the cache is stale. Refresh is Story 2.5's job.
  - `prediction_methods` slugs are `bayesian`, `ensemble_v1`, `margin_model_v1`; the wire contract's `MethodSlug` is `logistic_regression | bayes | elo | exponential_smoothing`. They do not overlap. Harmless today because FR-4 says the catalog has no runtime read path — recorded so Epic 2 does not discover it by surprise.
  - Real columns are `team_a_id` / `team_b_id` / `winner_team_id` (there is no `team_a`); the table is `series_game_scores` (not `series_games`, `games`, or `game_scores`).

## 2. Matrix — the five pages plus the unknown-path route

Columns: **D** = desktop 1440×900 · **M** = mobile 390×844 · **K** = keyboard-only (tab ring + Enter/Space/Escape, no mouse) · **S** = screen reader.

Cell semantics, so the tables and §7 don't contradict each other: a column is `[x]` when that column's *own subject* was driven and clean at that surface. Findings that apply at every width — F4 (contrast), F5 (empty `<title>`, duplicate `<h1>`) — turn the **S** column `[!]` on every page, because a titled, single-h1 document is an assistive-tech requirement; they are noted rather than repeated in the D/M cells, whose subject is layout and rendering.

### 2.1 Predict — historical series axis

| | D | M | K | S |
| --- | --- | --- | --- | --- |
| verdict | `[x]` | `[x]` | `[x]` | `[!]` structural pass / announcements `[ ]` |
| evidence | Pick CLE vs GSW 2016 via the picker → Bayes run returns 62/38, label reads "Bayes Method", `method_used: 'bayes'`, `computation_time_ms: 3`, all 11 contract keys rendered, winner/confidence/factors present. Score cells populated from `series_game_scores`. | Mobile historical run rendered GSW 69.64 / CLE 30.36 with no horizontal overflow (`scrollWidth - clientWidth` = 0). Card/picker/result layout intact at 390. | Fresh `/predict` tab ring = **7 stops** @1440 = 5 nav links + Series + Method — Generate is `disabled` with nothing selected, so it is correctly *absent* — and **3** @390 = `Toggle menu` + Series + Method (the desktop sidebar is `hidden lg:flex`). With a full selection the same page reads 22 (§2.3). Enter and Space each open the Series and Method dialogs; Escape closes and returns focus to the trigger. Pinned by `src/pages/__tests__/predict-keyboard.test.tsx` (8 tests). | `take_snapshot` gives the pickers real `role="button"` names ("Click to choose series" / "Click to choose method") and the result region names. The two **announcement** cells stay `[ ]` — no AT installed (§6.1, §6.2). |

**K-column limit worth naming:** focus *order* is measured; the focus *ring's visibility* on the three new triggers is not, because screenshots were impossible this run (§5). That half of the frozen matrix row is an owner check — added to §6.4.

Re-run: `http://localhost:4173/predictgame7/predict` → open picker → choose a 2016 Finals row → choose Bayes Method → Generate. Tab the whole page before clicking anything and count stops; expect 7 @1440, 3 @390.

**One behavior the fix changed for mouse users, filed not reverted (F13):** narrowing the Series trigger to the header block (`PredictPage.tsx:487-540`) means the Games 1–6 readout below it — a sibling at `:597`, with no `onClick` on the enclosing `<Card>` — no longer opens the picker, and lost its hover cue. Restoring it would mean an `onClick` on a non-semantic `div`, i.e. re-creating the exact keyboard-inert pattern this matrix files as F2/F3, so it is the owner's call alongside F1.

### 2.2 Predict — active series axis

| | D | M | K | S |
| --- | --- | --- | --- | --- |
| verdict | `[!]` | `[!]` | `[!]` | `[!]` |
| evidence | **Not exercisable: no active series exists.** 178/178 rows are `status: 'historical'`. `loadSeriesById` (`PredictPage.tsx:150-183`) derives `source: series.status === 'active' ? 'current' : 'historical'`, so nothing in the DB can drive the `current` branch. | Same cause. | Same cause. | Same cause. |

This is the addendum §B gap (`series.status` has no defined value domain), which `deferred-work.md` assigns to the pipeline story — Story 1.5 must not define the enumeration. The matrix records that the axis is un-derivable from the app's own data rather than marking it passed. Owner choice in §6.5.

Re-run: `GET /rest/v1/series?select=id,status` with the anon key (page it with `Range` headers; the default cap hides rows past 1000) and count the `active` rows — zero means this row stays `[!]`. In the app the same fact shows up as no series carrying the "current" badge in the picker.

### 2.3 Predict — custom matchup axis

| | D | M | K | S |
| --- | --- | --- | --- | --- |
| verdict | `[x]` | `[x]` | `[x]` | `[!]` |
| evidence | BOS vs MIA, 6 score fields filled, Elo → 52.49 / 47.51 rendered. Blank one score → inline field error **and zero network requests** (verified via the fetch wrapper's request counter, not the resource-timing API — see §5). | 390px custom run completed and rendered; the 14 inputs stay individually focusable and typeable at mobile width. | With a full custom selection the ring is exactly **22 stops = 5 nav + 14 custom inputs + Series + Method + Generate**, in DOM order, and the disabled Generate is correctly excluded. `trigger.contains(input) === false` for all 14 — the picker trigger is no longer an ancestor of the inputs, which is what made the earlier `role="button"` idea a false pass (inputs inside a button are hidden from AT in browse mode). | Names/roles verified in the tree. Whether a field error is **uttered together with its label** is `[ ]` (§6.2). |

Re-run: `/predict` → open the Series picker → click into the custom grid → fill Team A/B + Games 1–6 → Method → Generate. Then blank one field and Generate again.

### 2.4 Predict — Epic 1 error / recovery states (FR-8 regression, driven not re-derived)

| | D | M | K | S |
| --- | --- | --- | --- | --- |
| verdict | `[x]` | `[!]` | `[x]` | `[ ]` |
| evidence | Series list with the network blocked → "Couldn't load the series list." plus a **working** Retry that restores the picker; selection preserved. Unknown `?series=` id → one "Series not found" toast, no crash. `'Nowhere FC'` → **exactly one** naming warning toast and a rendered prediction (NF 64.11 / MIA 35.89) — the friendly-failure path, not a silent empty result. Empty-response / no-request paths carried over from Story 1.4 all re-verified. | Desktop-shaped recovery states were driven; the 390px variants of the *blocked-network* and *not-found* panels were read off the same DOM at mobile width but not separately screenshotted (visual cells owner-side, §6.4). | In the retry panel, **Retry is the only tab stop**; the panel itself carries `tabindex="-1"` and `role="status"`, so the ring lands on the action, not the container. Pinned by test. | `role="status"` is present; whether the swap is **spoken** when the panel replaces a result in place is `[ ]` (§6.1). |

Re-run (the blocked-network half is counter-intuitive, so the exact recipe): the archive is **one** request fired at page mount, so blocking after load proves nothing — patch `window.fetch` to reject Supabase REST calls *and then* navigate Home → Predict to remount the page client-side, or block in DevTools and reload. Preload check: `/predictgame7/predict?series=<id>` from another tab; an id that isn't in the table gives the "Series not found" toast.

### 2.5 Home — page content and carousel

| | D | M | K | S |
| --- | --- | --- | --- | --- |
| verdict | `[!]` | `[!]` | `[!]` | `[!]` |
| evidence | Renders; the carousel advances and its four series hotspots link to `/predict?series=…`. Ring = **20 stops** @1440 (5 nav + 4 carousel hotspot links + 3 step CTAs + Prev/Next slide + 2 footer CTAs + 3 contact fields + Send). The contact form's own verdicts are in §2.5b, not here. | Ring = **14 stops** @390 once nav collapses behind "Toggle menu". No horizontal overflow (0). | Three problems: the 4 carousel **hotspot links are 20×20** with their label at `opacity-0 group-hover:opacity-100` (`HomePage.tsx:204`) — focus never reveals it, so there is no visible focus indicator on the dot (2.4.7); Prev/Next arrows are `hidden md:flex` **and** `opacity-0 group-hover/carousel:opacity-100` (`:294,:306`) so they appear on hover of the carousel, not on focus; the 6 left/right **15% click strips** (`cursor-pointer` DIVs, 123×598) have no role and no tabindex. | The carousel dots' accessible names come from the label that hover reveals, so their link text is invisible to a sighted keyboard user; the rest of the page resolves normally in the tree. |

Re-run: `/predictgame7/` at both widths; Tab to the last carousel hotspot and watch whether anything marks it as focused.

The strips duplicate the Prev/Next buttons, so keyboard users are not locked out of anything — this is a focus-visibility and target-size remediation item, filed to **5.2** (WCAG pass) with the carousel a11y pattern to **5.2** as well. Not a Story 1.5 blocker: Home is not an Epic 1 acceptance surface.

### 2.5b Contact — the sixth canonical surface (`epics.md:577`, `prd.md:329`; the form inside `HomePage.tsx`)

| | D | M | K | S |
| --- | --- | --- | --- | --- |
| verdict | `[!]` | `[x]` | `[!]` | `[!]` |
| evidence | Fields `name` / `email` / `message` measured with native `required` (36×468 inputs, 100×468 textarea), a 0×0 honeypot named `website`, and a real Send `<button>`. **The submit path was deliberately not exercised:** a conforming payload writes a `contact_submissions` row and can send mail, and that table is write-only through `handle-contact` by policy (NFR-S1), so an unrequested row would be a shared-state side effect. What is proven is the *validation surface*: an empty field is refused by the browser and there is **no app-level field feedback at all** (F10 → Story 3.3). | Same DOM at 390; all three fields and Send reachable in order, no overflow. | Focus reaches every field and the Send button; because the feedback is entirely native, the message a keyboard user gets is the browser's copy, not ours. | Real `<input>`/`<textarea>` with associated `<label>`s in the tree; the honeypot is `0×0` so it stays out of the accessibility tree, and nothing states a problem in our words. |

Re-run: `/predictgame7/` → scroll to the contact form → leave `message` blank → press Send. Expect a native refusal and **no request** in the Network panel. Do not complete a conforming submit unless a live test row is wanted; the delivered-message checks belong to Story 3.3's own matrix, where the Resend path is in scope.

### 2.6 Historical

| | D | M | K | S |
| --- | --- | --- | --- | --- |
| verdict | `[!]` | `[x]` | `[!]` | `[!]` |
| evidence | Table + detail sheet render. Archive rows are `<TableRow onClick>` measured `cursor: pointer`, `tabindex: null`, `role: null` → **keyboard-inert**: a keyboard-only visitor can read the table but cannot open a row's detail sheet. | Layout holds at 390, no horizontal overflow. | Same as desktop: rows unreachable by Tab. The detail sheet's 32×32 Close button is reachable, but **Escape does not dismiss the sheet** — keyboard users must find and activate the button. | The sheet has no dialog role in the tree, so it neither traps nor announces. |
| note | Epic 1's acceptance criteria are about `/predict`, so this is not an Epic 1 failure. Filed to **5.2** (rows, Escape, target size). | | | |

Re-run: `/predictgame7/historical` → Tab from the nav and count stops (no row appears); then open a row with the mouse and press Escape — the sheet stays.

### 2.7 Insights

| | D | M | K | S |
| --- | --- | --- | --- | --- |
| verdict | `[!]` | `[x]` | `[x]` | `[!]` |
| evidence | Renders three stat cards off `insights_cache`. **Stale cache finding:** "Based on 8 historical Game 7s" against 1246 score rows / 178 Game-7 series. Content correctness is Story 2.5's deliverable; the matrix records the discrepancy as measured. | 390 layout intact. | Ring = nav + page controls only; no interactive traps, nothing cursor-pointer-that-isn't-a-control beyond the shared findings. | Stat text and headings resolve by name in the tree, but the page has no `<title>` and three `<h1>`s (F5), which is what an AT user meets first. |

Re-run: `/predictgame7/insights` → compare the "Based on N historical Game 7s" line against `GET /rest/v1/series_game_scores?select=id&Prefer=count=exact` and the count of Game-7-bearing series.

### 2.8 Maths

| | D | M | K | S |
| --- | --- | --- | --- | --- |
| verdict | `[x]` | `[x]` | `[x]` | `[!]` |
| evidence | Static explainer renders all four method descriptions; text matches the contract's `MethodSlug` set, and the on-screen label "Bayes Method" maps to `method_used: 'bayes'` on the wire (verified against a live Bayes response, §2.1). | Intact at 390. | No custom widgets, so the native ring is correct by measurement. | Headings and paragraphs resolve, but as on every page the document has no `<title>` and three `<h1>`s (F5). |

Re-run: `/predictgame7/maths` → read each method's description and compare the four names against `MethodSlug` in `supabase/functions/_shared/contract.ts`.

### 2.9 Unknown path / deep link

| | D | M | K | S |
| --- | --- | --- | --- | --- |
| verdict | `[!]` | `[!]` | `[!]` | `[!]` |
| evidence | `src/App.tsx:22` is `<Route path="*" element={<Navigate to="/" replace />} />`, so `…/predictgame7/definitely-not-a-page` **silently redirects to Home**. `NotFound.tsx` — the only page in the repo with a `<title>` via Helmet — is unreachable dead code. | Same route, same behavior. | A keyboard visitor cannot tell they mistyped a link; there is no "not found" state to acknowledge. | **`document.title === ""` on every routed page** — measured. `index.html` has no `<title>` and only `NotFound.tsx:7` and the unrouted `SamplePage.tsx:10` mount Helmet. That fails WCAG 2.4.2 (Page Titled) on all five pages. Also measured: **three `<h1>` elements per page** — `document.querySelectorAll('h1')` at rest, at both 1440 and 390: the sidebar brand (`Layouts.tsx:51`, in the DOM at every width though `hidden lg:flex`) + the mobile header brand (`:76`) + the page's own `<h1>`. The sheet brand (`:69`) is a fourth, and Radix unmounts it while the menu is closed. A screen-reader user hears "heading level 1, Predict Game 7" before every page title. |
| disposition | 404 behavior is Story **4.1**'s scope (series deep links + SPA fallback). `document.title` and the duplicate `<h1>`s are a **5.2** remediation item; both are cheap and both are cross-page, so they belong to the accessibility pass, not to 4.1. F5's cheapest half is not a component change at all: a static `<title>` in `index.html`, which today has none. | | | |

Re-run: `/predictgame7/definitely-not-a-page` → observe the landing page and that the browser tab shows no title. Then, on any page, `document.title` and `document.querySelectorAll('h1').length` in the console.

## 3. Epic 1 acceptance-criteria verification pass

| Criterion | Status | Evidence |
| --- | --- | --- |
| **FR-30** — regression suite covers the highest-risk predict paths | `[x]` | Story 1.4's suite is green in `npm run gate`; §2.1/§2.3/§2.4 re-drove the same paths in a real browser rather than trusting the harness. |
| **FR-8** — error states never lose your place | `[x]` | §2.4. Retry restores, selections survive a failed load, one toast per naming anomaly. |
| **Keyboard operability of the predict controls** (the fix Story 1.5 owns) | `[x]` | §2.1/§2.3. `PredictPage.tsx` now puts a real `<Button type="button">` in the trigger slot for Series, Method and Generate; ring measurements and 8 tests in `predict-keyboard.test.tsx` pin it. |
| **NFR-A1 — WCAG 2.1 AA on new surfaces** | `[!]` **conditional** | Predict's *structure* now passes (roles, names, focus order, focus return). Predict's *announcements* are undriven (`[ ]`). Site-wide, three pre-existing AA failures are measured and filed to 5.2: `--muted-foreground` `#808080` on white = **3.95:1** (fails 1.4.3, ≥11 nodes), empty `<title>` (2.4.2), three `<h1>`s. Epic 1's own gate is met for the surfaces it changed; the story cannot claim the whole bar. |
| **NFR-U1 — responsive on mobile and desktop** | `[x]` for the driven surfaces | Every measured page: no horizontal overflow (`scrollWidth - clientWidth` ≤ 0 at both 1440 and 390); predict pickers, custom grid, result card and error panels complete at both widths. |
| **NFR-P1 — prediction latency** | `[!]` **provisional fail on mobile** | Server half clears the 3 s provisional P95 (1–5 ms compute, 322–1324 ms wall); the two unthrottled mobile client runs (4372–4545 ms) sit above it. No percentile claimed — the throttled, multi-sample study is `[ ]` (§4, §6.3). |
| **AD-2 consolidation** (Story 1.2) | `[x]` | Live responses carry the flat `PredictionInput` and the 11-key `PredictionResult`; probabilities 0–100, `impact` 0–1, `method_used` a contract slug. Two live methods re-observed (bayes, elo). |

**Epic 1 verdict: verified, conditionally.** The conditions are exactly the two announcement cells in §6.1/§6.2 and the owner's throttled-timing half in §6.3. `epic-1` is deliberately **not** set to `done` in `sprint-status.yaml` — see §7.

## 4. NFR-P1 latency, both halves

- **Threshold being compared to:** the provisional bar is **P95 ≤ 3 s for a full request on a mobile 4G connection** (`ARCHITECTURE-SPINE.md`, carried into `epics.md` as "noted against the provisional 3s P95").
- **Deployed function confirmed current first**, as Decision 4 requires: `predict-game-7` was redeployed 2026-09-28 and re-probed to all 11 contract keys (`deferred-work.md`, the deploy-blocker entry), and every response in this run carried all 11 keys (§2.1, §2.3) — so the timings below are the committed code's, not a stale deploy's.
- **Server half — 20 sequential probes** through the Edge Function: `computation_time_ms` between **1 and 5 ms**; wall-clock (fetch wrapper `performance.now()` delta, request→response parsed) **min 322 ms / median 496 ms / max 1324 ms**.
- **Client half — observed in the driven browser:** desktop custom run 2151 ms and 2165 ms; mobile historical run **4545 ms**; a mobile custom run whose fetch resource duration was 4372 ms.
- **Against the threshold:** the server half clears 3 s with room to spare, and the desktop client runs sit inside it, but the **mobile runs at 4.4–4.5 s exceed 3 s** as measured — unthrottled, from a dev machine on a preview server. That is the honest state of the cell: a provisional **fail on mobile at these sample sizes**, not a pass pending a proper study. It cannot be called a P95 violation, because no percentile was computed.
- **No P95 is claimed.** 20 samples cannot support a percentile statement, and saying "P95 < 2 s" off this data would be fabrication. The NFR's wording needs a throttled-network, multi-sample study; that half is `[ ]` in §6.3.
- **Decision 4's stated method was partly unavailable here:** its `curl -w` server probe became in-browser `fetch`-wrapper deltas, because curl on this machine fails with `curl: (43)` and the wrapper reads the same response the app does. Logged in the spec's `## Spec Change Log`.
- Method note (this is the part that took the most untangling, so it is recorded): wall timings come from `performance.now()` deltas captured in a wrapped `fetch` plus the response status. `performance.getEntriesByType('resource')` **under-reports in a backgrounded tab** — it stayed at 1 entry while the wrapper counted 2 completed requests, because the tab's `document.hidden === true`. Use the wrapper; do not trust resource entries here.

## 5. Measurement notes — three near-misses worth recording

Kept so a future run doesn't re-file them as bugs:

1. **"The dialog stays open and blocks clicks."** Not true. With `document.hidden === true`, CSS/rAF animations never finish, so Radix's exit animation leaves a stale `[role=dialog]` node in the DOM. Filtering on `data-state === 'open'` — and, later, waiting — showed `dialogs: 0`. A real browser with a visible tab settles.
2. **"Only one request went out."** The resource-timing API under-reports in a hidden tab (see §4). The `fetch` wrapper's counter is the authority.
3. **"Carousel hotspot labels have 1.0:1 contrast."** False. The label span is `bg-black/80 text-white` at `opacity: 0` until hover; my background walk fell through to the page's white body. The real finding isn't the ratio, it's that focus never reveals the label (§2.5).

Harness limit, not a cell: **`take_screenshot` is unavailable** in this environment (`NATIVE_BROWSER_VIEWPORT_UNAVAILABLE`, `visibilityState=hidden`). Every purely visual verdict is therefore owner-side (§6.4); structural, computed-style and geometry measurements were still made programmatically.

## 6. Owner-only run sheet — every `[ ]` cell

Each block names the cell, the tool, and the exact steps. Nothing here is optional-if-you-want-Epic-1-marked-`done`: §3's conditions are §6.1–§6.3.

### 6.1 — Retry panel announced in place? (§2.4, screen reader)

1. Install/enable **NVDA** (Windows, free) or **VoiceOver** (⌘F5 on macOS).
2. `npm run build && npm run preview`, open `http://localhost:4173/predictgame7/predict` with AT running and its verbosity set to speak role + status changes.
3. Tab to the **Series** trigger, Enter, choose any historical row, choose a method, Generate, and wait for the result card.
4. With DevTools open → Network → "Offline" (or block the `predict-game-7` request), press Enter on **Generate** again so the failure panel replaces the result **in place**.
5. **Pass =** AT speaks the retry panel's content (message and the Retry action) without you pressing Tab. Record exactly what was spoken.
6. If it is not spoken, the candidate fix is to move the live-region role onto the element that actually swaps, or to add an explicit `aria-live="polite"` wrapper around the result/error region — a one-line change in `PredictPage.tsx`, **not** a refactor. Do not mark this cell passed on "visually it changes", that is the whole point of the check.
7. **While AT is running, also settle F15 (focus disposition):** press Enter on Generate, wait for the result, then press Tab **once** and note where focus lands. Generate becomes `disabled` while the request is in flight, and if the browser relocates focus to `<body>` at that moment, a keyboard user must re-tab from the top of the page to reach the result actions. jsdom cannot see this and the test suite only pins the `disabled` + no-double-invoke half (`predict-keyboard.test.tsx`). If focus really is lost, move it deliberately on completion (to the result heading or "New Prediction") — do **not** fix it by keeping the button enabled.

### 6.2 — Custom field error read together with its label? (§2.3/§2.4, screen reader)

1. Same AT setup. Tab to the Series trigger, Enter, tab **into the custom grid** and stop on Game 1 Team A's score input.
2. Leave it blank, Tab to Generate, Enter (fill the other five scores first if the method requires them).
3. **Pass =** AT names the field *and* the error, e.g. "Game 1 score, Team A, edit, invalid entry, score is required" — one utterance, not a detached toast.
4. If the error is read as a separate, unrelated announcement, the fix is to point `aria-describedby` from the input at the rendered error `<p>` id for the errored field only. Same shape as the existing contract.
5. Repeat once with `'Nowhere FC'` as a team name to confirm the single naming-warning toast is announced as one event, not four.

### 6.3 — Throttled latency (NFR-P1, §4)

1. Chrome DevTools → Network → **Slow 4G**, Performance → **4× CPU throttling**.
2. Run 20 predictions across all four methods and both axes available (historical + custom), starting from a cold load, then repeat after the app is warm.
3. Record min / median / p95 of *click → result visible* using a `PerformanceObserver` on long tasks plus a timestamp pair around the predict call — or the MutationObserver-on-"Predicted Winner" approach used here.
4. NFR-P1's threshold is what this run decides; 20 unthrottled samples (this file's §4) is not enough to state it.

### 6.4 — Visual pass (screenshots were impossible in this harness)

At 1440 and 390, on `/predict` with (a) nothing selected, (b) a full custom selection, (c) a result, (d) the retry panel; plus Home, Historical, Insights, Maths and the Contact form. Four things to look at specifically, because the numbers flagged them and only a human can judge them:

1. **The focus ring on the three new Predict triggers** (Series header block, Method card, Generate). Tab order and activation are measured; *visibility* of the ring is the half of the frozen keyboard matrix this harness could not see.
2. **The focus ring on the 20×20 carousel dots** on Home — the label is `opacity-0 group-hover` only, so a keyboard user may see nothing at all (§2.5).
3. **Target sizes this story shipped** (F14): the Generate control is 20px tall, and both picker dialogs' Close icons are 16×16. Under WCAG 2.1 AA there is no target-size rule, so this is a comfort call for the owner, not a compliance failure.
4. **Whether the narrowed Series card still feels like one control** (F13): clicking the Games 1–6 readout no longer opens the picker, and that half lost its hover cue. Decide whether the mouse affordance is worth restoring and, if it is, how — a non-semantic `div` with an `onClick` would re-create the pattern F2/F3 just filed against the other pages.

### 6.5 — The un-derivable active-series axis (§2.2)

178/178 series are `status: 'historical'`, so nothing drives `source: 'current'`. Two ways to close the cell, and the choice is the owner's because it touches data, not code: seed one `status: 'active'` row for QA (which pre-empts the enumeration Story 2.x owns and must not silently become the enumeration), or accept the cell as *blocked on Epic 2* and verify it in Story 2.7's simulated playoff week. The second is cleaner; this is where it lands if you pick it: `deferred-work.md` → 2.7.

### 6.6 — Cells already closed during this run, for the record

The four gaps carried over from `qa-manual-checks-1-3.md` are now driven: the literal DevTools-blocked network shape (§2.4), "a preloaded selection survives" (§2.4 `?series=` preload populating CLE vs GSW), the `'Nowhere FC'` single-toast path (§2.4), and the two live method re-runs (bayes, elo — §2.1, §2.3). `qa-manual-checks-1-3.md` needs no re-derivation; this file supersedes it for Epic 1 and keeps its rows.

## 7. Findings register — where each leftover lands

Every item below is filed with an owner story, per the standing rule that nothing gets deferred without a named destination.

| # | Finding | Lands in | Why there |
| --- | --- | --- | --- |
| F1 | Retry/click on a completed result re-issues a prediction (the Decision 2 footgun, reproduced: a second HTTP 200 from clicking the result text) | **Owner decision** — either accept (a re-run *is* the intent) or make the result card non-interactive | Deliberate shipped behavior under Decision 2; not a defect, but nobody should discover it by accident in the playoff window |
| F2 | Historical archive rows keyboard-inert; detail sheet ignores Escape; 32×32 close | **5.2** WCAG verification + remediation | NFR-A1 remediation, not Epic 1 scope |
| F3 | Home carousel: 20×20 hotspot links, focus never reveals the label, Prev/Next appear on hover only, 6 keyboard-inert click strips | **5.2** (+ carousel pattern note for 4.x if the flagship carousel is reworked) | Same |
| F4 | `--muted-foreground` `#808080` on white = **3.95:1**, ≥11 pre-existing nodes — fails WCAG 1.4.3 AA | **5.2** | One token fix unblocks many nodes; the contrast tooling and node list are in this file. Story 1.5's *own* new node (the Generate hint) was moved to the compliant `--on-muted` (`#595959`, 7:1) in the review pass, so this story ships no new failing node — the sweep of the older ones stays 5.2's |
| F5 | `document.title === ""` on all five routed pages; three `<h1>` per page (measured at rest, both widths; four with the mobile sheet open) | **5.2** | 2.4.2 and 1.3.1/2.4.6; cheap, cross-page. The cheapest half — a static `<title>` in `index.html` — needs no component work |
| F6 | Unknown deep links silently redirect to Home; `NotFound.tsx` unreachable | **4.1** series deep links + 404 SPA fallback | Already 4.1's title |
| F7 | `insights_cache` "8 historical Game 7s" vs 1246 score rows / 178 Game-7 series | **2.5** insights cache refresh | Cache refresh *is* that story |
| F8 | `prediction_methods` slugs (`bayesian`, `ensemble_v1`, `margin_model_v1`) don't overlap the contract's `MethodSlug` set | **Epic 2** (2.2 schema prerequisites), noted for 2.4 | Becomes load-bearing the day the catalog gains a read path |
| F9 | No active series exists → the `source: 'current'` branch is un-exercisable | **2.7** if the owner picks §6.5's second option | Pipeline owns `series.status`; Story 1.5 must not define it |
| F10 | Contact form validated only by native `required` | **3.3** contact form feedback | 3.3's scope statement already covers it |
| F11 | `supabase/functions/**` is type-checked by nothing — **pre-existing D1, not a new finding**; this run only re-confirmed the deployed shape by hand (20 probes, all 11 keys) | D1 thread, unchanged | No automated live-shape probe exists yet, so the next drift is still invisible |
| F12 | Harness facts for the next QA run: no screenshots available, resource-timing under-reports in a hidden tab, stale `[role=dialog]` nodes under `document.hidden` | §5 of this file (no code landing) | Recorded so the next matrix run starts from the measurements, not the misreadings |
| F13 | Narrowing the Series trigger also narrowed the **mouse** target: the Games 1–6 readout no longer opens the picker and lost its hover cue | **Owner decision**, alongside F1 | Follows from frozen Decision 1; restoring it by `div`-with-`onClick` would re-create F2/F3's pattern |
| F14 | Target sizes on surfaces this story shipped: Generate control 20px tall, picker dialog Close icons 16×16 | **5.2** (+ §6.4 eyeball) | WCAG 2.1 AA sets no target-size rule, so this is comfort, not compliance — filed so 5.2's list isn't missing the Epic-1 instances |
| F15 | What happens to focus when the focused Generate becomes `disabled` mid-request is unverified in jsdom and in this harness | **§6.1 step 7**, owner keyboard pass | If focus is lost to `<body>`, the keyboard user re-tabs from the top; `maybe-false`, medium if true |

## 8. Re-run summary

`npm run gate` green at the final state (lint, `tsc -b`, **114 tests / 11 files**, build keeping the `/predictgame7/` prefix — 106 tests / 10 files before this story). The `predict-keyboard.test.tsx` suite was mutation-checked while it held 7 tests: making the Series trigger unfocusable again reddened exactly the three tests that own that surface and left the other four green. The review pass then added an 8th test (in-flight Generate stays disabled and cannot double-fire), so the mutation has not been re-run against the 8-test file. Then §1's URLs. Total interactive driving time for the whole matrix, once the picker mechanics are known: roughly 25 minutes without AT, plus one AT pass over §6.1–§6.2 and one throttled run for §6.3.
