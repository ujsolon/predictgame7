// Story 4.1 deep-link probe (AD-6): cold GETs on every route, the
// `/series/<id>?method=<slug>` share arrival, and the 404 treatment, measured in
// a real headless Chrome rather than asserted in jsdom.
//
// Usage:
//   npm run build && npx vite preview --port 4317 --strictPort     # or: npm run preview
//   node scripts/probe-deep-links.mjs http://localhost:4317/predictgame7/
//   node scripts/probe-deep-links.mjs https://ujsolon.github.io/predictgame7/   # after a deploy
//
// Options:
//   --series=<uuid>   the known series to share-arrive on. Without it, the probe
//                     reads one archived series id over anon REST using
//                     VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from .env.
//
// What it checks, row by row (every row prints; any FAIL exits 1):
//   1. `<base>404.html` exists and is byte-identical to the shell `<base>` serves.
//   2. A cold GET (fresh navigation, no client routing) on /predict, /historical,
//      /insights and /maths returns the SPA shell and the app renders that route
//      under the base path. The HTTP status is printed: GitHub Pages answers 404
//      with the shell (that is the fallback working); `vite preview` answers 200
//      from its own SPA fallback, so on preview row 1 is what proves the file.
//   3. `/series/<known>?method=elo` lands on `/predict?series=<id>&method=elo`,
//      with the series and Elo selected and no predict-game-7 request sent
//      (owner decision D1: nothing runs until Generate).
//   4. `/series/<unknown uuid>` and `/series/abc` render the 404 treatment:
//      the `<h1>`, the document title, focus on the headline, the Historical link.
//
// PostHog traffic is answered locally by `openBrowserSession`, so no event from
// this probe reaches the production project.

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createLedger, openBrowserSession } from "./measure-predict-latency.mjs";

const HEADLINE = "This series doesn't exist.";
const ROUTES = [
  { path: "predict", h1: "Win Probability" },
  { path: "historical", h1: "Archives" },
  { path: "insights", h1: "Insights Dashboard" },
  { path: "maths", h1: "Methodology" },
];

function parseArgs(argv) {
  const opts = { base: null, series: null };
  for (const arg of argv) {
    if (arg.startsWith("--series=")) opts.series = arg.slice("--series=".length);
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else if (!arg.startsWith("--")) opts.base = arg;
    else throw new Error(`unknown option ${arg}`);
  }
  return opts;
}

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

/** One archived series (id + stored team codes) over anon REST — derived phase, never `status` (AD-4). */
async function readKnownSeries(seriesId) {
  const env = readEnv();
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    if (seriesId) return { id: seriesId, codes: null };
    throw new Error("no --series=<uuid> and no VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env");
  }
  // Same embed syntax as `src/lib/series-query.ts`.
  const select = "id,year,round,team_a:team_a_id(abbreviation),team_b:team_b_id(abbreviation)";
  const filter = seriesId ? `id=eq.${encodeURIComponent(seriesId)}` : "winner_team_id=not.is.null&order=year.desc&limit=1";
  const res = await fetch(`${url}/rest/v1/series?select=${select}&${filter}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`series lookup failed: HTTP ${res.status}`);
  const rows = await res.json();
  if (!rows.length) throw new Error(seriesId ? `--series=${seriesId} names no row` : "no archived series found");
  const row = rows[0];
  const codes = row.team_a?.abbreviation && row.team_b?.abbreviation ? [row.team_a.abbreviation, row.team_b.abbreviation] : null;
  return { id: row.id, codes, label: `${row.year} ${row.round}` };
}

/** WCAG 2.1 contrast ratio between two computed `rgb(...)` colors. */
function contrast(fg, bg) {
  const lum = (c) => {
    const [r, g, b] = (c.match(/\d+(\.\d+)?/g) || [0, 0, 0]).slice(0, 3).map((v) => {
      const s = Number(v) / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// In-page readers. Plain source strings: they run inside Chrome.
const WAIT = `(async (fn, what, timeout) => {
  const t0 = Date.now();
  for (;;) {
    let v; try { v = fn(); } catch { v = null; }
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error("timed out waiting for " + what);
    await new Promise((r) => setTimeout(r, 50));
  }
})`;

const norm = `((s) => (s || "").replace(/\\s+/g, " ").trim())`;

function readRoute(expectedH1) {
  return `${WAIT}(() => {
    const n = ${norm};
    const h1s = Array.from(document.querySelectorAll("h1")).map((h) => n(h.textContent));
    return h1s.includes(${JSON.stringify(expectedH1)}) ? { pathname: location.pathname, search: location.search, h1s } : null;
  }, "the ${expectedH1} heading", 30000)`;
}

const READ_PRELOAD = `${WAIT}(() => {
  const n = ${norm};
  if (!location.pathname.endsWith("/predict")) return null;
  const buttons = Array.from(document.querySelectorAll("button"));
  // Unselected, the method trigger reads "Not selected … Click to choose method";
  // selected, it reads the method's label and description instead.
  const method = buttons.find((b) => /^\\s*(Click to choose method|Not selected|Logistic Regression|Bayes Method|Elo Rating|Exponential Smoothing)/.test(b.textContent || ""));
  const series = buttons.find((b) => / vs /.test(b.textContent || "") && !/Click to choose/.test(b.textContent || ""));
  if (!method || !series) return null;
  const methodText = n(method.textContent);
  if (/Not selected/.test(methodText)) return null;
  const games = Array.from(document.querySelectorAll("span"))
    .filter((s) => /^Game [1-6]$/.test(n(s.textContent)))
    .map((s) => n(s.parentElement && s.parentElement.lastElementChild && s.parentElement.lastElementChild.textContent));
  const generate = buttons.find((b) => /Click to generate prediction/.test(b.textContent || ""));
  return {
    pathname: location.pathname,
    search: location.search,
    seriesText: n(series.textContent),
    methodText,
    games,
    generateEnabled: !!generate && !generate.disabled,
    resultShown: (document.body.textContent || "").includes("Predicted Winner"),
  };
}, "the preloaded series and method on Predict", 30000)`;

const READ_NOT_FOUND = `${WAIT}(() => {
  const n = ${norm};
  const h1 = document.querySelector("[data-series-not-found] h1");
  if (!h1) return null;
  const block = h1.closest("[data-series-not-found]");
  const link = block.querySelector("a");
  const linkBox = link ? link.getBoundingClientRect() : null;
  const cs = getComputedStyle(block.querySelector("p"));
  return {
    pathname: location.pathname,
    headline: n(h1.textContent),
    line: n(block.querySelector("p") && block.querySelector("p").textContent),
    title: document.title,
    focused: document.activeElement === h1,
    linkHref: link && link.getAttribute("href"),
    linkText: link && n(link.textContent),
    linkSize: linkBox ? [Math.round(linkBox.width), Math.round(linkBox.height)] : null,
    lineColor: cs.color,
  };
}, "the 404 headline", 30000)`;

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.base) {
    console.log("usage: node scripts/probe-deep-links.mjs <base-url> [--series=<uuid>]");
    if (!opts.help) process.exitCode = 1;
    return;
  }
  const base = opts.base.endsWith("/") ? opts.base : `${opts.base}/`;
  const L = createLedger();
  console.log(`Story 4.1 deep-link probe — ${base}  (${new Date().toISOString()})\n`);

  // Row 1: the fallback file itself.
  const shellRes = await fetch(base).catch((e) => ({ ok: false, status: e.message }));
  if (!shellRes.ok) throw new Error(`${base} did not answer (${shellRes.status}). Start the server first.`);
  const shell = Buffer.from(await shellRes.arrayBuffer());
  const fallbackRes = await fetch(`${base}404.html`);
  const fallback = Buffer.from(await fallbackRes.arrayBuffer());
  L.check("404.html is served and byte-identical to the shell", fallbackRes.ok && fallback.equals(shell), `HTTP ${fallbackRes.status}, ${fallback.length} vs ${shell.length} bytes`);

  // Row 2 (HTTP half): every cold GET answers with the SPA shell.
  const known = await readKnownSeries(opts.series);
  const unknownId = randomUUID();
  const coldPaths = [...ROUTES.map((r) => r.path), `series/${known.id}?method=elo`, `series/${unknownId}`];
  for (const path of coldPaths) {
    const res = await fetch(`${base}${path}`);
    const body = Buffer.from(await res.arrayBuffer());
    L.check(`cold GET /${path} returns the SPA shell`, body.equals(shell), `HTTP ${res.status}`);
  }

  const S = await openBrowserSession({ viewport: "1440x900", analyticsHost: readEnv().VITE_POSTHOG_HOST || null });
  try {
    // Row 2 (render half): each route renders under the base path.
    for (const route of ROUTES) {
      await S.navigate(`${base}${route.path}`);
      const r = await S.evaluate(readRoute(route.h1)).catch((e) => ({ error: e.message }));
      L.check(
        `cold GET /${route.path} renders "${route.h1}" at ${new URL(base).pathname}${route.path}`,
        !r.error && r.pathname === `${new URL(base).pathname}${route.path}`,
        r.error ?? r.pathname
      );
    }

    // Row 3: the share arrival.
    const sentBefore = S.predictRequests.length;
    await S.navigate(`${base}series/${known.id}?method=elo`);
    const p = await S.evaluate(READ_PRELOAD).catch((e) => ({ error: e.message }));
    console.log(`     known series ${known.id}${known.label ? ` (${known.label})` : ""}: ${JSON.stringify(p)}`);
    L.check("share arrival redirects to /predict?series=<id>&method=elo", !p.error && p.search === `?series=${known.id}&method=elo`, p.error ?? `${p.pathname}${p.search}`);
    L.check("the series is preloaded", !p.error && (known.codes ? p.seriesText.includes(`${known.codes[0]} vs ${known.codes[1]}`) : / vs /.test(p.seriesText)) && p.games.length === 6, p.error ?? p.seriesText);
    L.check("Elo Rating is the selected method", !p.error && p.methodText.includes("Elo Rating"), p.error ?? p.methodText);
    // Settle window: a request fired a tick after the preload painted must still count.
    await new Promise((r) => setTimeout(r, 1500));
    L.check("Generate is ready and nothing ran on arrival (D1)", !p.error && p.generateEnabled && !p.resultShown && S.predictRequests.length === sentBefore);

    // Row 4: unknown and malformed ids.
    for (const [label, path] of [
      ["unknown id", `series/${unknownId}`],
      ["malformed id", "series/abc"],
    ]) {
      await S.navigate(`${base}${path}`);
      const nf = await S.evaluate(READ_NOT_FOUND).catch((e) => ({ error: e.message }));
      console.log(`     ${label}: ${JSON.stringify(nf)}`);
      L.check(`${label}: the 404 headline renders at /${path}`, !nf.error && nf.headline === HEADLINE && nf.pathname.endsWith(`/${path}`), nf.error ?? nf.headline);
      L.check(`${label}: the one line follows`, !nf.error && nf.line === "It may have been removed, or the link is wrong.");
      L.check(`${label}: the document title updates`, !nf.error && nf.title === HEADLINE, nf.title);
      L.check(`${label}: focus is on the headline`, !nf.error && nf.focused);
      L.check(`${label}: the line meets AA contrast on white`, !nf.error && contrast(nf.lineColor, "rgb(255, 255, 255)") >= 4.5, nf.error ?? `${nf.lineColor} ${contrast(nf.lineColor, "rgb(255, 255, 255)").toFixed(2)}:1`);
      // Keyboard: from the focused headline, Tab reaches the Historical link,
      // and the link paints a visible focus indicator.
      await S.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
      await S.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
      const kb = await S.evaluate(`(() => {
        const a = document.activeElement;
        const cs = getComputedStyle(a);
        return { tag: a.tagName, href: a.getAttribute("href"), boxShadow: cs.boxShadow, outlineStyle: cs.outlineStyle, color: cs.color };
      })()`);
      console.log(`     ${label} after Tab: ${JSON.stringify(kb)}`);
      L.check(
        `${label}: Tab from the headline reaches the Historical link with a visible focus ring`,
        kb.tag === "A" && kb.href === nf.linkHref && (kb.boxShadow !== "none" || kb.outlineStyle !== "none") && contrast(kb.color, "rgb(255, 255, 255)") >= 4.5,
        `${kb.tag} ${kb.boxShadow}`
      );
      L.check(
        `${label}: one onward link to Historical, >=44px tall`,
        !nf.error && nf.linkHref === `${new URL(base).pathname}historical` && nf.linkSize && nf.linkSize[1] >= 44,
        nf.error ?? `${nf.linkHref} ${JSON.stringify(nf.linkSize)}`
      );
    }
  } finally {
    S.close();
  }

  if (L.failures.length) {
    console.log(`\nRED: ${L.failures.length} assertion(s) failed — ${L.failures.join("; ")}`);
    process.exitCode = 1;
    return;
  }
  console.log("\nGREEN: every deep-link row held.");
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
