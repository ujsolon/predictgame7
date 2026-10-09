// Story 4.7 analytics property walk (acceptance row 5, "measurement continuity"):
// a real headless-Chrome walk that fires every addendum §A.1 event — plus Story
// 4.4's `prediction_shared` and Story 4.0's archive reset — and decodes each
// payload LOCALLY, so the property keys, value types and firing counts are read
// from the wire rather than inferred from a PostHog listing.
//
// Usage:
//   node scripts/probe-analytics-walk.mjs https://ujsolon.github.io/predictgame7/
//   node scripts/probe-analytics-walk.mjs http://localhost:4317/predictgame7/   # vite preview
//
// Needs `.env` (VITE_POSTHOG_HOST, VITE_SUPABASE_URL). Exit: 0 = GREEN (every
// row held); 1 = RED (any FAIL, a safety proof that did not hold, or the harness
// could not run).
//
// SAFETY — what this probe sends where:
//   * PostHog: every request to `*posthog*` and to VITE_POSTHOG_HOST is answered
//     inside Chrome by `openBrowserSession` (CDP Fetch) and decoded; nothing is
//     forwarded. The probe FAILS CLOSED: it refuses to start unless the live
//     bundle names the same PostHog host the interception is keyed on, it stops
//     after Home if no event was decoded locally or any request to a guarded
//     host was not answered locally, and it re-checks every guarded request at
//     the end (each Network-level request id must be one the stub fulfilled).
//   * handle-contact: `stubContact: true` answers `*/functions/v1/handle-contact*`
//     (preflight and POST) locally — no mail, no `contact_submissions` row. Before
//     the form is submitted, an in-page fetch to that URL must come back carrying
//     the stub's `X-Probe-Stub` header and be logged by the stub; otherwise the
//     contact step is SKIPPED and recorded as a FAIL. The form gets synthetic
//     values only ("Probe Walk", probe@example.invalid).
//   * predict-game-7: ONE live call (Generate on the hotspot's series). The
//     function is stateless and writes nothing.
//   * Supabase REST reads (the app's own anon reads) run live and unmodified.
//
// The property contract is the `track(...)` call site in `src/**`: the probe
// finds every call site at run time (file:line printed), extracts the literal
// property keys from it, and requires (1) the decoded app-level keys of each
// event to equal those keys exactly, (2) those keys to equal the contract table
// below (so a call-site edit turns this probe red until the table is reviewed),
// and (3) each value's type / enum to match. SDK-added keys (`$`-prefixed, plus
// the non-`$` keys every `$pageview` also carries, e.g. `token`, `distinct_id`)
// are excluded from "app-level".

import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createLedger, openBrowserSession } from "./measure-predict-latency.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const METHODS = ["logistic_regression", "bayes", "elo", "exponential_smoothing"];
const str = (v) => typeof v === "string" && v.length > 0;
const num = (v) => typeof v === "number" && Number.isFinite(v);
const oneOf = (list) => (v) => list.includes(v);
const uuid = (v) => typeof v === "string" && UUID.test(v);

/** The 2025 Finals flagship hotspot on Home (HomePage.tsx hotspot list). */
const HOTSPOT = { caption: "Thunder vs Pacers, 2025", seriesId: "626257bc-1678-4c88-84a6-37e0a6cdb49c" };

/**
 * The property contract, restated from the call sites. `variant` splits one
 * event name whose call sites carry different keys (historical_filter_applied).
 */
const CONTRACT = {
  banner_hotspot_clicked: { keys: { caption: str, series_id: uuid } },
  series_selected: {
    keys: { series_id: uuid, series_year: num, series_round: str, series_source: oneOf(["current", "historical"]), team_a: str, team_b: str },
  },
  custom_series_selected: { keys: {} },
  prediction_method_selected: { keys: { method: oneOf(METHODS) } },
  prediction_generated: {
    keys: {
      method: oneOf(METHODS),
      series_source: oneOf(["current", "historical", "custom"]),
      series_id: uuid,
      series_year: num,
      predicted_winner: str,
      win_probability_a: num,
      win_probability_b: num,
      confidence_level: oneOf(["High", "Medium", "Low"]),
    },
  },
  detailed_analysis_viewed: { keys: { method: oneOf(METHODS), series_id: uuid } },
  prediction_shared: { keys: { surface: oneOf(["predict", "series"]), kind: oneOf(["series", "custom"]), channel: oneOf(["native", "clipboard"]) } },
  prediction_reset: { keys: {} },
  "historical_filter_applied/year": { keys: { filter_type: oneOf(["year"]), year: str } },
  "historical_filter_applied/team_search": { keys: { filter_type: oneOf(["team_search"]) } },
  "historical_filter_applied/reset": { keys: { filter_type: oneOf(["reset"]) } },
  historical_series_expanded: {
    keys: { series_id: uuid, series_year: num, series_round: str, team_a: str, team_b: str, winner: str },
  },
  contact_form_submitted: { keys: {} },
};

/** §A.1's ten names, verbatim (addendum §A.1 / `events.ts`'s first ten). */
const A1 = [
  "prediction_generated",
  "series_selected",
  "custom_series_selected",
  "prediction_method_selected",
  "detailed_analysis_viewed",
  "prediction_reset",
  "banner_hotspot_clicked",
  "contact_form_submitted",
  "historical_series_expanded",
  "historical_filter_applied",
];

function readEnv(file = ".env") {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.includes("=") || line.trimStart().startsWith("#")) continue;
    const i = line.indexOf("=");
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

// ---------------------------------------------------------------------------
// Call sites: every `track(EVENTS.X…)` in src/** (tests excluded), with the
// literal property keys of its object argument.
// ---------------------------------------------------------------------------

function walkFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      walkFiles(p, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

/** Top-level keys of an object-literal source `{ a, b: x ? 'y' : 'z', c: f(d, e) }`. */
function objectKeys(src) {
  const inner = src.trim().replace(/^\{/, "").replace(/\}$/, "");
  const parts = [];
  let depth = 0;
  let quote = null;
  let cur = "";
  for (const ch of inner) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") quote = ch;
    if ("([{".includes(ch)) depth++;
    if (")]}".includes(ch)) depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const m = /^([A-Za-z_$][\w$]*)\s*(:|$)/.exec(p);
      return m ? m[1] : `?${p}`;
    });
}

function readCallSites(root) {
  const eventsSrc = readFileSync(join(root, "src/lib/analytics/events.ts"), "utf8");
  const nameOf = {};
  for (const m of eventsSrc.matchAll(/^\s*([A-Z_]+):\s*'([a-z_]+)'/gm)) nameOf[m[1]] = m[2];
  const sites = [];
  for (const file of walkFiles(join(root, "src"))) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/track\(EVENTS\.([A-Z_]+)/g)) {
      const line = text.slice(0, m.index).split("\n").length;
      let rest = text.slice(m.index + m[0].length).trimStart();
      let keys = [];
      if (rest.startsWith(",")) {
        rest = rest.slice(1).trimStart();
        if (rest.startsWith("{")) {
          let depth = 0;
          let end = 0;
          for (let i = 0; i < rest.length; i++) {
            if (rest[i] === "{") depth++;
            if (rest[i] === "}" && --depth === 0) {
              end = i + 1;
              break;
            }
          }
          keys = objectKeys(rest.slice(0, end));
        } else keys = ["?non-literal props"];
      }
      const filterType = /filter_type:\s*'([a-z_]+)'/.exec(rest.slice(0, 200))?.[1] ?? null;
      sites.push({
        constName: m[1],
        event: nameOf[m[1]] ?? `?${m[1]}`,
        file: relative(root, file).replace(/\\/g, "/"),
        line,
        keys,
        filterType,
      });
    }
  }
  return sites;
}

// ---------------------------------------------------------------------------
// In-page helpers (plain source strings; they run inside Chrome).
// ---------------------------------------------------------------------------

const WAIT = `(async (fn, what, timeout) => {
  const t0 = Date.now();
  for (;;) {
    let v; try { v = fn(); } catch { v = null; }
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error("timed out waiting for " + what);
    await new Promise((r) => setTimeout(r, 50));
  }
})`;

const findButton = (pattern) => `Array.from(document.querySelectorAll("button")).find((b) => ${pattern}.test(b.textContent || ""))`;

/** The center of the first element `selectorExpr` returns, scrolled into view. */
const centerOf = (expr, what, timeout = 30000) => `${WAIT}(() => {
  const el = ${expr};
  if (!el) return null;
  el.scrollIntoView({ block: "center" });
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, ${JSON.stringify(what)}, ${timeout})`;

/** Fill an input/textarea the way React sees typing (native value setter + input event). */
const SET_VALUE = `((sel, value) => {
  const el = document.querySelector(sel);
  if (!el) throw new Error("no element " + sel);
  const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
})`;

/** Story 4.4: no native sheet, and the clipboard captured (same stub as probe-deep-links row 12). */
const STUB_SHARE_TARGETS = `(() => {
  window.__pg7Shared = [];
  Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: (text) => { window.__pg7Shared.push(text); return Promise.resolve(); } },
    configurable: true,
  });
  return true;
})()`;

/** A visible in-app nav link to `path` ("" = Home), clicked as a SPA navigation. */
const navLink = (base, path) => `Array.from(document.querySelectorAll("a")).find((a) => {
  const href = a.getAttribute("href");
  return (href === ${JSON.stringify(`${base}${path}`)} || href === ${JSON.stringify(`${base}${path}`.replace(/\/$/, ""))}) && a.offsetParent !== null;
})`;

// ---------------------------------------------------------------------------

function appKeys(props, sdkKeys) {
  return Object.keys(props || {})
    .filter((k) => !k.startsWith("$") && !sdkKeys.has(k))
    .sort();
}

async function main() {
  const args = process.argv.slice(2);
  const baseArg = args.find((a) => !a.startsWith("--"));
  if (!baseArg || args.includes("--help") || args.includes("-h")) {
    console.log("usage: node scripts/probe-analytics-walk.mjs <base-url>");
    if (!baseArg) process.exitCode = 1;
    return;
  }
  const base = baseArg.endsWith("/") ? baseArg : `${baseArg}/`;
  const basePath = new URL(base).pathname;
  const root = resolve(fileURLToPath(import.meta.url), "../..");
  const env = readEnv(join(root, ".env"));
  const L = createLedger();
  console.log(`Story 4.7 analytics property walk — ${base}  (${new Date().toISOString()})\n`);

  // --- Pre-flight: the bundle, and the fail-closed PostHog host check. ---
  const analyticsHost = env.VITE_POSTHOG_HOST;
  if (!analyticsHost) throw new Error("refusing to run: no VITE_POSTHOG_HOST in .env — the interception could not be keyed on the production host");
  if (!env.VITE_SUPABASE_URL) throw new Error("refusing to run: no VITE_SUPABASE_URL in .env (needed to prove the handle-contact stub)");
  const html = await (await fetch(base)).text();
  const bundle = /assets\/(index-[\w-]+\.js)/.exec(html)?.[1];
  if (!bundle) throw new Error(`no index-*.js in ${base}`);
  const bundleSrc = await (await fetch(new URL(`assets/${bundle}`, base))).text();
  const hostInBundle = bundleSrc.includes(analyticsHost.replace(/\/$/, ""));
  console.log(`     site bundle: ${bundle} (${bundleSrc.length} bytes)`);
  L.check(`safety: the live bundle's PostHog host is the intercepted one (${analyticsHost})`, hostInBundle);
  if (!hostInBundle) {
    console.log("\nRED: refusing to walk — the site may send events to a host this probe does not intercept.");
    process.exitCode = 1;
    return;
  }

  // --- Call sites (the property contract). ---
  const sites = readCallSites(root);
  const contractKeyOf = (site) =>
    site.event === "historical_filter_applied" ? `historical_filter_applied/${site.filterType}` : site.event;
  console.log("\n     track() call sites in src/**:");
  for (const s of sites) console.log(`       ${s.event.padEnd(28)} ${`${s.file}:${s.line}`.padEnd(42)} {${s.keys.join(", ")}}`);
  for (const s of sites) {
    const c = CONTRACT[contractKeyOf(s)];
    const expected = c ? Object.keys(c.keys).sort().join(",") : null;
    L.check(
      `contract: ${s.file}:${s.line} (${contractKeyOf(s)}) carries the keys this probe asserts`,
      !!c && [...s.keys].sort().join(",") === expected,
      c ? `code {${s.keys.join(", ")}} vs probe {${expected}}` : "no contract row — review and add one"
    );
  }
  const namesInCode = new Set(sites.map((s) => s.event));
  for (const name of [...A1, "prediction_shared"]) L.check(`contract: ${name} has a call site in src/**`, namesInCode.has(name));

  const S = await openBrowserSession({ viewport: "1440x900", analyticsHost, stubContact: true });
  const observed = []; // { key, event, props, site }
  const sdkKeys = new Set();
  const leaks = () =>
    S.guardedTraffic.filter((r) => !S.fulfilledNetworkIds.has(r.requestId));
  const clickAt = async (box) => {
    await S.cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y });
    for (const type of ["mousePressed", "mouseReleased"]) {
      await S.cdp.send("Input.dispatchMouseEvent", { type, x: box.x, y: box.y, button: "left", clickCount: 1 });
    }
  };
  /** Run `action`, then wait for `event` (matching `pred`) decoded after the mark. */
  const step = async (key, event, action, pred = () => true, timeoutMs = 30000) => {
    const mark = S.analytics.length;
    try {
      await action();
    } catch (e) {
      L.check(`${key}: drive the UI to fire it`, false, e.message);
      return null;
    }
    const hit = await S.waitForAnalytics((e) => S.analytics.indexOf(e) >= mark && e.event === event && pred(e.properties), timeoutMs);
    if (!hit) {
      L.check(`${key}: decoded locally`, false, `no ${event} after the action (decoded since: ${S.analytics.slice(mark).map((e) => e.event).join(", ") || "none"})`);
      return null;
    }
    observed.push({ key, event, props: hit.properties });
    return hit;
  };

  let walkError = null;
  try {
    // 1. Home: interception proven before anything is clicked.
    await S.navigate(base);
    const pv = await S.waitForAnalytics((e) => e.event === "$pageview", 30000);
    L.check("safety: PostHog is answered locally — the landing $pageview was decoded in-probe", !!pv);
    if (pv) for (const k of Object.keys(pv.properties)) if (!k.startsWith("$")) sdkKeys.add(k);
    console.log(`     non-$ keys on the landing $pageview: ${[...sdkKeys].join(", ") || "none"}`);
    const early = leaks();
    L.check(
      `safety: every request to a guarded host so far was answered locally (${S.guardedTraffic.length} seen)`,
      early.length === 0,
      early.map((r) => `${r.method} ${r.url} [${r.type}] ip=${r.remoteIPAddress}`).join(" | ")
    );
    if (!pv || early.length) throw new Error("safety proof failed after Home — walk aborted");

    // 2. banner_hotspot_clicked — a real click on the 2025 Finals hotspot.
    await step(
      "banner_hotspot_clicked",
      "banner_hotspot_clicked",
      async () => {
        const box = await S.evaluate(centerOf(`document.querySelector('a[href$="/predict?series=${HOTSPOT.seriesId}"]')`, "the 2025 hotspot"));
        await clickAt(box);
      },
      (p) => p.series_id === HOTSPOT.seriesId
    );

    // 3. Predict, the hotspot's preloaded series: method → Generate → details → Share → New Prediction.
    await S.evaluate(`${WAIT}(() => /\\/predict\\/?$/.test(location.pathname) && !!${findButton("/Click to choose method|Not selected/i")}, "Predict with the method trigger", 60000)`);
    await S.evaluate(`${WAIT}(() => !!${findButton("/ vs /")}, "the preloaded series", 60000)`);
    await step("prediction_method_selected", "prediction_method_selected", () => S.evaluate("window.__p1SelectMethod(/Elo Rating/, 15000)"));
    const sentBefore = S.predictRequests.length;
    await step("prediction_generated", "prediction_generated", () => S.evaluate("window.__p1RunSample(60000)"), () => true, 60000);
    L.check("predict-game-7: exactly one live call for the generate step", S.predictRequests.length - sentBefore === 1, `${S.predictRequests.length - sentBefore} call(s)`);
    await step("detailed_analysis_viewed", "detailed_analysis_viewed", async () => {
      await S.evaluate(`${WAIT}(() => !!${findButton("/View Detailed Analysis/")}, "View Detailed Analysis", 30000)`);
      await S.evaluate(`${findButton("/View Detailed Analysis/")}.click(), true`);
      await S.evaluate(`${WAIT}(() => (document.body.textContent || "").includes("Prediction Result"), "the detailed view", 30000)`);
    });
    await step("prediction_shared", "prediction_shared", async () => {
      await S.evaluate(STUB_SHARE_TARGETS);
      const box = await S.evaluate(centerOf(`document.querySelector("[data-share-button]")`, "the Share button"));
      await clickAt(box);
      await S.evaluate(`${WAIT}(() => window.__pg7Shared && window.__pg7Shared[0], "the copied URL", 15000)`);
    });
    const copied = await S.evaluate("window.__pg7Shared && window.__pg7Shared[0]").catch(() => null);
    console.log(`     share copied (stubbed clipboard): ${copied}`);
    await step("prediction_reset", "prediction_reset", async () => {
      await S.evaluate(`${findButton("/^\\s*New Prediction\\s*$/")}.click(), true`);
      await S.evaluate(`${WAIT}(() => !!${findButton("/Select a Series|Click to choose series/i")}, "the cleared series trigger", 15000)`);
    });

    // 4. series_selected — picker dialog: decade → year → series.
    await step("series_selected", "series_selected", async () => {
      const picked = await S.evaluate(`(async () => {
        const H = window.__p1;
        await window.__drill.openSeriesDialog();
        const decade = await H.clickDialogOption(/^\\s*2020s/, "decade 2020s", 30000);
        await H.waitFor(() => /Select Year from/.test(H.text(document.querySelector('[role="dialog"]'))), "the year level", 15000);
        const year = await H.clickDialogOption(/^\\s*2025/, "year 2025", 15000);
        await H.waitFor(() => /Select Series from/.test(H.text(document.querySelector('[role="dialog"]'))), "the series level", 15000);
        const series = await H.clickDialogOption(/ vs /, "a series option", 15000);
        await H.waitFor(() => !document.querySelector('[role="dialog"]'), "the dialog to close", 15000);
        return { decade, year, series };
      })()`);
      console.log(`     picker: ${JSON.stringify(picked)}`);
    });

    // 5. custom_series_selected — the picker's Custom Matchup.
    await step("custom_series_selected", "custom_series_selected", () =>
      S.evaluate(`(async () => {
        // With a series selected the trigger reads its matchup ("OKC vs IND …"), which
        // __p1.trigger("series") does not match, so it is found by either text.
        const t = await window.__p1.waitFor(
          () => Array.from(document.querySelectorAll("button")).find((b) => !b.closest('[role="dialog"]') && /Select a Series|Click to choose series| vs /.test(b.textContent || "")),
          "the series trigger", 15000);
        t.click();
        await window.__p1.dialogOpen();
        await window.__p1.clickDialogOption(/Custom Matchup/, "Custom Matchup", 15000);
        await window.__p1.waitFor(() => !document.querySelector('[role="dialog"]') && document.getElementById("team_a"), "the custom form", 15000);
        return true;
      })()`)
    );

    // 6. Historical (SPA nav): year filter, team search, the icon-only reset, a row expand.
    await S.evaluate(`(${navLink(basePath, "historical")}).click(), true`);
    await S.evaluate(`${WAIT}(() => document.querySelectorAll("tbody tr td").length > 3, "archive rows", 60000)`);
    await step(
      "historical_filter_applied/year",
      "historical_filter_applied",
      async () => {
        const trigger = await S.evaluate(centerOf(`document.querySelector('button[role="combobox"]')`, "the year Select trigger"));
        await clickAt(trigger);
        // Keyboard, not a second click: the pointer resting on Radix's scroll arrow
        // auto-scrolls the list under it (measured: a click aimed at 2016 selected 2020).
        await S.evaluate(`${WAIT}(() => {
          const o = Array.from(document.querySelectorAll('[role="option"]')).find((x) => /^\\s*2016\\s*$/.test(x.textContent || ""));
          if (!o) return false;
          o.focus();
          return document.activeElement === o;
        }, "the focused 2016 option", 15000)`);
        for (const type of ["keyDown", "keyUp"]) {
          await S.cdp.send("Input.dispatchKeyEvent", { type, key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
        }
      },
      (p) => p.filter_type === "year"
    );
    const yearEv = observed.find((o) => o.key === "historical_filter_applied/year");
    if (yearEv) L.check('historical_filter_applied/year carries the picked year ("2016")', yearEv.props.year === "2016", JSON.stringify(yearEv.props.year));
    await step(
      "historical_filter_applied/team_search",
      "historical_filter_applied",
      () => S.evaluate(`${SET_VALUE}('input[placeholder^="Search by team"]', "Cavaliers")`),
      (p) => p.filter_type === "team_search"
    );
    await step(
      "historical_filter_applied/reset",
      "historical_filter_applied",
      async () => {
        const box = await S.evaluate(
          centerOf(
            `Array.from(document.querySelectorAll("button")).find((b) => (b.textContent || "").trim() === "" && b.querySelector("svg") && /hover:text-destructive/.test(b.className))`,
            "the icon-only reset button"
          )
        );
        await clickAt(box);
      },
      (p) => p.filter_type === "reset"
    );
    await step("historical_series_expanded", "historical_series_expanded", async () => {
      await S.evaluate(`${WAIT}(() => document.querySelectorAll("tbody tr td").length > 3, "archive rows after reset", 15000)`);
      const box = await S.evaluate(centerOf(`document.querySelector("tbody tr")`, "the first archive row"));
      await clickAt(box);
    });
    await S.evaluate(`(() => { const b = ${findButton("/Close/")}; b && b.click(); return true; })()`);

    // 7. Home (SPA nav): contact form, only once the handle-contact stub is proven.
    await S.evaluate(`(${navLink(basePath, "")}).click(), true`);
    await S.evaluate(`${WAIT}(() => !!(document.querySelector("form #name") && document.querySelector("form #message")), "the contact form", 30000)`);
    const contactUrl = `${env.VITE_SUPABASE_URL.replace(/\/$/, "")}/functions/v1/handle-contact`;
    const callsBefore = S.contactCalls.length;
    // A preflighted POST (custom header) so the stub's OPTIONS answer is exercised too.
    // Should the stub somehow not engage, this body has no name/email and the real
    // function rejects it with a 400 before sending anything.
    const proof = await S.evaluate(`(async () => {
      try {
        const r = await fetch(${JSON.stringify(contactUrl)}, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Probe": "stub-check" },
          body: JSON.stringify({ probe: "stub-check" }),
        });
        return { status: r.status, stub: r.headers.get("X-Probe-Stub"), body: await r.text() };
      } catch (e) { return { error: String(e) }; }
    })()`);
    const proofCalls = S.contactCalls.slice(callsBefore);
    const stubProven =
      !proof.error &&
      proof.status === 200 &&
      proof.stub === "handle-contact" &&
      proof.body === JSON.stringify({ message: "Success" }) &&
      proofCalls.some((c) => c.method === "OPTIONS") &&
      proofCalls.some((c) => c.method === "POST" && /stub-check/.test(c.body || ""));
    console.log(`     contact stub proof: ${JSON.stringify(proof)}; stub log: ${proofCalls.map((c) => c.method).join(", ")}`);
    L.check("safety: handle-contact is answered by the local stub (preflight + POST, X-Probe-Stub header)", stubProven);
    if (!stubProven) {
      L.check("contact_form_submitted: SKIPPED — the stub could not be proven, so no form was submitted", false);
    } else {
      const postsBefore = S.contactCalls.filter((c) => c.method === "POST").length;
      await step("contact_form_submitted", "contact_form_submitted", async () => {
        await S.evaluate(`${SET_VALUE}("form #name", "Probe Walk")`);
        await S.evaluate(`${SET_VALUE}("form #email", "probe@example.invalid")`);
        await S.evaluate(`${SET_VALUE}("form #message", "Automated analytics probe (Story 4.7). Answered locally; not a real message.")`);
        await S.evaluate(`(document.querySelector("form #name").form.requestSubmit(), true)`);
        await S.evaluate(
          `${WAIT}(() => Array.from(document.querySelectorAll("[data-sonner-toast]")).some((t) => /Thank you for your message/.test(t.textContent || "")), "the success toast", 15000)`
        );
      });
      const posts = S.contactCalls.filter((c) => c.method === "POST").slice(postsBefore);
      L.check(
        "contact: the form's POST was answered by the stub (synthetic values only)",
        posts.length === 1 && /Probe Walk/.test(posts[0].body || "") && /probe@example\.invalid/.test(posts[0].body || ""),
        `${posts.length} stubbed POST(s)`
      );
    }

    // Settle: let the SDK flush its last batch before counting.
    await new Promise((r) => setTimeout(r, 6000));
  } catch (e) {
    walkError = e;
    L.check("walk completed", false, e.message);
  } finally {
    // Final safety pass over every request to a guarded host.
    const late = leaks();
    const byHost = {};
    for (const r of S.guardedTraffic) {
      const h = new URL(r.url).host;
      byHost[h] = (byHost[h] || 0) + 1;
    }
    console.log(`\n     guarded requests (Network domain): ${S.guardedTraffic.length} ${JSON.stringify(byHost)}; answered locally: ${S.guardedTraffic.length - late.length}`);
    L.check(
      "safety: no request to PostHog or handle-contact left the browser — every one was fulfilled by the local stub",
      late.length === 0,
      late.map((r) => `${r.method} ${r.url} [${r.type}] ip=${r.remoteIPAddress} status=${r.status}`).join(" | ")
    );
    L.check(
      "safety: no guarded response came from a remote address",
      S.guardedTraffic.every((r) => !r.remoteIPAddress),
      S.guardedTraffic.filter((r) => r.remoteIPAddress).map((r) => `${r.url} ${r.remoteIPAddress}`).join(" | ")
    );
    S.close();
  }

  // SDK keys = non-$ keys on the landing $pageview that EVERY decoded app event also
  // carries (measured: token, distinct_id); a page-only key like `title` stays app-level.
  const appDecoded = S.analytics.filter((e) => !e.event.startsWith("$"));
  for (const k of [...sdkKeys]) if (!appDecoded.every((e) => k in (e.properties || {}))) sdkKeys.delete(k);
  console.log(`
     SDK non-$ keys excluded from app-level keys: ${[...sdkKeys].join(", ") || "none"}`);

  // --- Contract check, per observed event. ---
  const rows = [];
  for (const o of observed) {
    const c = CONTRACT[o.key];
    const site = sites.filter((s) => contractKeyOf(s) === o.key);
    const got = appKeys(o.props, sdkKeys);
    const want = Object.keys(c.keys).sort();
    const keysOk = got.join(",") === want.join(",");
    const bad = want.filter((k) => !c.keys[k](o.props[k]));
    const ok = keysOk && bad.length === 0;
    const shown = Object.fromEntries(got.map((k) => [k, o.props[k]]));
    rows.push({ key: o.key, site: site.map((s) => `${s.file}:${s.line}`).join(" "), shown, ok });
    L.check(
      `${o.key}: app-level keys and value types match the call site`,
      ok,
      keysOk ? (bad.length ? `bad values: ${bad.map((k) => `${k}=${JSON.stringify(o.props[k])}`).join(", ")}` : "") : `got {${got.join(", ")}} want {${want.join(", ")}}`
    );
  }
  const hot = observed.find((o) => o.key === "banner_hotspot_clicked");
  if (hot) L.check("banner_hotspot_clicked names the clicked hotspot", hot.props.caption === HOTSPOT.caption && hot.props.series_id === HOTSPOT.seriesId);

  // --- Firing counts: each action fired its event exactly once, nothing extra. ---
  if (!walkError) {
    const appEvents = S.analytics.filter((e) => !e.event.startsWith("$"));
    const count = (name, pred = () => true) => appEvents.filter((e) => e.event === name && pred(e.properties)).length;
    const expected = [
      ["banner_hotspot_clicked", 1],
      ["prediction_method_selected", 1],
      ["prediction_generated", 1],
      ["detailed_analysis_viewed", 1],
      ["prediction_shared", 1],
      ["prediction_reset", 1],
      ["series_selected", 1],
      ["custom_series_selected", 1],
      ["historical_filter_applied", 3],
      ["historical_series_expanded", 1],
      ["contact_form_submitted", S.contactCalls.some((c) => /Probe Walk/.test(c.body || "")) ? 1 : 0],
    ];
    for (const [name, n] of expected) L.check(`firing count: ${name} ×${n}`, count(name) === n, `decoded ×${count(name)}`);
    const unknown = appEvents.filter((e) => !expected.some(([n]) => n === e.event));
    L.check("no unregistered app event was emitted", unknown.length === 0, unknown.map((e) => e.event).join(", "));
    const sdk = {};
    for (const e of S.analytics.filter((x) => x.event.startsWith("$"))) sdk[e.event] = (sdk[e.event] || 0) + 1;
    console.log(`     SDK events decoded (not asserted): ${JSON.stringify(sdk)}`);
  }

  // --- Table. ---
  console.log("\n| event | call site | decoded app-level properties | OK |\n|---|---|---|---|");
  for (const r of rows) console.log(`| \`${r.key}\` | ${r.site} | \`${JSON.stringify(r.shown)}\` | ${r.ok ? "OK" : "FAIL"} |`);
  const seenA1 = A1.filter((n) => observed.some((o) => o.event === n));
  console.log(`\n     §A.1 events decoded: ${seenA1.length}/10${seenA1.length < 10 ? ` (missing: ${A1.filter((n) => !seenA1.includes(n)).join(", ")})` : ""}; prediction_shared: ${observed.some((o) => o.event === "prediction_shared") ? "yes" : "no"}; reset: ${observed.some((o) => o.key === "historical_filter_applied/reset") ? "yes" : "no"}`);
  L.check("all ten §A.1 events decoded", seenA1.length === 10);

  if (L.failures.length) {
    console.log(`\nRED: ${L.failures.length} assertion(s) failed — ${L.failures.join("; ")}`);
    process.exitCode = 1;
    return;
  }
  console.log("\nGREEN: every §A.1 event, prediction_shared and the archive reset fired once with the call site's properties; nothing reached PostHog or handle-contact.");
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  existsSync(process.argv[1]) &&
  realpathSync(resolve(process.argv[1])).toLowerCase() === realpathSync(fileURLToPath(import.meta.url)).toLowerCase();
if (invokedDirectly) {
  main().catch((err) => {
    console.error(`\n${err.stack || err.message}`);
    process.exitCode = 1;
  });
}
