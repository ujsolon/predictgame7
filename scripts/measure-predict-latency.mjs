// NFR-P1 latency harness.
//
// Measures click -> "Predicted Winner" visible in a real browser under
// DevTools-grade network and CPU throttling, over the Chrome DevTools Protocol.
// The whole toolchain is Node's built-in fetch/WebSocket plus the Chrome that is
// already installed, so this adds no dependency to the repo.
//
// It exists because qa-matrix-1-5.md §6.3 was written as an owner-only DevTools
// run: the build session's browser harness exposed no throttling and curl fails
// on this machine with (43). Neither is inherent. CDP's
// Network.emulateNetworkConditions IS the DevTools throttling preset, and
// Emulation.setCPUThrottlingRate IS the CPU box, so the measurement is
// scriptable and repeatable instead of a one-off human reading.
//
// Usage (two terminals):
//   npm run preview                                  # builds, serves on :4173
//   node scripts/measure-predict-latency.mjs         # defaults to Slow 4G + 4x CPU
//
//   npm run perf:predict -- --server-only            # Edge Function alone, no browser
//
// --server-only hits predict-game-7 directly from Node over --per-method rounds of
// every method slug, and reports wall time, the function's self-reported compute,
// per-method p95, and a cold-first-round / warm split. That split is what tells
// you the tail is Supabase edge cold boot rather than the maths. It needs
// VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env and no preview server.
//
//   npm run perf:predict -- --probe-evidence       # what this harness can actually see
//
// --probe-evidence answers an evidence question instead of a latency one. It reads
// getComputedStyle on the focused Predict triggers, captures a screenshot and the
// accessibility tree, and prints the results, so a claim about what CDP can observe
// can be checked in-repo rather than taken on faith (qa-matrix-1-5.md §6.4).
//
// The run reports two independent numbers per sample, because conflating them is
// what made the earlier mobile reading look like a network problem:
//   request_ms  send -> response complete for the predict-game-7 invoke (network)
//   to_result_ms click -> marker in the DOM (network + React render + paint work)
// The difference between them is client-side cost, which network throttling does
// not touch and CPU throttling does.
//
// Analytics are blocked by default. 20+ synthetic predictions would otherwise
// land in the production PostHog project as real traffic (an open item in
// deferred-work.md). Pass --with-analytics to measure with PostHog loaded, which
// is closer to a real user's bandwidth contention but pollutes the dashboard.

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);

// DevTools' own throttling_profiles values, quoted here rather than guessed so
// the record states exactly what ran. Slow 4G is the preset §6.3 names.
const PROFILES = {
  none: { latency: 0, downloadThroughput: -1, uploadThroughput: -1 },
  slow4g: {
    latency: 562.5,
    downloadThroughput: (1.44 * 1024 * 1024) / 8,
    uploadThroughput: (675 * 1024) / 8,
  },
};

const RESULT_MARKER = "Predicted Winner";

// The four MethodSlugs the Edge Function branches on, mirrored from
// supabase/functions/_shared/contract.ts. Deliberately not imported: that file is
// TypeScript in a Deno tree that no tsconfig here covers, and a static list keeps
// this script dependency-free. If a slug is ever added, --methods overrides it.
const METHOD_SLUGS = [
  "logistic_regression",
  "bayes",
  "elo",
  "exponential_smoothing",
];

function parseArgs(argv) {
  const opts = {
    url: "http://localhost:4173/predictgame7/predict",
    profile: "slow4g",
    cpu: 4,
    cold: 3,
    warm: 20,
    viewport: "390x844",
    withAnalytics: false,
    timeout: 90000,
    serverOnly: false,
    probeEvidence: false,
    perMethod: 6,
    methods: METHOD_SLUGS,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--url") opts.url = next();
    else if (a === "--profile") opts.profile = next();
    else if (a === "--cpu") opts.cpu = Number(next());
    else if (a === "--cold") opts.cold = Number(next());
    else if (a === "--warm") opts.warm = Number(next());
    else if (a === "--viewport") opts.viewport = next();
    else if (a === "--timeout") opts.timeout = Number(next());
    else if (a === "--with-analytics") opts.withAnalytics = true;
    else if (a === "--server-only") opts.serverOnly = true;
    else if (a === "--probe-evidence") opts.probeEvidence = true;
    else if (a === "--per-method") opts.perMethod = Number(next());
    else if (a === "--methods") opts.methods = next().split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--help" || a === "-h") {
      console.log(readFileSync(new URL(import.meta.url), "utf8").split("\n").filter((l) => l.startsWith("//")).join("\n"));
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${a}`);
      process.exit(2);
    }
  }
  if (!opts.serverOnly && !PROFILES[opts.profile]) {
    console.error(`Unknown --profile. One of: ${Object.keys(PROFILES).join(", ")}`);
    process.exit(2);
  }
  if (opts.serverOnly && (!opts.methods.length || !(opts.perMethod >= 1))) {
    console.error("--server-only needs at least one --methods slug and --per-method >= 1");
    process.exit(2);
  }
  return opts;
}

// The anon key is client-visible by design (NFR-S1); it is read, never printed.
function readViteEnv(file = ".env") {
  const out = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.includes("=") || line.trimStart().startsWith("#")) continue;
    const i = line.indexOf("=");
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

// --server-only: probe the Edge Function directly from Node, no browser. This is
// the half of NFR-P1 that needs no throttling - the function's own round trip and
// its self-reported compute - and it is what separates "the network is slow" from
// "the maths is slow".
async function runServerOnly(opts) {
  const env = readViteEnv();
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
    console.error(".env is missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
    process.exit(1);
  }
  const endpoint = `${env.VITE_SUPABASE_URL}/functions/v1/predict-game-7`;
  // Twelve score pairs so repeated rounds do not hit an identical cached path.
  const scores = [
    [110, 102], [98, 105], [121, 114], [95, 99], [108, 101], [113, 107],
    [104, 97], [116, 109], [99, 103], [107, 112], [118, 96], [102, 105],
  ];

  console.log(
    [
      "NFR-P1 server probe (no browser, unthrottled)",
      `  endpoint   ${endpoint}`,
      `  methods    ${opts.methods.join(", ")}`,
      `  samples    ${opts.perMethod} per method = ${opts.perMethod * opts.methods.length}`,
      "",
    ].join("\n")
  );

  const rows = [];
  for (let round = 0; round < opts.perMethod; round++) {
    for (const method of opts.methods) {
      const [sa, sb] = scores[round % scores.length];
      const body = {
        team_a: "Boston Celtics",
        team_b: "Miami Heat",
        home_team: "Boston Celtics",
        method,
        game_1_score_a: sa, game_1_score_b: sb,
        game_2_score_a: sb, game_2_score_b: sa,
        game_3_score_a: sa, game_3_score_b: sb,
        game_4_score_a: sb, game_4_score_b: sa,
        game_5_score_a: sa, game_5_score_b: sb,
        game_6_score_a: sb, game_6_score_b: sa,
      };
      const t0 = performance.now();
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      const wall = performance.now() - t0;
      const row = {
        method,
        round,
        status: res.status,
        wall: Math.round(wall),
        compute_ms: json?.computation_time_ms ?? null,
        keys: json ? Object.keys(json).length : 0,
        conforming: res.status === 200 && json?.method_used === method,
      };
      rows.push(row);
      process.stdout.write(
        `  ${method.padEnd(22)} ${String(round + 1).padStart(2)}  wall=${String(row.wall).padStart(5)}ms  compute=${row.compute_ms}ms  status=${row.status}\n`
      );
    }
  }

  const bad = rows.filter((r) => !r.conforming);
  console.log(
    `\nsamples=${rows.length}  non-conforming=${bad.length}  contract keys seen: ${[...new Set(rows.map((r) => r.keys))].join(", ")}`
  );
  if (bad.length) console.log(`  non-conforming detail: ${JSON.stringify(bad.slice(0, 3))}`);

  console.log("");
  console.log("  " + fmt("wall", stats(rows.map((r) => r.wall))));
  const computes = rows.map((r) => r.compute_ms).filter((n) => n != null);
  if (computes.length) console.log("  " + fmt("compute", stats(computes)));

  console.log("\nper-method wall p95:");
  for (const m of opts.methods) {
    const a = rows.filter((r) => r.method === m).map((r) => r.wall);
    console.log(`  ${m.padEnd(22)} ${a.join(" / ")}  -> p95 ${pct([...a].sort((x, y) => x - y), 95)}`);
  }

  // The first round pays the edge cold boot, so splitting it out is the
  // difference between "the function is slow" and "the function was asleep".
  const coldRows = rows.filter((r) => r.round === 0).map((r) => r.wall);
  const warmRows = rows.filter((r) => r.round > 0).map((r) => r.wall);
  console.log("\ncold (first round) vs warm:");
  console.log("  " + fmt("cold", stats(coldRows)));
  console.log("  " + fmt("warm", stats(warmRows)));
  console.log(
    "\nIf cold p95 is much higher than warm p95, the tail is Supabase edge\ncold-boot and the lever for a tighter NFR-P1 is keeping the function warm."
  );
}

function findChrome() {
  const found = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (found) return found;
  console.error(
    "No Chrome found. Set CHROME_PATH to the executable.\nTried:\n  " +
      CHROME_CANDIDATES.join("\n  ")
  );
  process.exit(1);
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

class CDP {
  constructor(ws, sessionId) {
    this.ws = ws;
    this.sessionId = sessionId;
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Map();
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message}`));
        else resolve(msg.result);
        return;
      }
      // Events for our session, plus browser-level events with no sessionId.
      if (msg.sessionId && msg.sessionId !== this.sessionId) return;
      const list = this.handlers.get(msg.method);
      if (list) for (const fn of list) fn(msg.params);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    const payload = { id, method, params };
    if (this.sessionId) payload.sessionId = this.sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
    });
  }

  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(fn);
  }

  once(method, predicate = () => true) {
    return new Promise((resolve) => {
      const fn = (params) => {
        if (!predicate(params)) return;
        const list = this.handlers.get(method);
        const i = list.indexOf(fn);
        if (i >= 0) list.splice(i, 1);
        resolve(params);
      };
      this.on(method, fn);
    });
  }
}

async function connectBrowser(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let versionUrl;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      versionUrl = (await res.json()).webSocketDebuggerUrl;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  if (!versionUrl) throw new Error(`Chrome on port ${port} never exposed /json/version`);
  const ws = new WebSocket(versionUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", () => reject(new Error("CDP websocket failed to open")), {
      once: true,
    });
  });
  return ws;
}

const pct = (sorted, p) =>
  sorted.length === 0
    ? NaN
    : sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];

const stats = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  return {
    n: s.length,
    min: s[0],
    p50: pct(s, 50),
    p95: pct(s, 95),
    max: s.at(-1),
  };
};

const fmt = (label, st) =>
  `${label.padEnd(14)} n=${String(st.n).padStart(2)}  min=${String(Math.round(st.min)).padStart(5)}  p50=${String(Math.round(st.p50)).padStart(5)}  p95=${String(Math.round(st.p95)).padStart(5)}  max=${String(Math.round(st.max)).padStart(5)}`;

// Everything below this line runs inside the page, so it is written as source
// strings: no imports, no closures, no Node globals.
const PAGE_HELPERS = `
  window.__p1 = (() => {
    const MARKER = ${JSON.stringify(RESULT_MARKER)};
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const text = (el) => (el && el.textContent) || "";
    const dialogButtons = () =>
      Array.from(document.querySelectorAll('[role="dialog"] button'));

    const waitFor = async (fn, what, timeout) => {
      const t0 = Date.now();
      for (;;) {
        let v;
        try { v = fn(); } catch { v = null; }
        if (v) return v;
        if (Date.now() - t0 > timeout) throw new Error("timed out waiting for " + what);
        await sleep(25);
      }
    };

    const dialogOpen = () =>
      waitFor(() => document.querySelector('[role="dialog"]'), "a dialog", 15000);

    const clickDialogOption = async (match, what, timeout) => {
      const btn = await waitFor(
        () => dialogButtons().find((b) => !/Go Back/i.test(text(b)) && match.test(text(b))),
        what,
        timeout
      );
      btn.click();
      return text(btn).replace(/\\s+/g, " ").trim();
    };

    const pageButton = (match) =>
      Array.from(document.querySelectorAll("button, a")).find((b) => match.test(text(b)));

    const trigger = (kind) => {
      const re = kind === "series"
        ? /Select a Series|Click to choose series/i
        : /Click to choose method|Not selected/i;
      return pageButton(re);
    };

    const generate = () => pageButton(/Click to generate prediction|Generating prediction/i);

    const hasResult = () => (document.body.textContent || "").includes(MARKER);

    return { sleep, waitFor, dialogOpen, clickDialogOption, trigger, generate, hasResult, text };
  })();
`;

const SELECT_SERIES = `
  window.__p1SelectSeries = async (decade, year, seriesRe, timeout) => {
    const H = window.__p1;
    const t = H.trigger("series");
    if (!t) throw new Error("series trigger not found");
    t.click();
    await H.dialogOpen();
    const pickedDecade = await H.clickDialogOption(
      new RegExp("^\\\\s*" + decade), "decade " + decade, timeout);
    await H.waitFor(() => /Select Year from/.test(H.text(document.querySelector('[role="dialog"]'))),
      "the year level", timeout);
    const pickedYear = await H.clickDialogOption(
      new RegExp("^\\\\s*" + year), "year " + year, timeout);
    await H.waitFor(() => /Select Series from/.test(H.text(document.querySelector('[role="dialog"]'))),
      "the series level", timeout);
    const pickedSeries = await H.clickDialogOption(seriesRe, "a series option", timeout);
    await H.waitFor(() => !document.querySelector('[role="dialog"]'), "the dialog to close", timeout);
    return { pickedDecade, pickedYear, pickedSeries };
  };
`;

const SELECT_METHOD = `
  window.__p1SelectMethod = async (methodRe, timeout) => {
    const H = window.__p1;
    const t = H.trigger("method");
    if (!t) throw new Error("method trigger not found");
    t.click();
    await H.dialogOpen();
    const picked = await H.clickDialogOption(methodRe, "a method option", timeout);
    await H.waitFor(() => !document.querySelector('[role="dialog"]'), "the dialog to close", timeout);
    return { pickedMethod: picked };
  };
`;

const RUN_SAMPLE = `
  window.__p1RunSample = (timeout) => new Promise((resolve, reject) => {
    const H = window.__p1;
    const MARKER = ${JSON.stringify(RESULT_MARKER)};
    const has = () => (document.body.textContent || "").includes(MARKER);
    const btn = H.generate();
    if (!btn) { reject(new Error("Generate control not found")); return; }
    if (btn.disabled) { reject(new Error("Generate is disabled - selection incomplete")); return; }

    const startedWithResult = has();
    let sawAbsent = !startedWithResult;
    const clickAt = performance.now();
    const obs = new MutationObserver(() => {
      if (!sawAbsent) { if (!has()) sawAbsent = true; return; }
      if (has()) {
        obs.disconnect();
        resolve({
          startedWithResult,
          to_result_ms: performance.now() - clickAt,
        });
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    btn.click();
    setTimeout(() => {
      obs.disconnect();
      reject(new Error("no result within " + timeout + "ms of the click"));
    }, timeout);
  });
`;

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.serverOnly) return runServerOnly(opts);

  const [vw, vh] = opts.viewport.split("x").map(Number);
  const profile = PROFILES[opts.profile];

  const probe = await fetch(opts.url, { method: "GET" }).catch(() => null);
  if (!probe || !probe.ok) {
    console.error(
      `${opts.url} did not answer (${probe ? probe.status : "no response"}).\n` +
        "Start it first:  npm run preview"
    );
    process.exit(1);
  }

  const chromePath = findChrome();
  const port = await freePort();
  const userDataDir = mkdtempSync(join(tmpdir(), "p1-chrome-"));

  const chrome = spawn(
    chromePath,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--hide-scrollbars",
      `--window-size=${vw},${vh}`,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] }
  );
  let chromeErr = "";
  chrome.stderr.on("data", (d) => {
    chromeErr += d.toString();
  });

  const cleanup = () => {
    try {
      chrome.kill();
    } catch {
      /* already gone */
    }
    try {
      rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });

  try {
    const browserWs = await connectBrowser(port).catch((e) => {
      throw new Error(`${e.message}\nchrome stderr:\n${chromeErr.slice(-2000)}`);
    });
    const browser = new CDP(browserWs, null);
    const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await browser.send("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    const cdp = new CDP(browserWs, sessionId);

    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Network.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: vw,
      height: vh,
      deviceScaleFactor: 2,
      mobile: vw < 768,
    });
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      ...profile,
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: opts.cpu });
    if (!opts.withAnalytics) {
      await cdp.send("Network.setBlockedURLs", {
        urls: ["*posthog*", "*i.posthog.com*", "*us-assets.i.posthog.com*"],
      });
    }

    // Pair each invoke with its own CDP network timing, independent of the
    // in-page render measurement above.
    const inflight = new Map();
    const requestSamples = [];
    cdp.on("Network.requestWillBeSent", (p) => {
      if (!p.request.url.includes("/functions/v1/predict-game-7")) return;
      inflight.set(p.requestId, { start: p.timestamp });
    });
    cdp.on("Network.responseReceived", (p) => {
      const rec = inflight.get(p.requestId);
      if (rec) rec.headersAt = p.timestamp;
    });
    cdp.on("Network.loadingFinished", (p) => {
      const rec = inflight.get(p.requestId);
      if (!rec) return;
      inflight.delete(p.requestId);
      requestSamples.push({
        request_ms: (p.timestamp - rec.start) * 1000,
        ttfb_ms: rec.headersAt ? (rec.headersAt - rec.start) * 1000 : null,
      });
    });
    cdp.on("Network.loadingFailed", (p) => {
      const rec = inflight.get(p.requestId);
      if (!rec) return;
      inflight.delete(p.requestId);
      requestSamples.push({ request_ms: null, failed: p.errorText });
    });

    const evaluate = async (expression) => {
      const res = await cdp.send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
        timeout: opts.timeout + 30000,
      });
      if (res.exceptionDetails) {
        const d = res.exceptionDetails;
        throw new Error(
          `page error: ${d.exception?.description || d.text || "unknown"}`
        );
      }
      return res.result.value;
    };

    const loadPage = async () => {
      requestSamples.length = 0;
      const loaded = cdp.once("Page.loadEventFired");
      await cdp.send("Page.navigate", { url: opts.url });
      await Promise.race([
        loaded,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`page never fired load: ${opts.url}`)), 60000)
        ),
      ]);
      // The archive fetch is what populates the picker; wait for the trigger to
      // be a real, enabled control rather than racing the mount.
      await evaluate(`(async () => {
        ${PAGE_HELPERS}
        ${SELECT_SERIES}
        ${SELECT_METHOD}
        ${RUN_SAMPLE}
        await window.__p1.waitFor(() => window.__p1.trigger("series"), "the series trigger", 60000);
        await window.__p1.waitFor(() => window.__p1.trigger("method"), "the method trigger", 60000);
        return true;
      })()`);
      // Printed because it decides how much of the result to trust. A hidden tab
      // throttles timers and rAF, which is exactly what made qa-matrix-1-5.md
      // §4's original mobile reading (4372-4545 ms) wrong: it was a
      // resource-timing duration taken with document.hidden === true. request_ms
      // comes from CDP and is immune to this; to_result_ms is not.
      return evaluate(
        `({ visibilityState: document.visibilityState, hidden: document.hidden })`
      );
    };

    // --probe-evidence: settle an evidence claim by measuring, not by asserting.
    // qa-matrix-1-5.md §6.4 says focus-ring presence and box geometry are readable
    // over CDP; retro finding B3 objected that nothing in the repo demonstrated it.
    // This runs the three calls that claim names — getComputedStyle on a focused
    // element, Page.captureScreenshot, Accessibility.getFullAXTree — against the real
    // page in the Chrome this script already spawns, and prints what each returns.
    // The PNG goes to the temp dir, never into the repo.
    if (opts.probeEvidence) {
      const vis = await loadPage();
      await evaluate(`(() => {
        window.__p1Read = (el, label) => {
          if (!el) return { label, missing: true };
          el.focus();
          const cs = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return {
            label,
            tag: el.tagName,
            activeElementIsTarget: document.activeElement === el,
            matchesFocusPseudo: el.matches(":focus"),
            outline: [cs.outlineWidth, cs.outlineStyle, cs.outlineColor].join(" "),
            outlineOffset: cs.outlineOffset,
            boxShadow: cs.boxShadow,
            rect: {
              x: Math.round(r.x), y: Math.round(r.y),
              w: Math.round(r.width), h: Math.round(r.height),
            },
          };
        };
        return true;
      })()`);
      // Nothing is selected yet, so the two picker triggers carry their
      // unselected names and Generate is not on the page — the harness's own
      // trigger()/generate() matchers see exactly what the fan sees per state.
      const beforeSelect = await evaluate(`[
        window.__p1Read(window.__p1.trigger("series"), "series trigger"),
        window.__p1Read(window.__p1.trigger("method"), "method trigger"),
      ]`);
      const picked = await evaluate(`(async () => {
        const a = await window.__p1SelectSeries("2020s", "2026", /vs/i, ${opts.timeout});
        const b = await window.__p1SelectMethod(/Bayes/i, ${opts.timeout});
        return Object.assign({}, a, b);
      })()`);
      const afterSelect = await evaluate(
        `[window.__p1Read(window.__p1.generate(), "Generate")]`
      );
      const surfaces = [...beforeSelect, ...afterSelect];
      const target = surfaces.find((s) => s.rect);
      const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
      const png = Buffer.from(shot.data, "base64");
      const pngPath = join(tmpdir(), "p1-evidence-probe.png");
      writeFileSync(pngPath, png);
      let clip = null;
      if (target) {
        const clipShot = await cdp.send("Page.captureScreenshot", {
          format: "png",
          clip: {
            x: Math.max(0, target.rect.x - 8),
            y: Math.max(0, target.rect.y - 8),
            width: target.rect.w + 16,
            height: target.rect.h + 16,
            scale: 2,
          },
        });
        clip = Buffer.from(clipShot.data, "base64");
      }
      await cdp.send("Accessibility.enable").catch(() => {});
      const ax = await cdp.send("Accessibility.getFullAXTree");
      const axButtons = ax.nodes.filter((n) => n.role && n.role.value === "button");
      console.log(
        [
          "Evidence probe — qa-matrix-1-5.md §6.4 / retro finding B3",
          `  url              ${opts.url}`,
          `  viewport         ${vw}x${vh} (mobile=${vw < 768})`,
          `  page visibility  visibilityState=${vis?.visibilityState} hidden=${vis?.hidden}`,
          `  selection        ${JSON.stringify(picked)}`,
          "",
          "  getComputedStyle on a focused element (ring presence + geometry):",
          ...surfaces.map((s) =>
            s.missing
              ? `    ${s.label.padEnd(15)} NOT FOUND`
              : [
                  `    ${s.label.padEnd(15)} <${s.tag.toLowerCase()}> activeElement=${s.activeElementIsTarget} :focus=${s.matchesFocusPseudo}`,
                  `      outline      ${s.outline} / offset ${s.outlineOffset}`,
                  `      box-shadow   ${s.boxShadow}`,
                  `      rect         ${s.rect.w}x${s.rect.h} at (${s.rect.x}, ${s.rect.y})`,
                ].join("\n")
          ),
          "",
          `  Page.captureScreenshot  ${png.length} bytes, ${png.readUInt32BE(16)}x${png.readUInt32BE(20)} px -> ${pngPath}`,
          ...(clip ? [`  clipped capture       ${clip.length} bytes, ${clip.readUInt32BE(16)}x${clip.readUInt32BE(20)} px`] : []),
          `  Accessibility tree        ${ax.nodes.length} nodes, ${axButtons.length} with role=button`,
          "",
        ].join("\n")
      );
      browserWs.close();
      return;
    }

    console.log(
      [
        "NFR-P1 predict latency",
        `  url        ${opts.url}`,
        `  chrome     ${chromePath}`,
        `  viewport   ${vw}x${vh} (mobile=${vw < 768})`,
        `  network    profile=${opts.profile} latency=${profile.latency}ms down=${profile.downloadThroughput < 0 ? "unthrottled" : Math.round(profile.downloadThroughput / 1024) + "KB/s"} up=${profile.uploadThroughput < 0 ? "unthrottled" : Math.round(profile.uploadThroughput / 1024) + "KB/s"}`,
        `  cpu        ${opts.cpu}x throttle`,
        `  analytics  ${opts.withAnalytics ? "INCLUDED (pollutes the PostHog project)" : "blocked"}`,
        `  samples    cold=${opts.cold} warm=${opts.warm}`,
        "",
      ].join("\n")
    );

    const cold = [];
    for (let i = 0; i < opts.cold; i++) {
      const vis = await loadPage();
      if (i === 0) {
        console.log(
          `  page       visibilityState=${vis?.visibilityState} hidden=${vis?.hidden}` +
            (vis?.hidden ? "  <-- HIDDEN TAB: to_result_ms is unreliable, trust request_ms" : "")
        );
      }
      const picked = await evaluate(`(async () => {
        const a = await window.__p1SelectSeries("2020s", "2026", /vs/i, ${opts.timeout});
        const b = await window.__p1SelectMethod(/Bayes/i, ${opts.timeout});
        return Object.assign({}, a, b);
      })()`);
      if (i === 0) console.log(`  selection  ${JSON.stringify(picked)}\n`);
      const t0 = Date.now();
      const sample = await evaluate(`window.__p1RunSample(${opts.timeout})`);
      const net = requestSamples.at(-1) || {};
      cold.push({
        kind: "cold",
        ...sample,
        request_ms: net.request_ms ?? null,
        ttfb_ms: net.ttfb_ms ?? null,
        failed: net.failed,
        wall_ms: Date.now() - t0,
      });
      process.stdout.write(`  cold ${String(i + 1).padStart(2)}  to_result=${Math.round(sample.to_result_ms)}ms  request=${net.request_ms != null ? Math.round(net.request_ms) + "ms" : "n/a"}\n`);
    }

    const warm = [];
    for (let i = 0; i < opts.warm; i++) {
      const t0 = Date.now();
      const sample = await evaluate(`window.__p1RunSample(${opts.timeout})`);
      const net = requestSamples.at(-1) || {};
      warm.push({
        kind: "warm",
        ...sample,
        request_ms: net.request_ms ?? null,
        ttfb_ms: net.ttfb_ms ?? null,
        failed: net.failed,
        wall_ms: Date.now() - t0,
      });
      process.stdout.write(`  warm ${String(i + 1).padStart(2)}  to_result=${Math.round(sample.to_result_ms)}ms  request=${net.request_ms != null ? Math.round(net.request_ms) + "ms" : "n/a"}\n`);
    }

    const report = (label, rows) => {
      if (!rows.length) return;
      console.log(`\n${label}`);
      console.log("  " + fmt("to_result", stats(rows.map((r) => r.to_result_ms))));
      const reqs = rows.map((r) => r.request_ms).filter((n) => n != null);
      if (reqs.length) console.log("  " + fmt("request", stats(reqs)));
      const ttfbs = rows.map((r) => r.ttfb_ms).filter((n) => n != null);
      if (ttfbs.length) console.log("  " + fmt("ttfb", stats(ttfbs)));
      const client = rows
        .filter((r) => r.request_ms != null)
        .map((r) => r.to_result_ms - r.request_ms);
      if (client.length) console.log("  " + fmt("client-only", stats(client)));
    };

    report(`COLD (fresh navigation + full picker selection each time)`, cold);
    report(`WARM (selection kept, Generate re-activated)`, warm);

    const all = [...cold, ...warm];
    report("ALL SAMPLES", all);

    const failed = all.filter((r) => r.failed);
    if (failed.length) {
      console.log(`\n  ${failed.length} sample(s) had a failed invoke: ${[...new Set(failed.map((f) => f.failed))].join(", ")}`);
    }
    console.log(
      "\nclient-only = to_result - request. If it dominates, the budget is being\nspent on render work, not the network, and CPU throttling is the lever."
    );

    browserWs.close();
  } finally {
    cleanup();
  }
}

main().catch((err) => {
  console.error(`\n${err.stack || err.message}`);
  process.exit(1);
});
