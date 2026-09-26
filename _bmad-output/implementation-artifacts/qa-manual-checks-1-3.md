# Story 1.3 — Manual Browser QA (PARKED)

Owner-side checks that no automated gate can prove. Nothing here is deployed work: run against a local dev server (`npm run dev`, then the `/predictgame7/` URL it prints — restart the server if `.env.local` changed).

Pass any line and this file can be deleted; fail one and reopen `spec-1-3-error-states-that-never-lose-your-place-fr-8.md` (it sits at `review` in `sprint-status.yaml`). The corresponding code-level tests already exist in `src/pages/__tests__/predict-error-states.test.tsx` — these checks are for the parts jsdom cannot see: real keyboard focus order, real screen-reader announcement, real network shapes.

## 1. Offline transport panel + keyboard Retry

Setup: DevTools → Network → throttle preset **Offline** (before predicting). Pick a series + method, or fill a custom matchup, then generate.

- [ ] Result region swaps in place for "Couldn't generate the prediction." / "Couldn't reach the prediction service. It may be briefly unavailable." — no raw JSON, and the series/method pickers above still show the selection.
- [ ] Back Online. In Console, `document.activeElement.getAttribute('role')` → `status` (focus landed on the panel itself).
- [ ] `Tab` once → Retry focused. `Enter` → spinner, then a result, with the same series/method/scores as the failed attempt.
- [ ] Screen reader (NVDA/VoiceOver): the swap is announced without moving focus manually.

## 2. A `400` whose body is the server's own string

DevTools request blocking only cancels a request — it cannot forge a status and body, so patch `fetch` from Console and then generate:

```js
const f = window.fetch;
window.fetch = (u, o) => String(u).includes('predict-game-7')
  ? Promise.resolve(new Response(JSON.stringify({ error: 'Team names are required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }))
  : f(u, o);
```

- [ ] Panel line reads exactly `Team names are required` — not `{"error":"..."}`.
- [ ] Same patch, body `JSON.stringify({ win_probability_a: null })` at status `200` → "The prediction service returned an unreadable result." and never `undefined%`.
- [ ] Same patch, body `'boom'` with `Content-Type: text/plain` at status `200` → the same unreadable line, not a blank card.
- [ ] Reload the page to clear the patch.

## 3. Blank scores in custom mode

Setup: series picker → Custom Matchup. Leave team A's name and two scores empty; keep the Network tab filtered to `predict-game-7` visible.

- [ ] No request goes out at all.
- [ ] No toast anywhere; a red error line under exactly those three fields, and the filled fields stay clean.
- [ ] `Tab` from the Generate button lands focus on the **first** invalid field; a screen reader reads its label plus the error text (`aria-describedby` wiring).
- [ ] Fix those three and submit → errors clear and the request fires.

## 4. Blocked series fetch — both panels

Setup: DevTools → Network → shield icon → block the URL pattern `*/rest/v1/series*`, then hard-reload `/predictgame7/predict`.

- [ ] **Picker body:** opening the series picker shows "Couldn't load the series list." with "Retry fetches the archive again. Your current selection stays put." — not an empty decade list.
- [ ] Turn blocking off, click that panel's Retry → list repopulates; a preloaded selection survives.
- [ ] **Preload:** with blocking still on, reload `/predictgame7/predict?series=<a real series id>` → result region shows "Couldn't load this series." / "Retry fetches it again." and **no** "Series not found" toast (a genuinely missing row keeps the toast; a failed fetch does not).
- [ ] **The regression the review caught:** with that preload panel showing, turn blocking off, pick a series and method by hand and predict → the panel must be gone and the result visible. If "Couldn't load this series." still masks the result, that is the bug fixed in review row 1 of the spec's triage log — report it.

## Result log

| Date | Checker | Outcome |
|---|---|---|
| | | |
