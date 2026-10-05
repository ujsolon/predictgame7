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
//   npm run preview, then (Story 2.7, the epic drill — see the block above runFakeSeries):
//   node scripts/measure-predict-latency.mjs --fake-pending   # §6.5 (c): six rows + NULL winner
//   node scripts/measure-predict-latency.mjs --fake-short     # + a five-row row: excluded, reported
//   node scripts/measure-predict-latency.mjs --archive-read   # /historical 178 + chips + gloss, /insights 160
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
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

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
    fakePending: false,
    fakeShort: false,
    archiveRead: false,
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
    else if (a === "--fake-pending") opts.fakePending = true;
    else if (a === "--fake-short") opts.fakeShort = true;
    else if (a === "--archive-read") opts.archiveRead = true;
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
  if ([opts.serverOnly, opts.probeEvidence, opts.fakePending, opts.fakeShort, opts.archiveRead].filter(Boolean).length > 1) {
    console.error("--server-only, --probe-evidence, --fake-pending, --fake-short and --archive-read are separate modes; pass one");
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
  if (opts.fakePending || opts.fakeShort) return runFakeSeries(opts);
  if (opts.archiveRead) return runArchiveRead(opts);

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

// ---------------------------------------------------------------------------
// Story 2.7 — the drill modes and the reusable page readers.
//
//   --fake-pending  qa-matrix-1-5.md §6.5 option (c), re-scored against the
//                   derivation: a CDP `Fetch` override at the Response stage
//                   appends ONE synthetic series — six score rows (games 1–6,
//                   a 3–3 split) and a NULL winner, the only shape the server's
//                   00015 birth RPC writes — to the production `series` list
//                   response and serves it on the `?id=eq.` preload. No status
//                   flag exists to fake (00014 dropped it); the client's
//                   `isSeriesPending` derivation is what has to light up.
//                   Asserted: the "Current Game 7s" group renders it, its year
//                   card reads `Current`, selecting it reports
//                   `series_source: 'current'`, the predict request carries six
//                   games (and the real function answers), the `?series=<id>`
//                   preload resolves it, and Home links it to its preview page.
//   --fake-short    the same override plus a SECOND synthetic row with five
//                   score rows and a NULL winner: it must be excluded from
//                   every picker group and reported (`Non-reconciling series:`),
//                   while the six-row one still renders.
//   --archive-read  no override: /historical against production, reading the
//                   announced total, every row's league chip, one chipped
//                   record's gloss, and /insights' two denominators — the
//                   178-vs-160 pair shown rather than inferred.
//
// Production stays read-only: the override rewrites RESPONSES in the browser,
// the only writes are the anon REST GETs the app already makes plus the normal
// user Predict call --fake-pending triggers. PostHog requests are answered
// locally (Fetch at the Request stage, fulfilled 200 here) and decoded so the
// `series_source` property is READ without a single event reaching the
// production project — stricter than the latency study's URL block.
// Exit: 0 = every assertion held; 1 = at least one failed (each printed as
// FAIL) or the harness could not run.
// ---------------------------------------------------------------------------

export const FAKE_PENDING_ID = "00000000-0000-4000-8000-000000002027";
export const FAKE_SHORT_ID = "00000000-0000-4000-8000-000000002028";

/** One assertion ledger per run: every check prints, failures set exit 1. */
export function createLedger() {
  const failures = [];
  const check = (label, ok, detail = "") => {
    console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failures.push(label);
    return ok;
  };
  return { check, failures };
}

/** PostHog bodies arrive as JSON, gzip-js, or `data=<base64>` — decode all three to event objects. */
function decodeAnalyticsBody(buf) {
  if (!buf || buf.length === 0) return [];
  let text;
  try {
    text = buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf).toString("utf8") : buf.toString("utf8");
  } catch {
    return [];
  }
  const tryJson = (s) => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };
  let parsed = tryJson(text);
  if (parsed === null && text.startsWith("data=")) {
    const b64 = decodeURIComponent(text.slice(5).split("&")[0]);
    parsed = tryJson(Buffer.from(b64, "base64").toString("utf8"));
  }
  if (parsed === null) return [];
  const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed.batch) ? parsed.batch : [parsed];
  return list.filter((e) => e && typeof e.event === "string");
}

/**
 * Spawn headless Chrome and attach one page session. `seriesOverride(body,
 * request)` — when given — rewrites every `rest/v1/series` response at the
 * Response stage (return `undefined` to pass a response through unchanged).
 * PostHog traffic is always answered locally and decoded into `analytics`.
 */
export async function openBrowserSession({ viewport = "1440x900", seriesOverride = null, analyticsHost = null } = {}) {
  const [vw, vh] = viewport.split("x").map(Number);
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
  let browserWs = null;
  const close = () => {
    try {
      browserWs?.close();
    } catch {
      /* already closed */
    }
    try {
      chrome.kill();
    } catch {
      /* already gone */
    }
    try {
      rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      /* best effort — Chrome may still hold a lock for a moment */
    }
  };
  process.on("exit", close);
  // Ctrl+C skips 'exit' listeners, which left headless Chrome and its profile behind.
  process.once("SIGINT", () => {
    close();
    process.exitCode = 130;
  });

  try {
    browserWs = await connectBrowser(port).catch((e) => {
      throw new Error(`${e.message}\nchrome stderr:\n${chromeErr.slice(-2000)}`);
    });
    const browser = new CDP(browserWs, null);
    const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
    const cdp = new CDP(browserWs, sessionId);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Network.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: vw, height: vh, deviceScaleFactor: 1, mobile: vw < 768 });
    // posthog-js drops every capture from a user agent on its bot list, and
    // `HeadlessChrome` is on it — measured: with the default UA the SDK sent
    // only config and /flags, never an event, so `series_source` could not be
    // read. Present as ordinary Chrome; the events are still answered locally.
    const { userAgent } = await browser.send("Browser.getVersion");
    await cdp.send("Network.setUserAgentOverride", { userAgent: userAgent.replace(/HeadlessChrome/g, "Chrome") });

    const consoleMessages = [];
    cdp.on("Runtime.consoleAPICalled", (p) => {
      const text = (p.args || [])
        .map((a) => (a.value !== undefined ? String(a.value) : a.description || a.preview?.description || ""))
        .join(" ");
      consoleMessages.push({ type: p.type, text });
    });

    const predictRequests = [];
    const predictResponses = new Map();
    // Every finished `rest/v1/series` response, in arrival order — so a caller can
    // wait for a read to have LANDED before asserting that something is absent.
    const seriesLoads = [];
    const seriesUrls = new Map();
    cdp.on("Network.responseReceived", (p) => {
      if (p.response.url.includes("/rest/v1/series") && p.type !== "Preflight") seriesUrls.set(p.requestId, p.response.url);
    });
    cdp.on("Network.loadingFinished", (p) => {
      const url = seriesUrls.get(p.requestId);
      if (url) seriesLoads.push(url);
    });
    cdp.on("Network.requestWillBeSent", (p) => {
      if (!p.request.url.includes("/functions/v1/predict-game-7") || p.request.method !== "POST") return;
      predictRequests.push({ requestId: p.requestId, body: p.request.postData ?? null });
    });
    cdp.on("Network.responseReceived", (p) => {
      if (p.response.url.includes("/functions/v1/predict-game-7")) predictResponses.set(p.requestId, p.response.status);
    });

    const analytics = [];
    const isAnalytics = (url) => /posthog/i.test(url) || (analyticsHost ? url.startsWith(analyticsHost) : false);
    const patterns = [{ urlPattern: "*posthog*", requestStage: "Request" }];
    if (analyticsHost) patterns.push({ urlPattern: `${analyticsHost}*`, requestStage: "Request" });
    if (seriesOverride) patterns.push({ urlPattern: "*/rest/v1/series*", requestStage: "Response" });
    const seriesCalls = [];
    cdp.on("Fetch.requestPaused", async (p) => {
      try {
        const url = p.request.url;
        if (p.responseStatusCode === undefined && isAnalytics(url)) {
          const entries = p.request.postDataEntries || [];
          const buf = entries.length
            ? Buffer.concat(entries.map((e) => Buffer.from(e.bytes || "", "base64")))
            : p.request.postData
              ? Buffer.from(p.request.postData, "utf8")
              : null;
          for (const e of decodeAnalyticsBody(buf)) analytics.push({ event: e.event, properties: e.properties || {} });
          // Answer each PostHog endpoint with a body the SDK accepts, or it keeps
          // its capture queue parked and no event is ever sent to be decoded:
          // `/flags` needs a flags-shaped object, remote config an empty one.
          // Uncompressed batches are JSON POSTs, so the browser preflights them;
          // a preflight answered without Allow-Methods/Headers is refused and
          // the SDK retries forever without ever sending the batch.
          if (p.request.method === "OPTIONS") {
            await cdp.send("Fetch.fulfillRequest", {
              requestId: p.requestId,
              responseCode: 204,
              responseHeaders: [
                { name: "Access-Control-Allow-Origin", value: "*" },
                { name: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
                { name: "Access-Control-Allow-Headers", value: "*" },
                { name: "Access-Control-Max-Age", value: "600" },
              ],
            });
            return;
          }
          const isScript = /\.js(\?|$)/.test(url);
          const answer = isScript
            ? ""
            : /\/flags\//.test(url)
              ? JSON.stringify({ featureFlags: {}, featureFlagPayloads: {}, errorsWhileComputingFlags: false, flags: {} })
              : /\/config(\?|$)/.test(url)
                ? "{}"
                : '{"status":1}';
          await cdp.send("Fetch.fulfillRequest", {
            requestId: p.requestId,
            responseCode: 200,
            responseHeaders: [
              { name: "Content-Type", value: isScript ? "application/javascript" : "application/json" },
              { name: "Access-Control-Allow-Origin", value: "*" },
            ],
            body: Buffer.from(answer).toString("base64"),
          });
          return;
        }
        // A CORS preflight (OPTIONS) reaches the Response stage too; it has no
        // JSON body to rewrite, so it passes through and is not recorded.
        if (p.responseStatusCode !== undefined && seriesOverride && url.includes("/rest/v1/series") && p.request.method !== "OPTIONS") {
          const raw = await cdp.send("Fetch.getResponseBody", { requestId: p.requestId });
          const text = raw.base64Encoded ? Buffer.from(raw.body, "base64").toString("utf8") : raw.body;
          let body = null;
          try {
            body = JSON.parse(text);
          } catch {
            body = null;
          }
          const accept = Object.entries(p.request.headers || {}).find(([k]) => k.toLowerCase() === "accept")?.[1] ?? "";
          const rewritten = seriesOverride(body, { url, accept, status: p.responseStatusCode });
          seriesCalls.push({ url, rewritten: rewritten !== undefined });
          if (rewritten === undefined) {
            await cdp.send("Fetch.continueRequest", { requestId: p.requestId });
            return;
          }
          const headers = (p.responseHeaders || []).filter(
            (h) => !["content-length", "content-encoding", "content-type"].includes(h.name.toLowerCase())
          );
          headers.push({ name: "Content-Type", value: "application/json; charset=utf-8" });
          await cdp.send("Fetch.fulfillRequest", {
            requestId: p.requestId,
            responseCode: 200,
            responseHeaders: headers,
            body: Buffer.from(JSON.stringify(rewritten)).toString("base64"),
          });
          return;
        }
        await cdp.send("Fetch.continueRequest", { requestId: p.requestId });
      } catch (err) {
        console.error(`interception error on ${p.request.url}: ${err.message}`);
        await cdp.send("Fetch.continueRequest", { requestId: p.requestId }).catch(() => {});
      }
    });
    await cdp.send("Fetch.enable", { patterns });

    const evaluate = async (expression, timeout = 90000) => {
      const res = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, timeout });
      if (res.exceptionDetails) {
        const d = res.exceptionDetails;
        throw new Error(`page error: ${d.exception?.description || d.text || "unknown"}`);
      }
      return res.result.value;
    };

    const navigate = async (url) => {
      const loaded = cdp.once("Page.loadEventFired");
      await cdp.send("Page.navigate", { url });
      let timer;
      try {
        await Promise.race([
          loaded,
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`page never fired load: ${url}`)), 60000);
          }),
        ]);
      } finally {
        // A pending 60 s timer kept every run alive for up to a minute after it finished.
        clearTimeout(timer);
      }
      await evaluate(`(() => { ${PAGE_HELPERS} ${SELECT_METHOD} ${RUN_SAMPLE} ${DRILL_HELPERS} return true; })()`);
      return evaluate(`({ visibilityState: document.visibilityState, hidden: document.hidden, href: location.href })`);
    };

    const waitForAnalytics = async (predicate, timeoutMs = 20000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const hit = analytics.find(predicate);
        if (hit) return hit;
        await new Promise((r) => setTimeout(r, 250));
      }
      return null;
    };

    const waitForSeriesLoad = async (predicate, sinceIndex = 0, timeoutMs = 30000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const hit = seriesLoads.slice(sinceIndex).find(predicate);
        if (hit) return hit;
        await new Promise((r) => setTimeout(r, 200));
      }
      return null;
    };

    return { cdp, evaluate, navigate, close, consoleMessages, predictRequests, predictResponses, analytics, waitForAnalytics, seriesCalls, seriesLoads, waitForSeriesLoad, chromePath };
  } catch (err) {
    close();
    throw err;
  }
}

// In-page readers for the drill. Installed by `navigate`, so every page load
// carries them; written as source because they run inside Chrome.
const DRILL_HELPERS = `
  window.__drill = (() => {
    const H = window.__p1;
    const norm = (s) => (s || "").replace(/\\s+/g, " ").trim();
    const dialog = () => document.querySelector('[role="dialog"]');
    const buttonsIn = (root) => Array.from((root || document).querySelectorAll("button"));

    const openSeriesDialog = async () => {
      await H.waitFor(() => H.trigger("series"), "the series trigger", 60000);
      if (!dialog()) H.trigger("series").click();
      await H.waitFor(() => dialog(), "the series dialog", 15000);
    };

    const closeDialog = async () => {
      if (!dialog()) return;
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      dialog()?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await H.waitFor(() => !dialog(), "the dialog to close", 15000);
    };

    // The decade level: what the Active group holds, and whether its empty copy shows.
    // Waits for the list to answer (group populated or the empty-state copy present).
    const readActiveGroup = async () => {
      await openSeriesDialog();
      const label = await H.waitFor(
        () => Array.from(dialog().querySelectorAll("p")).find((p) => norm(p.textContent) === "Current Game 7s"),
        "the Current Game 7s label", 30000);
      const settled = await H.waitFor(() => {
        const next = label.nextElementSibling;
        if (!next) return null;
        const btns = buttonsIn(next);
        const empty = /No active series right now/.test(next.textContent || "");
        return btns.length || empty ? { next, btns, empty } : null;
      }, "the Active group to settle", 30000);
      return {
        options: settled.btns.map((b) => norm(b.textContent)),
        emptyCopy: settled.empty,
      };
    };

    const clickInDialog = async (re, what) => {
      const btn = await H.waitFor(() => buttonsIn(dialog()).find((b) => re.test(norm(b.textContent)) && !/Go Back/i.test(b.textContent)), what, 15000);
      const text = norm(btn.textContent);
      btn.click();
      return text;
    };

    // decade -> year cards (text of every card in that decade)
    const readYearCards = async (decade) => {
      await clickInDialog(new RegExp("^" + decade + "s"), "decade " + decade);
      await H.waitFor(() => /Select Year from/.test(dialog().textContent), "the year level", 15000);
      return buttonsIn(dialog()).filter((b) => /^\\d{4}/.test(norm(b.textContent))).map((b) => norm(b.textContent));
    };

    const readSeriesLevel = async (year) => {
      await clickInDialog(new RegExp("^" + year), "year " + year);
      await H.waitFor(() => /Select Series from/.test(dialog().textContent), "the series level", 15000);
      return buttonsIn(dialog()).filter((b) => / vs /.test(b.textContent || "")).map((b) => norm(b.textContent));
    };

    const pickSeries = async (re) => {
      await clickInDialog(re, "a series option");
      await H.waitFor(() => !dialog(), "the dialog to close", 15000);
    };

    // The Series card's Games 1-6 readout, as printed.
    const readReadout = () => {
      const out = {};
      for (const span of document.querySelectorAll("span")) {
        const m = /^Game ([1-7])$/.exec(norm(span.textContent));
        if (!m || out[m[1]]) continue;
        const value = span.parentElement && span.parentElement.lastElementChild;
        if (value && value !== span) out[m[1]] = norm(value.textContent);
      }
      return out;
    };

    const seriesTriggerText = () => norm(H.trigger("series") && H.trigger("series").textContent);

    const homePending = () => Array.from(document.querySelectorAll("[data-home-pending-series] a")).map((a) => ({
      href: a.getAttribute("href"), text: norm(a.textContent), id: a.getAttribute("data-pending-series-id"),
    }));

    // /historical: the announced total, every rendered row, and the chips on them.
    const LEAGUE_CHIP = (el) => el.tagName === "SPAN" && /rounded-md/.test(el.className) && /tracking-widest/.test(el.className) && /^[A-Z]{3}$/.test(norm(el.textContent));
    const readHistorical = async () => {
      const announced = await H.waitFor(() => {
        const p = Array.from(document.querySelectorAll('p[aria-live="polite"]')).find((n) => /^Showing \\d+ of \\d+ series\\.$/.test(norm(n.textContent)));
        if (!p) return null;
        const m = /^Showing (\\d+) of (\\d+) series\\.$/.exec(norm(p.textContent));
        return Number(m[2]) > 0 ? { shown: Number(m[1]), total: Number(m[2]), text: norm(p.textContent) } : null;
      }, "the announced archive total", 60000);
      for (let i = 0; i < 100; i++) {
        const more = buttonsIn().find((b) => /Load More History/.test(b.textContent || ""));
        if (!more) break;
        const before = document.querySelectorAll("tbody tr").length;
        more.click();
        await H.waitFor(() => document.querySelectorAll("tbody tr").length > before, "more rows", 15000);
      }
      const rows = Array.from(document.querySelectorAll("tbody tr")).map((tr) => {
        const chip = Array.from(tr.querySelectorAll("span")).find(LEAGUE_CHIP);
        return { text: norm(tr.textContent), chip: chip ? norm(chip.textContent) : null };
      });
      const final = Array.from(document.querySelectorAll('p[aria-live="polite"]')).map((n) => norm(n.textContent)).find((t) => /^Showing/.test(t));
      return { announced, finalAnnouncement: final, rows };
    };

    // Open the first row matching (re) and read the record's chip and gloss.
    const openRecord = async (re) => {
      const tr = Array.from(document.querySelectorAll("tbody tr")).find((r) => re.test(norm(r.textContent)));
      if (!tr) return { missing: true };
      tr.click();
      const card = await H.waitFor(() => {
        return Array.from(document.querySelectorAll("div.fixed")).find((n) => /×/.test(n.textContent || "") && /Close/.test(n.textContent || "")) || null;
      }, "the record card", 15000);
      const chip = Array.from(card.querySelectorAll("span")).find(LEAGUE_CHIP);
      const gloss = Array.from(card.querySelectorAll("p")).map((p) => norm(p.textContent)).find((t) => /BAA is the league/.test(t)) || null;
      const title = norm(card.textContent).slice(0, 120);
      const closeBtn = buttonsIn(card).find((b) => /Close/.test(b.textContent || ""));
      closeBtn && closeBtn.click();
      await H.sleep(300);
      return { title, chip: chip ? norm(chip.textContent) : null, gloss };
    };

    return { openSeriesDialog, closeDialog, readActiveGroup, readYearCards, readSeriesLevel, pickSeries, readReadout, seriesTriggerText, homePending, readHistorical, openRecord, norm };
  })();
`;

/** Two real team rows, read once over anon REST, so the synthetic series embeds true team objects. */
async function readTeamRows(env, codes) {
  const select = "id,full_name,abbreviation,city,nickname,logo_url,created_at,updated_at";
  const res = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/teams?select=${select}&abbreviation=in.(${codes.join(",")})`, {
    headers: { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}` },
  });
  if (!res.ok) throw new Error(`teams read -> HTTP ${res.status}`);
  const rows = await res.json();
  const byCode = Object.fromEntries(rows.map((r) => [r.abbreviation, r]));
  for (const c of codes) if (!byCode[c]) throw new Error(`teams has no abbreviation ${c}`);
  return byCode;
}

/**
 * A synthetic series in SERIES_SELECT's shape. `games` lists
 * [home_code, away_code, home_score, away_score] per game, game 1 first —
 * team_a is game 1's home team (plan.ts's slot convention).
 */
export function buildSyntheticSeries({ id, year, round, teams, teamA, teamB, games, winner = null }) {
  const A = teams[teamA];
  const B = teams[teamB];
  const stamp = "2027-04-30T00:00:00+00:00";
  return {
    id,
    year,
    round,
    league: "NBA",
    team_a_id: A.id,
    team_b_id: B.id,
    winner_team_id: winner,
    created_at: stamp,
    updated_at: stamp,
    team_a: A,
    team_b: B,
    winner_team: null,
    series_game_scores: games.map(([home, away, hs, as], i) => ({
      id: `${id.slice(0, 24)}${String(i + 1).padStart(12, "0")}`,
      series_id: id,
      game_number: i + 1,
      home_team_id: teams[home].id,
      away_team_id: teams[away].id,
      home_score: hs,
      away_score: as,
      winner_team_id: hs > as ? teams[home].id : teams[away].id,
      created_at: stamp,
    })),
  };
}

// A certified 3–3: BOS (team_a, game-1 home) wins 1, 4, 5; MIA wins 2, 3, 6.
const FAKE_PENDING_GAMES = [
  ["BOS", "MIA", 110, 102],
  ["BOS", "MIA", 98, 105],
  ["MIA", "BOS", 108, 99],
  ["MIA", "BOS", 101, 112],
  ["BOS", "MIA", 120, 110],
  ["MIA", "BOS", 104, 95],
];
// Team-relative (BOS, MIA) per game — what the readout and the predict request must carry.
const FAKE_PENDING_TEAM_SCORES = [
  [110, 102],
  [98, 105],
  [99, 108],
  [112, 101],
  [120, 110],
  [95, 104],
];

function previewBase(url) {
  const u = new URL(url);
  const base = u.pathname.replace(/\/(predict|historical|insights)\/?$/, "/");
  return `${u.origin}${base.endsWith("/") ? base : `${base}/`}`;
}

async function assertPreviewUp(url) {
  const probe = await fetch(url, { method: "GET" }).catch(() => null);
  if (!probe || !probe.ok) {
    throw new Error(`${url} did not answer (${probe ? probe.status : "no response"}). Start it first:  npm run preview`);
  }
}

async function runFakeSeries(opts) {
  const mode = opts.fakeShort ? "--fake-short" : "--fake-pending";
  const env = readViteEnv();
  const base = previewBase(opts.url);
  await assertPreviewUp(`${base}predict`);
  const teams = await readTeamRows(env, ["BOS", "MIA", "OKC", "DEN"]);
  const pending = buildSyntheticSeries({
    id: FAKE_PENDING_ID,
    year: 2027,
    round: "Eastern Conference First Round",
    teams,
    teamA: "BOS",
    teamB: "MIA",
    games: FAKE_PENDING_GAMES,
  });
  const short = buildSyntheticSeries({
    id: FAKE_SHORT_ID,
    year: 2027,
    round: "Western Conference First Round",
    teams,
    teamA: "OKC",
    teamB: "DEN",
    games: [
      ["OKC", "DEN", 110, 102],
      ["OKC", "DEN", 104, 115],
      ["DEN", "OKC", 108, 99],
      ["DEN", "OKC", 101, 112],
      ["OKC", "DEN", 120, 110],
    ],
  });
  const synthetic = opts.fakeShort ? [pending, short] : [pending];

  // The override emulates the server-side filters the app sends, so a faked
  // row only lands where the real table would put it: never on /historical's
  // `winner_team_id=not.is.null` read.
  const seriesOverride = (body, { url, accept }) => {
    const q = decodeURIComponent(url);
    const idMatch = /[?&]id=eq\.([0-9a-f-]+)/.exec(q);
    if (idMatch) {
      const hit = synthetic.find((s) => s.id === idMatch[1]);
      if (!hit) return undefined;
      return /vnd\.pgrst\.object/.test(accept) ? hit : [hit];
    }
    if (/winner_team_id=not\.is\.null/.test(q)) return undefined;
    if (!Array.isArray(body)) return undefined;
    return [...synthetic, ...body];
  };

  const L = createLedger();
  console.log(
    [
      `Story 2.7 leg 3 — qa-matrix-1-5.md §6.5 option (c), ${mode}`,
      `  preview    ${base}`,
      `  backend    production read path (anon REST GETs; the series response rewritten in the browser only)`,
      `  synthetic  ${synthetic.map((s) => `${s.id} ${s.team_a.abbreviation}/${s.team_b.abbreviation} games=${s.series_game_scores.map((g) => g.game_number).join("")} winner=${s.winner_team_id}`).join("; ")}`,
      `  analytics  answered locally and decoded — nothing reaches the PostHog project`,
      "",
    ].join("\n")
  );

  const S = await openBrowserSession({ viewport: opts.viewport, seriesOverride, analyticsHost: env.VITE_POSTHOG_HOST || null });
  try {
    // 1. The picker, cold.
    const vis = await S.navigate(`${base}predict`);
    L.check("page visible (not a hidden-tab measurement)", vis.visibilityState === "visible" && vis.hidden === false, JSON.stringify(vis));
    const group = await S.evaluate("window.__drill.readActiveGroup()");
    console.log(`     Current Game 7s: ${JSON.stringify(group)}`);
    L.check("Active group renders exactly the synthetic six-row / null-winner series", group.options.length === 1 && /^BOS vs MIA/.test(group.options[0]));
    L.check("Active group's empty-state copy is absent while a series is pending", group.emptyCopy === false);
    // The list read is the one with no row filter: SERIES_SELECT itself names
    // `winner_team_id`, so only the filter forms (`=is.null`, `=not.is.null`)
    // and the preload's `id=eq.` mark the other reads.
    const listCall = S.seriesCalls.find((c) => !/[?&]id=eq\./.test(c.url) && !/[?&]winner_team_id=/.test(c.url));
    L.check("the picker's list response was rewritten in flight (Fetch, Response stage)", Boolean(listCall?.rewritten), listCall?.url ?? "no list call seen");

    const years = await S.evaluate("window.__drill.readYearCards(2020)");
    console.log(`     2020s year cards: ${JSON.stringify(years)}`);
    L.check("year card 2027 reads `Current`", years.some((y) => /^2027/.test(y) && /Current/.test(y)));
    L.check("year card 2026 (archived only) reads `View Series`", years.some((y) => /^2026/.test(y) && /View Series/.test(y) && !/Current/.test(y)));
    const level = await S.evaluate("window.__drill.readSeriesLevel(2027)");
    console.log(`     2027 series level: ${JSON.stringify(level)}`);
    L.check("2027's series level lists the synthetic series", level.some((t) => /^BOS vs MIA/.test(t)));

    if (opts.fakeShort) {
      L.check("five-row / null-winner series is excluded from the Active group", !group.options.some((t) => /OKC vs DEN/.test(t)));
      L.check("five-row / null-winner series is excluded from its year's series level", !level.some((t) => /OKC vs DEN/.test(t)));
      const report = S.consoleMessages.find((m) => /Non-reconciling series:/.test(m.text) && m.text.includes(FAKE_SHORT_ID));
      L.check("`Non-reconciling series:` logged naming the short row", Boolean(report), report ? report.text.slice(0, 160) : "no such console line");
      const pendingReported = S.consoleMessages.some((m) => /Non-reconciling series:/.test(m.text) && m.text.includes(FAKE_PENDING_ID));
      L.check("the six-row row is NOT reported as non-reconciling", !pendingReported);
      const exc = await S.waitForAnalytics((e) => e.event === "$exception" && JSON.stringify(e.properties).includes(FAKE_SHORT_ID), 20000);
      L.check("captureException sent for the short row (decoded, answered locally)", Boolean(exc));
      await S.evaluate("window.__drill.closeDialog()");
      await S.navigate(base);
      const home = await S.evaluate(`window.__p1.waitFor(() => window.__drill.homePending().length ? window.__drill.homePending() : null, "a Home pending link", 30000)`);
      console.log(`     Home pending links: ${JSON.stringify(home)}`);
      L.check("Home links the six-row series and drops the five-row one", home.length === 1 && home[0].id === FAKE_PENDING_ID);
    } else {
      // 2. Select it, read the readout and the reported source.
      await S.evaluate("window.__drill.pickSeries(/^BOS vs MIA/)");
      const readout = await S.evaluate("window.__drill.readReadout()");
      console.log(`     readout: ${JSON.stringify(readout)}`);
      const expectedReadout = FAKE_PENDING_TEAM_SCORES.every(([a, b], i) => readout[String(i + 1)] === `${a} — ${b}`);
      L.check("Series card readout prints games 1–6 team-relative from the home-relative rows", expectedReadout);
      const selected = await S.waitForAnalytics((e) => e.event === "series_selected" && e.properties.series_id === FAKE_PENDING_ID);
      L.check("selecting it reports series_source: 'current'", selected?.properties?.series_source === "current", selected ? `series_source=${selected.properties.series_source}` : "no series_selected event decoded");

      // 3. Predict: the request carries six games and the real function answers.
      await S.evaluate(`window.__p1SelectMethod(/Bayes/i, ${opts.timeout})`);
      const sample = await S.evaluate(`window.__p1RunSample(${opts.timeout})`, opts.timeout + 30000);
      const req = S.predictRequests.at(-1);
      let body = null;
      try {
        body = JSON.parse(req?.body ?? "null");
      } catch {
        body = null;
      }
      const sixGames = Boolean(body) && FAKE_PENDING_TEAM_SCORES.every(([a, b], i) => body[`game_${i + 1}_score_a`] === a && body[`game_${i + 1}_score_b`] === b);
      L.check("the predict request carries six games, team-relative", sixGames, body ? JSON.stringify(body) : "no request body captured");
      L.check("the predict request names the synthetic series and no Game-7 home side", body?.series_id === FAKE_PENDING_ID && body?.home_team === undefined);
      const status = req ? S.predictResponses.get(req.requestId) : undefined;
      L.check("the deployed predict-game-7 answered 200 and the result rendered", status === 200 && sample.to_result_ms > 0, `status=${status} to_result=${Math.round(sample.to_result_ms)}ms`);
      const generated = await S.waitForAnalytics((e) => e.event === "prediction_generated" && e.properties.series_id === FAKE_PENDING_ID);
      L.check("prediction_generated reports series_source: 'current'", generated?.properties?.series_source === "current", generated ? `series_source=${generated.properties.series_source}` : "no prediction_generated event decoded");

      // 4. The ?series=<id> preload.
      await S.navigate(`${base}predict?series=${FAKE_PENDING_ID}`);
      // The preloaded series is read off the Series card's Games 1-6 readout
      // (the trigger keeps its "Select a Series" label, so its text is no signal).
      const preRead = await S.evaluate(`window.__p1.waitFor(() => { const r = window.__drill.readReadout(); return Object.keys(r).length >= 6 ? r : null; }, "the preloaded selection's readout", 30000)`);
      const notFound = await S.evaluate(`(document.body.textContent || "").includes("Series not found")`);
      const preloadMatches = FAKE_PENDING_TEAM_SCORES.every(([a, b], i) => preRead[String(i + 1)] === `${a} — ${b}`);
      L.check("preload ?series=<id> resolves the synthetic series", preloadMatches && !notFound, JSON.stringify(preRead));
      const preloadCall = S.seriesCalls.find((c) => /id=eq\./.test(c.url));
      L.check("the preload's ?id=eq. response was served from the override", Boolean(preloadCall?.rewritten), preloadCall?.url ?? "no preload call seen");
      await S.evaluate(`window.__p1SelectMethod(/Bayes/i, ${opts.timeout})`);
      const before = S.analytics.length;
      await S.evaluate(`window.__p1RunSample(${opts.timeout})`, opts.timeout + 30000);
      const preGen = await S.waitForAnalytics((e, i) => e.event === "prediction_generated" && e.properties.series_id === FAKE_PENDING_ID && S.analytics.indexOf(e) >= before);
      L.check("the preloaded selection predicts with series_source: 'current'", preGen?.properties?.series_source === "current", preGen ? `series_source=${preGen.properties.series_source}` : "no event decoded");

      // 5. Home's data reach (D2): present, and resolving to the preview page.
      await S.navigate(base);
      const home = await S.evaluate(`window.__p1.waitFor(() => window.__drill.homePending().length ? window.__drill.homePending() : null, "a Home pending link", 30000)`);
      console.log(`     Home pending links: ${JSON.stringify(home)}`);
      L.check("Home renders one pending link for the synthetic series", home.length === 1 && home[0].id === FAKE_PENDING_ID, home[0]?.text);
      // The router prefixes its basename (`/predictgame7/`), so the rendered href ends with the route.
      L.check("its href is <basename>/predict?series=<id>", Boolean(home[0]?.href?.endsWith(`/predict?series=${FAKE_PENDING_ID}`)), home[0]?.href);
      await S.evaluate(`document.querySelector('[data-home-pending-series] a').click()`);
      const landed = await S.evaluate(`window.__p1.waitFor(() => Object.keys(window.__drill.readReadout()).length >= 6 ? { href: location.href, readout: window.__drill.readReadout() } : null, "the preview page", 30000)`);
      const landedMatches = FAKE_PENDING_TEAM_SCORES.every(([a, b], i) => landed.readout[String(i + 1)] === `${a} — ${b}`);
      L.check("following it lands on that series' preview page, preloaded", landed.href.endsWith(`/predict?series=${FAKE_PENDING_ID}`) && landedMatches, landed.href);
    }

    const leaked = S.analytics.length;
    console.log(`\n     PostHog events decoded and answered locally: ${leaked} (${[...new Set(S.analytics.map((e) => e.event))].join(", ") || "none"})`);
  } finally {
    S.close();
  }
  if (L.failures.length) {
    console.log(`\nRED: ${L.failures.length} assertion(s) failed — ${L.failures.join("; ")}`);
    process.exitCode = 1;
    return;
  }
  console.log(`\nGREEN: ${mode} — every assertion held.`);
}

async function runArchiveRead(opts) {
  const base = previewBase(opts.url);
  await assertPreviewUp(`${base}historical`);
  const env = readViteEnv();
  const L = createLedger();
  console.log(`Story 2.7 leg 1 (UI half) — /historical and /insights against production\n  preview ${base}\n`);
  const S = await openBrowserSession({ viewport: opts.viewport, analyticsHost: env.VITE_POSTHOG_HOST || null });
  try {
    await S.navigate(`${base}historical`);
    const h = await S.evaluate("window.__drill.readHistorical()", 180000);
    const chips = h.rows.filter((r) => r.chip);
    const tally = chips.reduce((acc, r) => ({ ...acc, [r.chip]: (acc[r.chip] ?? 0) + 1 }), {});
    console.log(`     announced at load: "${h.announced.text}"; after paging: "${h.finalAnnouncement}"; rows rendered ${h.rows.length}; chips ${JSON.stringify(tally)}`);
    L.check("the announced archive total is 178", h.announced.total === 178, h.announced.text);
    L.check("all 178 rows render once paged through", h.rows.length === 178, `rendered ${h.rows.length}`);
    L.check("19 rows carry a league chip (18 ABA + 1 BAA), no NBA chip", chips.length === 19 && tally.ABA === 18 && tally.BAA === 1 && !tally.NBA, JSON.stringify(tally));
    const baa = await S.evaluate(`window.__drill.openRecord(/BAA/)`);
    console.log(`     chipped record: ${JSON.stringify(baa)}`);
    L.check("a chipped record repeats its chip and carries the gloss sentence", baa.chip === "BAA" && /^BAA is the league that became the NBA in 1949/.test(baa.gloss ?? ""));
    const nbaRow = h.rows.find((r) => !r.chip);
    const nbaRe = nbaRow ? new RegExp(nbaRow.text.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) : /$^/;
    const nba = await S.evaluate(`window.__drill.openRecord(${nbaRe.toString()})`);
    L.check("an NBA record carries neither chip nor gloss", !nba.missing && nba.chip === null && nba.gloss === null, JSON.stringify(nba).slice(0, 160));

    await S.navigate(`${base}insights`);
    const ins = await S.evaluate(`window.__p1.waitFor(() => {
      const t = (document.body.textContent || "").replace(/\\s+/g, " ");
      const g6 = /Based on (\\d+) historical Game 7s/.exec(t);
      const home = /Home teams won (\\d+) out of (\\d+) Game 7s/.exec(t);
      return g6 && Number(g6[1]) > 0 && home ? { g6: Number(g6[1]), homeWins: Number(home[1]), homeTotal: Number(home[2]) } : null;
    }, "the insight cards", 60000)`);
    L.check("/insights counts 160 Game 7s", ins.g6 === 160 && ins.homeTotal === 160, JSON.stringify(ins));
    L.check("/insights home-court card reads 117 of 160", ins.homeWins === 117);
    console.log("\n== shown side by side ==");
    console.log(`  /historical announces ${h.announced.total} series; ${chips.length} chipped (${tally.ABA ?? 0} ABA + ${tally.BAA ?? 0} BAA)`);
    console.log(`  /insights counts      ${ins.g6} Game 7s = ${h.announced.total} - ${tally.ABA ?? 0} ABA (the population is league IN ('NBA','BAA'), 00016/00017; the gloss explains it to readers)`);
  } finally {
    S.close();
  }
  if (L.failures.length) {
    console.log(`\nRED: ${L.failures.length} assertion(s) failed — ${L.failures.join("; ")}`);
    process.exitCode = 1;
    return;
  }
  console.log("\nGREEN: --archive-read — every assertion held.");
}

// Run only when executed directly: `scripts/drill-2-7-local-stack.mjs` imports the
// CDP session and the page readers below without starting a latency study.
const invokedDirectly =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (invokedDirectly) {
  main().catch((err) => {
    console.error(`\n${err.stack || err.message}`);
    // exitCode, not exit(): an explicit exit races libuv teardown on Windows
    // (deferred-work.md W1), and a failed assertion here must read as 1.
    process.exitCode = 1;
  });
}
