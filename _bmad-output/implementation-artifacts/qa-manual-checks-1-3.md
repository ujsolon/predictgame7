# Story 1.3 — Manual Browser QA

Owner-side checks that no automated gate can prove. Nothing here is deployed work: run against a local dev server (`npm run dev`, then the `/predictgame7/` URL it prints — restart the server if `.env` changed).

Pass any line and this file can be deleted; fail one and reopen `spec-1-3-error-states-that-never-lose-your-place-fr-8.md` (it sits at `review` in `sprint-status.yaml`). The corresponding code-level tests already exist in `src/pages/__tests__/predict-error-states.test.tsx` — these checks are for the parts jsdom cannot see: real keyboard focus order, real screen-reader announcement, real network shapes.

Checks 1–3 were driven in a real browser on 2026-09-28 against `npm run preview`, with `window.fetch` patched to substitute wire shapes. The evidence is recorded inline. Two facts found while driving them change how check 4 must be run, and are noted there.

## 1. Offline transport panel + keyboard Retry

Setup: DevTools → Network → throttle preset **Offline** (before predicting). Pick a series + method, or fill a custom matchup, then generate. (In the agent run there is no DevTools throttling, so the same shape was forged from Console: `window.fetch` rejected with `new TypeError('Failed to fetch')` for the `predict-game-7` URL.)

- [x] Result region swaps in place for "Couldn't generate the prediction." / "Couldn't reach the prediction service. It may be briefly unavailable." — no raw JSON, and the series/method pickers above still show the selection.
- [x] Back Online. In Console, `document.activeElement.getAttribute('role')` → `status` (focus landed on the panel itself).
- [ ] Tab once → Retry focused. `Enter` → spinner, then a result, with the same series/method/scores as the failed attempt. — **Tab half passes** (one Tab from the panel lands on `BUTTON` "Retry"). **Enter half unproven in the agent run**: the keypress reached the page but did not fire the request through the fetch patch, so it proves nothing either way — the click path *was* proven (Retry cleared the panel and produced 70.47% / 29.53%). Re-run this line by hand.
- [ ] Screen reader (NVDA/VoiceOver): the swap is announced without moving focus manually. — **owner-only**; no AT in the agent's browser.

## 2. A `400` whose body is the server's own string

DevTools request blocking only cancels a request — it cannot forge a status and body, so patch `fetch` from Console and then generate:

```js
const f = window.fetch;
window.fetch = (u, o) => String(u).includes('predict-game-7')
  ? Promise.resolve(new Response(JSON.stringify({ error: 'Team names are required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }))
  : f(u, o);
```

- [x] Panel line reads exactly `Team names are required` — not `{"error":"..."}`.
- [x] Same patch, body `JSON.stringify({ win_probability_a: null })` at status `200` → "The prediction service returned an unreadable result." and never `undefined%`. (Also verified `null%` and `NaN%` absent.)
- [x] Same patch, body `'boom'` with `Content-Type: text/plain` at status `200` → the same unreadable line, not a blank card.
- [x] Reload the page to clear the patch.

## 3. Blank scores in custom mode

Setup: series picker → Custom Matchup. Leave team A's name and two scores empty; keep the Network tab filtered to `predict-game-7` visible.

- [x] No request goes out at all. (Fetch counter stayed at 0 for the whole invalid-submit sequence.)
- [x] No toast anywhere; a red error line under exactly those three fields, and the filled fields stay clean. (`Team name is required` + two `Score is required`; toast region stayed empty; `aria-invalid=true` and `aria-describedby=<field>-error` on exactly those three inputs and on none of the eleven filled ones.)
- [!] `Tab` from the Generate button lands focus on the **first** invalid field; a screen reader reads its label plus the error text (`aria-describedby` wiring). — **This line is not runnable as written, and the substitute behaviour passes.** The focus move *is* automatic: with focus on the last score input, an invalid submit moved `document.activeElement` to the first invalid field (Team A name) with no Tab press. But the Generate control is not in the tab ring to press Tab *from*: it is a `DIV` with `tabIndex=-1` and no `role`, as are the Series and Method pickers. The full tab ring on `/predict` measured 5 nav/menu stops + the 14 inputs, nothing else — a keyboard-only user cannot open a picker or predict at all. That is the `deferred-work.md` keyboard-accessibility entry (Story 1.5 owns the fix), confirmed here a second time. `aria-describedby` wiring is present; whether an AT reads it is still owner-only.
- [x] Fix those three and submit → errors clear and the request fires. (Errors went to 0, counter to 1, and the live function returned MIA 58.9% / BOS 41.1%.)

## 4. Blocked series fetch — both panels

Setup: DevTools → Network → shield icon → block the URL pattern `*/rest/v1/series*`, then hard-reload `/predictgame7/predict`.

Two facts from the agent run change what this setup actually exercises:

1. **The archive is one request, made at mount.** `/predict` issues a single `GET /rest/v1/series?select=id,year,round,…` when the page mounts and filters decade → year → series **client-side**; drilling through the picker afterwards makes no request at all. So "block, then open the picker" only shows the panel if the *mount* fetch failed — blocking at any later point is a no-op, and a green-looking picker proves nothing.
2. **Therefore the reload in the setup is load-bearing, and it also kills the Console-patch route for the preload lines.** Checks 1–3 above were driven with a patched `fetch`, which does survive client-side navigation: patch → click Home → click Predict remounts the page with the block still on, and that is enough to drive the first two lines below. A full reload wipes the patch, so the `?series=` lines need real DevTools request blocking (or an init script) and stay owner-side.

- [x] **Picker body:** opening the series picker shows "Couldn't load the series list." with "Retry fetches the archive again. Your current selection stays put." — not an empty decade list. (Driven by the patch → remount route above.)
- [x] Turn blocking off, click that panel's Retry → list repopulates; a preloaded selection survives. — repopulates: yes, one fresh `rest/v1/series` request and the decade grid came back. **Preloaded selection survives: not covered** — the agent run had no `?series=` preload (see fact 2), so only the fetch half of this line is proven.
- [ ] **Preload:** with blocking still on, reload `/predictgame7/predict?series=<a real series id>` → result region shows "Couldn't load this series." / "Retry fetches it again." and **no** "Series not found" toast (a genuinely missing row keeps the toast; a failed fetch does not). — owner-side. A real id for the local/prod data: `09d16ca2-8d45-4506-ba58-7e0f023aff48` (2026, Eastern Conf Semifinals).
- [ ] **The regression the review caught:** with that preload panel showing, turn blocking off, pick a series and method by hand and predict → the panel must be gone and the result visible. If "Couldn't load this series." still masks the result, that is the bug fixed in review row 1 of the spec's triage log — report it. — owner-side (needs the `?series=` preload). The nearest proven thing is check 1's recovery: from the *transport* error panel, Retry cleared the panel and rendered a real result in its place, so the "panel masks the result" failure mode did not reproduce on that panel.

## Result log

| Date | Checker | Outcome |
|---|---|---|
| 2026-09-28 | agent (browser-use, `npm run preview` + patched `fetch`) | Checks 1–3 pass on every line that a headless driver can reach; check 4 passes its first two lines. Still open: Enter-activation of Retry, all screen-reader lines, check 3's Tab-from-Generate (unrunnable — see finding), and check 4's two `?series=` preload lines. New finding filed to `deferred-work.md`: the Series/Method/Predict surfaces are outside the tab ring. |
| | | |
