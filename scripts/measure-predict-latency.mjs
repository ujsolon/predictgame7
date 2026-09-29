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
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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
    else if (a === "--help" || a === "-h") {
      console.log(readFileSync(new URL(import.meta.url), "utf8").split("\n").filter((l) => l.startsWith("//")).join("\n"));
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${a}`);
      process.exit(2);
    }
  }
  if (!PROFILES[opts.profile]) {
    console.error(`Unknown --profile. One of: ${Object.keys(PROFILES).join(", ")}`);
    process.exit(2);
  }
  return opts;
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
