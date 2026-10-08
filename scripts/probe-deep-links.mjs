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
//      (owner decision D1: nothing runs until Generate). Live on GitHub Pages
//      (since Story 4.8), a direct `/predict?…` request 301s to the static shell
//      at `/predict/?…` with the query kept, and `vite preview` does not redirect.
//      So the preload read accepts either path; the rows assert the query (Story 4.7).
//   4. `/series/<unknown uuid>` and `/series/abc` render the 404 treatment:
//      the `<h1>`, the document title, focus on the headline, the Historical link.
//   5. (Story 4.3, Story 4.5) The five flagship ids exist over anon REST,
//      archived (winner set, games 1–7), with the expected team abbreviations,
//      and each carries `is_featured = true` on the live table. Other rows may
//      be featured too (a pending series can be). Until the owner applies
//      migration `00019` this row FAILS (the column does not exist yet).
//   6. (Story 4.3) The 2016 Finals flagship preview at `/series/<id>`: games
//      1–6 only, and `document.body.innerText` carries no Game 7 score (read
//      over anon REST) and no "win Game 7"; a winner-free title. A real mouse
//      click on "See how the series ended →" lands on `/series/<id>/result`,
//      whose `<h1>` is `document.activeElement`, with the outcome title.
//   7. (Story 4.3) An ABA archive series renders the single full-record page:
//      "ABA" in the eyebrow, seven games, no home/away/venue wording.
//      Its `/result` (non-flagship) renders the 404.
//   8. (Story 4.8) JS-disabled fetches (plain HTTP, no browser) of one page per
//      variant — record, flagship preview, flagship result — and one app-route
//      shell: HTTP 200, the page content inside `#root` (an empty root for the
//      shell), and absolute og:title/description/url/image, og:type,
//      twitter:card and the canonical link.
//   9. (Story 4.8) All five flagship preview files are clean against the live
//      Game 7 scores read over anon REST (no score pair in either order, no
//      `game_number":7`, no winner embed, no "win Game 7" / "4–3"), and each
//      result file carries the pair.
//  10. (Story 4.8) `sitemap.xml` answers 200, is well-formed, and lists home,
//      the four app routes and one URL per live series plus one per flagship
//      result (rows + flagships); `robots.txt` points at it.
//  11. (Story 4.8) A cold load of a prerendered page — record, flagship
//      preview, flagship result — hydrates: zero console errors and zero
//      uncaught exceptions (React reports a hydration mismatch through them),
//      the server-rendered first node of `#root` (recorded before the app
//      script runs) is still connected — hydrateRoot keeps it, createRoot
//      replaces it — and no `rest/v1/series` request is sent.
//      Rows 3 and 6 load the prerendered files too (`series/<id>/`, the URL
//      GitHub Pages 301s to): the `?method=` arrival renders client-side and
//      redirects, and the reveal click from a hydrated preview focuses the
//      result `<h1>`.
//  12. (Story 4.4) Share round-trip. From a completed series prediction (the
//      known series, Elo) and from a custom one ("Montréal", Bayes), the
//      detailed view's Share button is focusable with a >=44x44 box; a real
//      CDP click with `navigator.share` removed and `navigator.clipboard.writeText`
//      stubbed captures the URL (`…/series/<id>/?method=elo&utm_source=share`,
//      `…/predict/?custom=<payload>&utm_source=share`), "Link copied." shows,
//      and `prediction_shared` is decoded locally with its props. Each URL is
//      then opened in a FRESH browser (new Chrome, new profile): the same
//      series or matchup and method are selected, no predict-game-7 request is
//      sent, and the landing `$pageview` (decoded locally) carries
//      `utm_source=share`. Row 12 sends two real predict-game-7 requests (the
//      two predictions being shared); the function is stateless.
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

/** Story 4.8: the site every prerendered URL is absolute under. */
const SITE_URL = "https://ujsolon.github.io/predictgame7/";

function metaContent(html, key) {
  const m = new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`).exec(html);
  return m ? m[1] : null;
}

/** The markup inside `#root` of a prerendered file, up to the preload script. */
function rootMarkup(html) {
  const start = html.indexOf('<div id="root">');
  if (start < 0) return null;
  const end = html.indexOf('<script type="application/json" id="pg7-preload">');
  return end > start ? html.slice(start, end) : html.slice(start);
}

/** The `#pg7-preload` JSON of a prerendered file, parsed (null when absent or malformed). */
function parsePreloadOf(html) {
  const m = /<script type="application\/json" id="pg7-preload">([^<]*)<\/script>/.exec(html);
  try {
    return m ? JSON.parse(m[1]) : null;
  } catch {
    return null;
  }
}

/** `src/lib/spoiler-neutral.ts`'s rule, restated for this plain-JS probe: true when `b` should precede `a`. */
function swapsForNeutralOrder(a, b) {
  const word = (t) => (t.nickname && t.nickname.trim()) || t.full_name;
  const byWord = word(a).localeCompare(word(b), "en", { sensitivity: "base" });
  if (byWord !== 0) return byWord > 0;
  const byName = a.full_name.localeCompare(b.full_name, "en", { sensitivity: "base" });
  if (byName !== 0) return byName > 0;
  return String(a.id) > String(b.id);
}

/** Whether `html` is the prerendered file for `path` (GitHub Pages 301s `/x` to `/x/`, and fetch follows). */
function isPrerenderedFor(html, path) {
  const clean = path.split("?")[0].replace(/\/+$/, "");
  return html.includes(`<link rel="canonical" href="${SITE_URL}${clean}/" />`);
}

function readRoute(expectedH1) {
  return `${WAIT}(() => {
    const n = ${norm};
    const h1s = Array.from(document.querySelectorAll("h1")).map((h) => n(h.textContent));
    return h1s.includes(${JSON.stringify(expectedH1)}) ? { pathname: location.pathname, search: location.search, h1s } : null;
  }, "the ${expectedH1} heading", 30000)`;
}

const READ_PRELOAD = `${WAIT}(() => {
  const n = ${norm};
  // Story 4.7: live, /predict?... 301s to the 4.8 shell at /predict/?..., so a trailing slash is accepted.
  if (!location.pathname.replace(/\\/+$/, "").endsWith("/predict")) return null;
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

/** Story 4.4: fills an input the way a fan types — React reads the native value setter. */
const SET_INPUT = `((id, value) => {
  const el = document.getElementById(id);
  if (!el) throw new Error("no input #" + id);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
})`;

/** Story 4.4: removes the native sheet and captures what the clipboard is given. */
const STUB_SHARE_TARGETS = `(() => {
  window.__pg7Shared = [];
  Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: (text) => { window.__pg7Shared.push(text); return Promise.resolve(); } },
    configurable: true,
  });
  return true;
})()`;

/** Story 4.4: the detailed view's Share button — focusable, its box, and its center for a real click. */
const READ_SHARE_BUTTON = `${WAIT}(() => {
  const b = document.querySelector("[data-share-button]");
  if (!b) return null;
  b.scrollIntoView({ block: "center" });
  b.focus();
  const r = b.getBoundingClientRect();
  return {
    text: (b.textContent || "").trim(),
    focused: document.activeElement === b,
    w: Math.round(r.width),
    h: Math.round(r.height),
    x: r.left + r.width / 2,
    y: r.top + r.height / 2,
  };
}, "the Share button", 30000)`;

/** Story 4.4: a `?custom=` arrival's prefilled form, read once both names are in. */
/**
 * Story 4.4: the focused element's focus indicator and colors. The effective
 * background is the first ancestor-or-self with an opaque background color
 * (white when none is), which is what the foreground is composited over.
 */
const READ_FOCUS_STYLE = `(() => {
  const a = document.activeElement;
  if (!a) return { error: "nothing focused" };
  const cs = getComputedStyle(a);
  let bg = "rgb(255, 255, 255)";
  let bgFrom = "default white";
  for (let n = a; n; n = n.parentElement) {
    const c = getComputedStyle(n).backgroundColor;
    const parts = c.match(/[\d.]+/g) || [];
    if (parts.length >= 3 && (parts.length < 4 || Number(parts[3]) === 1)) {
      bg = c;
      bgFrom = n.tagName.toLowerCase() + (n.id ? "#" + n.id : "");
      break;
    }
  }
  return {
    isShare: a.hasAttribute("data-share-button"),
    focusVisible: a.matches(":focus-visible"),
    boxShadow: cs.boxShadow,
    outlineStyle: cs.outlineStyle,
    outlineWidth: cs.outlineWidth,
    color: cs.color,
    bg,
    bgFrom,
  };
})()`;

const READ_CUSTOM_ARRIVAL = `${WAIT}(() => {
  const a = document.getElementById("team_a");
  if (!a || !a.value) return null;
  const buttons = Array.from(document.querySelectorAll("button"));
  const generate = buttons.find((b) => /Click to generate prediction/.test(b.textContent || ""));
  const scores = [];
  for (let g = 1; g <= 6; g++) for (const side of ["a", "b"]) scores.push(Number((document.getElementById("game_" + g + "_score_" + side) || {}).value));
  const method = buttons.find((b) => /^\\s*(Not selected|Logistic Regression|Bayes Method|Elo Rating|Exponential Smoothing)/.test(b.textContent || ""));
  return {
    pathname: location.pathname,
    search: location.search,
    teamA: a.value,
    teamB: document.getElementById("team_b").value,
    scores,
    methodText: method ? method.textContent : "",
    generateEnabled: !!generate && !generate.disabled,
    resultShown: (document.body.textContent || "").includes("Predicted Winner"),
  };
}, "the prefilled custom matchup", 30000)`;

/** Story 4.4: the custom matchup row 12 shares, games 1–6 in grid order. */
const CUSTOM_SCORES = [101, 91, 92, 102, 103, 93, 94, 104, 105, 95, 96, 106];

const READ_NOT_FOUND = `${WAIT}(() => {
  const n = ${norm};
  const h1 = document.querySelector("[data-series-not-found] h1");
  // react-helmet-async writes the title a frame after the commit, so reading it
  // in the same tick as the headline raced (measured: "" on one run, Story 4.3).
  if (!h1 || !document.title) return null;
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

/** Story 4.3: the 2016 Finals flagship (featured by migration `00019` since Story 4.5). */
const FLAGSHIP_2016 = "06715a85-ec33-46a4-8383-d058055eefe6";

/** Rows over anon REST, same embed syntax as `src/lib/series-query.ts`. Needs .env. */
async function restRows(filter, select) {
  const env = readEnv();
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) throw new Error("Story 4.3 rows need VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env");
  const res = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/series?select=${select}&${filter}`, {
    headers: { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}` },
  });
  if (!res.ok) throw new Error(`series lookup failed: HTTP ${res.status}`);
  return res.json();
}

async function restSeries(filter, select) {
  const rows = await restRows(filter, select);
  if (!rows.length) throw new Error(`no series row for ${filter}`);
  return rows[0];
}

/**
 * Story 4.3: the five pilot flagships with their expected teams, order-agnostic.
 * Since Story 4.5 the app decides flagship-ness from `series.is_featured`; this
 * list is the probe's independent expectation of which rows carry it (row 5).
 */
const FLAGSHIPS = [
  ["dd4e81bc-0e10-4ad2-b2eb-8b1fbd8c5e0a", 2013, ["MIA", "SAS"]],
  [FLAGSHIP_2016, 2016, ["CLE", "GSW"]],
  ["29638c4e-261a-4d09-81aa-5740f76175f5", 2019, ["TOR", "PHI"]],
  ["626257bc-1678-4c88-84a6-37e0a6cdb49c", 2025, ["OKC", "IND"]],
  ["6ecb170c-e781-47f8-b7ee-881ba719d6d5", 2026, ["OKC", "SAS"]],
];

/**
 * Reads the series page whose `<h1>` matches `h1Pattern`, once `document.title`
 * matches `titlePattern` — react-helmet-async writes the title a frame after the
 * commit, and after a client navigation the previous page's title is still set.
 * `mainText` is the page's own content (`<main>`), without the nav chrome.
 */
const READ_SERIES_PAGE = (h1Pattern, titlePattern = "/./") => `${WAIT}(() => {
  const n = ${norm};
  // The app shell carries its own wordmark <h1>s, so match the page's by text.
  const h1 = Array.from(document.querySelectorAll("h1")).find((h) => ${h1Pattern}.test(n(h.textContent)));
  const main = h1 && h1.closest("main");
  if (!h1 || !main || !${titlePattern}.test(document.title)) return null;
  return {
    pathname: location.pathname,
    h1: n(h1.textContent),
    title: document.title,
    focused: document.activeElement === h1,
    innerText: document.body.innerText,
    mainText: main.innerText,
    games: Array.from(main.querySelectorAll("ol > li")).map((li) => n(li.textContent)),
    eyebrow: n(h1.previousElementSibling && h1.previousElementSibling.textContent),
  };
}, "a series page headline matching ${h1Pattern}", 30000)`;

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.base) {
    console.log("usage: node scripts/probe-deep-links.mjs <base-url> [--series=<uuid>]");
    if (!opts.help) process.exitCode = 1;
    return;
  }
  const base = opts.base.endsWith("/") ? opts.base : `${opts.base}/`;
  const L = createLedger();
  console.log(`Story 4.1/4.3/4.4/4.8 deep-link probe — ${base}  (${new Date().toISOString()})\n`);

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
  const coldPaths = [
    ...ROUTES.map((r) => r.path),
    `series/${known.id}?method=elo`,
    `series/${unknownId}`,
    `series/${FLAGSHIP_2016}`,
    `series/${FLAGSHIP_2016}/result`,
  ];
  // Since Story 4.8 a path with a prerendered file may be answered by that file
  // (GitHub Pages 301s `/x` to `/x/`, which fetch follows); `vite preview`
  // answers the slash-less form with its own SPA fallback. An unknown id has no file.
  for (const path of coldPaths) {
    const res = await fetch(`${base}${path}`);
    const body = Buffer.from(await res.arrayBuffer());
    const unknown = path.startsWith(`series/${unknownId}`);
    const prerendered = !unknown && isPrerenderedFor(body.toString("utf8"), path);
    L.check(
      `cold GET /${path} returns the SPA shell${unknown ? "" : " or its prerendered file"}`,
      body.equals(shell) || prerendered,
      `HTTP ${res.status}${prerendered ? ", prerendered" : body.equals(shell) ? ", SPA shell" : ""}`
    );
  }

  // Rows 8–10 (Story 4.8): what a crawler or unfurler sees, with no JavaScript.
  const flagshipIds = FLAGSHIPS.map(([id]) => id);
  const allRows = await restRows("order=year.asc,id.asc", "id,winner_team_id,league,series_game_scores(game_number,home_score,away_score)").catch((e) => ({ error: e.message }));
  const liveRows = Array.isArray(allRows) ? allRows : [];
  L.check("every series is readable over anon REST", liveRows.length > 0, allRows.error ?? `${liveRows.length} rows`);
  const recordRow = liveRows.find((r) => r.winner_team_id != null && !flagshipIds.includes(r.id));
  const getPage = async (path) => {
    const res = await fetch(`${base}${path}`);
    return { status: res.status, html: await res.text() };
  };
  const ogComplete = (html, path, image) =>
    !!metaContent(html, "og:title") &&
    !!metaContent(html, "og:description") &&
    metaContent(html, "og:url") === `${SITE_URL}${path}` &&
    metaContent(html, "og:image") === `${SITE_URL}${image}` &&
    metaContent(html, "og:type") === "website" &&
    metaContent(html, "twitter:card") === "summary_large_image" &&
    html.includes(`<link rel="canonical" href="${SITE_URL}${path}" />`);

  // Row 8: one page per variant, plus a shell.
  const variants = [
    recordRow && ["record", `series/${recordRow.id}/`, `og/${recordRow.id}.png`, /win Game 7/],
    ["flagship preview", `series/${FLAGSHIP_2016}/`, `og/${FLAGSHIP_2016}.png`, /stand three games apiece[\s\S]*See how the series ended/],
    ["flagship result", `series/${FLAGSHIP_2016}/result/`, `og/${FLAGSHIP_2016}.png`, /win Game 7/],
  ].filter(Boolean);
  L.check("an archived non-flagship series exists for the record row", !!recordRow);
  for (const [label, path, image, content] of variants) {
    const page = await getPage(path);
    const root = rootMarkup(page.html) ?? "";
    console.log(`     JS-disabled /${path}: HTTP ${page.status}, og:title "${metaContent(page.html, "og:title")}"`);
    L.check(`JS-disabled ${label} /${path}: HTTP 200 with the page content in #root`, page.status === 200 && root.includes('id="series-headline"') && content.test(root), `HTTP ${page.status}`);
    L.check(`JS-disabled ${label}: complete, absolute OG/Twitter meta and canonical`, ogComplete(page.html, path, image), metaContent(page.html, "og:image") ?? "no og:image");
  }
  const shellPage = await getPage("predict/");
  L.check(
    "JS-disabled /predict/ shell: HTTP 200, empty root, Fallback meta on og/fallback.png",
    shellPage.status === 200 && shellPage.html.includes('<div id="root"></div>') && ogComplete(shellPage.html, "predict/", "og/fallback.png") &&
      metaContent(shellPage.html, "og:title") === "PredictGame7 — Where data meets playoff drama",
    `HTTP ${shellPage.status}`
  );

  // Row 9: every flagship preview file is clean against its live Game 7.
  const flat = (html) => html.split("<!-- -->").join("");
  for (const id of flagshipIds) {
    const row = liveRows.find((r) => r.id === id);
    const scores = row?.series_game_scores || [];
    const g7 = scores.find((g) => g.game_number === 7);
    if (!g7) {
      L.check(`flagship ${id}: a live Game 7 row to check against`, false, "no Game 7 row");
      continue;
    }
    const [h, a] = [g7.home_score, g7.away_score];
    const pairs = [`${h}–${a}`, `${a}–${h}`, `${h}-${a}`, `${a}-${h}`];
    const preview = await getPage(`series/${id}/`);
    const result = await getPage(`series/${id}/result/`);
    // A Game 7 score can equal a games 1–6 score; only a score the preview cannot otherwise show is checked bare.
    const earlier = new Set(scores.filter((g) => g.game_number !== 7).flatMap((g) => [g.home_score, g.away_score]));
    const rootText = (rootMarkup(preview.html) ?? "").replace(/<[^>]*>/g, " ");
    const bare = [h, a].filter((s) => !earlier.has(s) && new RegExp(`(^|[^\\w.:-])${s}([^\\w.:-]|$)`).test(rootText));
    const leaks = [
      // React separates adjacent text nodes with `<!-- -->`, so the pair is matched with those removed.
      ...pairs.filter((p) => flat(preview.html).includes(p)),
      ...['game_number":7', 'winner_team":{', "win Game 7", "4–3"].filter((t) => preview.html.includes(t)),
      ...bare.map((s) => `bare ${s}`),
    ];
    L.check(`flagship ${id} preview file carries no Game 7 (${h}–${a}) and no outcome`, preview.status === 200 && leaks.length === 0, leaks.join(", ") || `HTTP ${preview.status}`);
    // The preload itself: no series-level winner, games 1–6 exactly, teams in
    // spoiler-neutral order with every game row homed on the neutral-first team.
    const pre = parsePreloadOf(preview.html);
    const pv = pre?.series;
    const games = (pv?.series_game_scores || []).map((g) => g.game_number).sort((x, y) => x - y);
    const homes = new Set((pv?.series_game_scores || []).map((g) => g.home_team_id));
    L.check(
      `flagship ${id} preview preload: winner null, games exactly 1–6, neutral-first team_a homes every game`,
      !!pv &&
        pre.variant === "preview" &&
        pre.reveal === true &&
        pv.winner_team_id === null &&
        pv.winner_team === null &&
        games.join() === "1,2,3,4,5,6" &&
        !!pv.team_a &&
        !!pv.team_b &&
        !swapsForNeutralOrder(pv.team_a, pv.team_b) &&
        pv.team_a_id === pv.team_a.id &&
        homes.size === 1 &&
        homes.has(pv.team_a.id),
      pv ? `team_a ${pv.team_a?.nickname} · games ${games.join()} · winner ${pv.winner_team_id}` : "no preload"
    );
    L.check(`flagship ${id} result file carries the Game 7 pair`, result.status === 200 && pairs.some((p) => flat(result.html).includes(p)), `HTTP ${result.status}`);
  }

  // Row 10: sitemap and robots.
  const sitemap = await getPage("sitemap.xml");
  const locs = [...sitemap.html.matchAll(/<url><loc>([^<]+)<\/loc><\/url>/g)].map((m) => m[1]);
  const archivedFlagships = flagshipIds.filter((id) => liveRows.some((r) => r.id === id && r.winner_team_id != null)).length;
  const expectedUrls = 5 + liveRows.length + archivedFlagships;
  const wellFormed =
    sitemap.html.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">') &&
    sitemap.html.trimEnd().endsWith("</urlset>") &&
    (sitemap.html.match(/<url>/g) || []).length === locs.length &&
    (sitemap.html.match(/<\/url>/g) || []).length === locs.length &&
    locs.every((loc) => loc.startsWith(SITE_URL) && loc.endsWith("/"));
  L.check("sitemap.xml answers 200 and is well-formed", sitemap.status === 200 && wellFormed, `HTTP ${sitemap.status}, ${locs.length} URLs`);
  L.check(
    `sitemap lists home, 4 app routes, every series and each flagship result (${expectedUrls} = 5 + ${liveRows.length} rows + ${archivedFlagships} flagships)`,
    locs.length === expectedUrls && liveRows.every((r) => locs.includes(`${SITE_URL}series/${r.id}/`)) && locs.includes(SITE_URL),
    `${locs.length} URLs`
  );
  const robots = await getPage("robots.txt");
  L.check("robots.txt answers 200 and points at the sitemap", robots.status === 200 && robots.html.includes(`Sitemap: ${SITE_URL}sitemap.xml`), `HTTP ${robots.status}`);

  // Row 12 (Story 4.4): the URLs the two shares copy, opened afterwards in fresh browsers.
  const shared = { series: null, custom: null };
  const S = await openBrowserSession({ viewport: "1440x900", analyticsHost: readEnv().VITE_POSTHOG_HOST || null });
  // Row 11 (Story 4.8): uncaught exceptions and series reads, for the hydration rows.
  const exceptions = [];
  S.cdp.on("Runtime.exceptionThrown", (p) => exceptions.push(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || "exception"));
  const seriesRequests = [];
  S.cdp.on("Network.requestWillBeSent", (p) => {
    if (p.request.url.includes("/rest/v1/series") && p.request.method !== "OPTIONS") seriesRequests.push(p.request.url);
  });
  // Row 12 (Story 4.4): focus a Share button by real keyboard — Shift+Tab off
  // it, then Tab back on — and measure the focus indicator and contrast.
  const pressTab = async (shift) => {
    const modifiers = shift ? 8 : 0;
    await S.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, modifiers });
    await S.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, modifiers });
  };
  const measureShareFocus = async (label, minContrast, what) => {
    await S.evaluate(`(() => { const b = document.querySelector("[data-share-button]"); b.scrollIntoView({ block: "center" }); b.focus(); return true; })()`);
    await pressTab(true);
    await pressTab(false);
    const f = await S.evaluate(READ_FOCUS_STYLE).catch((e) => ({ error: e.message }));
    const ratio = f.error ? 0 : contrast(f.color, f.bg);
    console.log(
      `     ${label} keyboard focus: ${f.error ?? JSON.stringify({ focusVisible: f.focusVisible, boxShadow: f.boxShadow, outline: `${f.outlineStyle} ${f.outlineWidth}`, color: f.color, bg: `${f.bg} (${f.bgFrom})`, contrast: `${ratio.toFixed(2)}:1` })}`
    );
    L.check(`${label}: Tab lands on the Share button and paints a visible focus indicator`, !f.error && f.isShare && (f.boxShadow !== "none" || f.outlineStyle !== "none"), f.error ?? `${f.boxShadow} / outline ${f.outlineStyle}`);
    L.check(`${label}: ${what} contrast >= ${minContrast}:1 on its effective background`, !f.error && ratio >= minContrast, f.error ?? `${f.color} on ${f.bg} = ${ratio.toFixed(2)}:1`);
  };
  try {
    // Row 2 (render half): each route renders under the base path.
    for (const route of ROUTES) {
      await S.navigate(`${base}${route.path}`);
      const r = await S.evaluate(readRoute(route.h1)).catch((e) => ({ error: e.message }));
      L.check(
        `cold GET /${route.path} renders "${route.h1}" at ${new URL(base).pathname}${route.path}`,
        !r.error && r.pathname.replace(/\/+$/, "") === `${new URL(base).pathname}${route.path}`,
        r.error ?? r.pathname
      );
      // Story 4.8: the static shell (`<route>/`, where GitHub Pages lands) renders the route client-side,
      // with its nav item marked active despite the trailing slash.
      await S.navigate(`${base}${route.path}/`);
      const sh = await S.evaluate(readRoute(route.h1)).catch((e) => ({ error: e.message }));
      const active = sh.error
        ? null
        : await S.evaluate(`Array.from(document.querySelectorAll("nav a.bg-accent")).map((a) => a.getAttribute("href"))`);
      L.check(
        `shell /${route.path}/ renders "${route.h1}" with its nav item active`,
        !sh.error && Array.isArray(active) && active.length > 0 && active.every((href) => href === `${new URL(base).pathname}${route.path}`),
        sh.error ?? JSON.stringify(active)
      );
    }

    // Row 3: the share arrival.
    const sentBefore = S.predictRequests.length;
    // Story 4.8: the prerendered file (the URL GitHub Pages 301s to) — main.tsx renders it client-side and redirects.
    await S.navigate(`${base}series/${known.id}/?method=elo`);
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

    // Row 5 (Story 4.3, Story 4.5): the five flagships exist live, archived, with the expected teams,
    // each `is_featured`. Red until `00019` is applied.
    const flagRows = await restRows(
      `id=in.(${FLAGSHIPS.map(([id]) => id).join(",")})`,
      "id,year,winner_team_id,is_featured,team_a:team_a_id(abbreviation),team_b:team_b_id(abbreviation),series_game_scores(game_number)"
    ).catch((e) => ({ error: e.message }));
    for (const [id, year, codes] of FLAGSHIPS) {
      const row = Array.isArray(flagRows) ? flagRows.find((r) => r.id === id) : null;
      const got = row ? [row.team_a?.abbreviation, row.team_b?.abbreviation] : [];
      const games = row ? new Set((row.series_game_scores || []).map((g) => g.game_number)) : new Set();
      const archived = !!row && row.winner_team_id != null && games.size === 7 && [1, 2, 3, 4, 5, 6, 7].every((g) => games.has(g));
      L.check(
        `flagship ${year} ${codes.join("–")} (${id}) exists, is archived, is_featured, and names the expected teams`,
        !!row && row.year === year && archived && row.is_featured === true && [...got].sort().join() === [...codes].sort().join(),
        flagRows.error ??
          (row ? `${row.year} ${got.join("–")} winner=${row.winner_team_id} games=${games.size} is_featured=${row.is_featured}` : "no row")
      );
    }

    // Row 6 (Story 4.3): the flagship preview is spoiler-free, and the reveal lands focus on the result <h1>.
    let g7Scores = null;
    try {
      const flagship = await restSeries(`id=eq.${FLAGSHIP_2016}`, "id,series_game_scores(game_number,home_score,away_score)");
      const g7 = (flagship.series_game_scores || []).find((g) => g.game_number === 7);
      if (g7) g7Scores = [`${g7.home_score}–${g7.away_score}`, `${g7.away_score}–${g7.home_score}`];
      L.check("the 2016 flagship's Game 7 row is readable over REST", !!g7Scores, g7Scores ? g7Scores[0] : "no Game 7 row");
    } catch (e) {
      L.check("the 2016 flagship's Game 7 row is readable over REST", false, e.message);
    }
    // Story 4.8: the prerendered (hydrated) preview file.
    await S.navigate(`${base}series/${FLAGSHIP_2016}/`);
    const pv = await S.evaluate(READ_SERIES_PAGE("/stand three games apiece$/")).catch((e) => ({ error: e.message }));
    console.log(`     flagship preview: ${pv.error ?? JSON.stringify({ h1: pv.h1, title: pv.title, games: pv.games })}`);
    L.check("flagship preview renders games 1–6 only", !pv.error && pv.games.length === 6 && !pv.games.some((g) => g.startsWith("Game 7")), pv.error ?? `${pv.games.length} rows`);
    L.check(
      `flagship preview innerText carries no Game 7 score${g7Scores ? ` (${g7Scores[0]})` : ""} and no outcome copy`,
      !pv.error && !!g7Scores && !g7Scores.some((x) => pv.innerText.includes(x)) && !/win Game 7|Final series|4–3/i.test(pv.innerText),
      pv.error ?? (g7Scores ? "" : "no Game 7 score to check against")
    );
    L.check("flagship preview title is winner-free", !pv.error && / — Game 7, /.test(pv.title) && !/ win /.test(pv.title), pv.error ?? pv.title);
    // Story 4.4: the hero's icon-only Share button on the hydrated page.
    const hs = await S.evaluate(READ_SHARE_BUTTON).catch((e) => ({ error: e.message }));
    const hsLabel = await S.evaluate(`(document.querySelector("[data-share-button]") || { getAttribute: () => null }).getAttribute("aria-label")`);
    L.check(
      'series header Share: icon-only, aria-label "Share this series", takes focus, >=44x44',
      !hs.error && hs.text === "" && hsLabel === "Share this series" && hs.focused && hs.w >= 44 && hs.h >= 44,
      hs.error ?? `${hs.w}x${hs.h} focused=${hs.focused} label=${hsLabel}`
    );
    // Icon-only: a non-text graphic, so WCAG 1.4.11's 3:1.
    await measureShareFocus("series header Share", 3, "icon (non-text, 1.4.11)");
    // A real pointer click on the reveal link (CDP mouse events, not element.click()).
    const box = await S.evaluate(`(() => {
      const a = Array.from(document.querySelectorAll("a")).find((el) => /See how the series ended/.test(el.textContent || ""));
      if (!a) return null;
      a.scrollIntoView({ block: "center" });
      const r = a.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height, href: a.getAttribute("href") };
    })()`).catch((e) => ({ error: e.message }));
    const boxOk = !!box && !box.error && box.h >= 44 && typeof box.href === "string" && box.href.endsWith(`/series/${FLAGSHIP_2016}/result`);
    L.check("the reveal link is present, >=44px tall, and points at /result", boxOk, JSON.stringify(box));
    if (box && !box.error) {
      for (const type of ["mousePressed", "mouseReleased"]) {
        await S.cdp.send("Input.dispatchMouseEvent", { type, x: box.x, y: box.y, button: "left", clickCount: 1 });
      }
    }
    const rs = await S.evaluate(READ_SERIES_PAGE("/win Game 7$/", "/ win Game 7 · PredictGame7$/")).catch((e) => ({ error: e.message }));
    console.log(`     after reveal: ${rs.error ?? JSON.stringify({ pathname: rs.pathname, h1: rs.h1, title: rs.title, focused: rs.focused })}`);
    L.check("the reveal lands on /series/<id>/result", !rs.error && rs.pathname.endsWith(`/series/${FLAGSHIP_2016}/result`), rs.error ?? rs.pathname);
    L.check("document.activeElement is the result <h1>", !rs.error && rs.focused);
    L.check(
      "the result shows all seven games, Game 7 included",
      !rs.error && !!g7Scores && rs.games.length === 7 && g7Scores.some((x) => rs.games[6].includes(x)),
      rs.error ?? rs.games[6]
    );
    L.check("the result title carries the outcome", !rs.error && / win Game 7 · PredictGame7$/.test(rs.title), rs.error ?? rs.title);

    // Row 7 (Story 4.3): an ABA full-record page, then its /result (non-flagship) is the 404.
    const aba = await restSeries("league=eq.ABA&winner_team_id=not.is.null&order=year.asc&limit=1", "id,year,round").catch((e) => ({ error: e.message }));
    if (aba.error) {
      L.check("an archived ABA series is readable over REST", false, aba.error);
    } else {
      await S.navigate(`${base}series/${aba.id}`);
      const ab = await S.evaluate(READ_SERIES_PAGE("/win Game 7$/")).catch((e) => ({ error: e.message }));
      console.log(`     ABA ${aba.id} (${aba.year} ${aba.round}): ${ab.error ?? JSON.stringify({ eyebrow: ab.eyebrow, h1: ab.h1, title: ab.title })}`);
      L.check("ABA full record: eyebrow carries ABA", !ab.error && ab.eyebrow === `GAME 7 · ${aba.year} ABA ${aba.round}`.toUpperCase(), ab.error ?? ab.eyebrow);
      L.check("ABA full record: seven games, no reveal", !ab.error && ab.games.length === 7 && !/See how the series ended/.test(ab.mainText));
      L.check("ABA full record: no home/away/venue wording in the page content", !ab.error && !/\b(home|away|venue|arena)\b/i.test(ab.mainText));

      await S.navigate(`${base}series/${aba.id}/result`);
      const nr = await S.evaluate(READ_NOT_FOUND).catch((e) => ({ error: e.message }));
      L.check("non-flagship /result renders the 404 with focus on the headline", !nr.error && nr.headline === HEADLINE && nr.focused, nr.error ?? nr.headline);
    }

    // Row 11 (Story 4.8): a cold load of each prerendered variant hydrates cleanly and never reads the series.
    const hydrationTargets = [
      recordRow && ["record", `series/${recordRow.id}/`, "/win Game 7$/"],
      ["flagship preview", `series/${FLAGSHIP_2016}/`, "/stand three games apiece$/"],
      ["flagship result", `series/${FLAGSHIP_2016}/result/`, "/win Game 7$/"],
    ].filter(Boolean);
    // hydrateRoot adopts the server-rendered nodes; createRoot discards them and
    // mounts fresh ones (and sets `__reactContainer` on the root just the same).
    // So the root's first server-rendered element is recorded as the parser
    // inserts it — before the deferred module script runs — and must still be
    // connected after load.
    await S.cdp.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `(() => {
        const grab = () => {
          const root = document.getElementById("root");
          if (root && root.firstElementChild && !window.__pg7FirstRootNode) window.__pg7FirstRootNode = root.firstElementChild;
          return !!window.__pg7FirstRootNode;
        };
        if (grab()) return;
        const mo = new MutationObserver(() => { if (grab()) mo.disconnect(); });
        mo.observe(document, { childList: true, subtree: true });
      })()`,
    });
    for (const [label, path, h1Pattern] of hydrationTargets) {
      const marks = { console: S.consoleMessages.length, exceptions: exceptions.length, series: seriesRequests.length };
      await S.navigate(`${base}${path}`);
      const page = await S.evaluate(READ_SERIES_PAGE(h1Pattern)).catch((e) => ({ error: e.message }));
      // Settle window: hydration errors and any fetch fire after the first paint.
      await new Promise((r) => setTimeout(r, 2000));
      const hydrated = await S.evaluate(`(() => {
        const first = window.__pg7FirstRootNode;
        return !!first && first.isConnected && document.getElementById("root").firstElementChild === first;
      })()`);
      const errors = S.consoleMessages.slice(marks.console).filter((m) => m.type === "error").map((m) => m.text);
      const thrown = exceptions.slice(marks.exceptions);
      const reads = seriesRequests.slice(marks.series);
      console.log(`     ${label} /${path}: ${page.error ?? page.h1} — console errors ${errors.length}, exceptions ${thrown.length}, series reads ${reads.length}`);
      L.check(`${label}: the prerendered page renders its headline`, !page.error, page.error ?? page.h1);
      L.check(`${label}: hydrated — the server-rendered root node survives the client mount`, hydrated === true);
      L.check(`${label}: zero console errors and zero uncaught exceptions on a prerendered load`, errors.length === 0 && thrown.length === 0, [...errors, ...thrown].join(" | ").slice(0, 400));
      L.check(`${label}: no rest/v1/series request (the preload serves the page)`, reads.length === 0, reads.join(", "));
    }
    // Row 12 (Story 4.4): share from a completed series prediction and from a custom one.
    const clickAt = async (box) => {
      for (const type of ["mousePressed", "mouseReleased"]) {
        await S.cdp.send("Input.dispatchMouseEvent", { type, x: box.x, y: box.y, button: "left", clickCount: 1 });
      }
    };
    const findButton = (pattern) => `Array.from(document.querySelectorAll("button")).find((b) => ${pattern}.test(b.textContent || ""))`;
    const generateAndOpenDetails = async () => {
      await S.evaluate("window.__p1RunSample(60000)");
      await S.evaluate(`${WAIT}(() => !!${findButton("/View Detailed Analysis/")}, "View Detailed Analysis", 30000)`);
      await S.evaluate(`${findButton("/View Detailed Analysis/")}.click(), true`);
      await S.evaluate(`${WAIT}(() => (document.body.textContent || "").includes("Prediction Result"), "the detailed view", 30000)`);
    };
    const shareFromDetails = async (label, kind) => {
      await S.evaluate(STUB_SHARE_TARGETS);
      const btn = await S.evaluate(READ_SHARE_BUTTON).catch((e) => ({ error: e.message }));
      L.check(
        `${label}: the Share button reads "Share", takes focus and is >=44x44`,
        !btn.error && btn.focused && btn.w >= 44 && btn.h >= 44 && btn.text === "Share",
        btn.error ?? `${btn.w}x${btn.h} focused=${btn.focused}`
      );
      if (btn.error) return null;
      // Labelled: text, so 4.5:1. Measured before the click, so no hover state.
      await measureShareFocus(`${label} Share`, 4.5, "label text");
      const mark = S.analytics.length;
      await clickAt(btn);
      const url = await S.evaluate(`${WAIT}(() => window.__pg7Shared && window.__pg7Shared[0], "the copied URL", 15000)`).catch((e) => ({ error: e.message }));
      const toast = await S.evaluate(
        `${WAIT}(() => Array.from(document.querySelectorAll("[data-sonner-toast]")).some((t) => /Link copied\\./.test(t.textContent || "")), "the Link copied toast", 15000)`
      ).catch(() => false);
      L.check(`${label}: the "Link copied." toast shows`, toast === true);
      const event = await S.waitForAnalytics((e) => S.analytics.indexOf(e) >= mark && e.event === "prediction_shared");
      L.check(
        `${label}: prediction_shared decoded locally with { surface: 'predict', kind: '${kind}', channel: 'clipboard' }`,
        !!event && event.properties.surface === "predict" && event.properties.kind === kind && event.properties.channel === "clipboard",
        event ? JSON.stringify({ surface: event.properties.surface, kind: event.properties.kind, channel: event.properties.channel }) : "no event decoded"
      );
      return typeof url === "string" ? url : null;
    };
    const site = `${new URL(base).origin}${new URL(base).pathname}`;

    // 12a: the known series, Elo.
    await S.navigate(`${base}predict?series=${known.id}&method=elo`);
    try {
      await S.evaluate(READ_PRELOAD);
      await generateAndOpenDetails();
      shared.series = await shareFromDetails("share (series)", "series");
      L.check(
        "share (series): the copied URL is the trailing-slash series page with method and utm_source",
        shared.series === `${site}series/${known.id}/?method=elo&utm_source=share`,
        shared.series ?? "nothing copied"
      );
    } catch (e) {
      L.check("share (series): drive the series to a shared result", false, e.message);
    }

    // 12b: "Montréal" vs "Miami Heat", Bayes.
    await S.navigate(`${base}predict`);
    try {
      await S.evaluate(`(async () => {
        await window.__drill.openSeriesDialog();
        await window.__p1.clickDialogOption(/Custom Matchup/, "Custom Matchup", 15000);
        await window.__p1.waitFor(() => !document.querySelector('[role="dialog"]') && document.getElementById("team_a"), "the custom form", 15000);
        return true;
      })()`);
      const set = (id, value) => S.evaluate(`${SET_INPUT}(${JSON.stringify(id)}, ${JSON.stringify(String(value))})`);
      await set("team_a", "Montréal");
      await set("team_b", "Miami Heat");
      for (let i = 0; i < 12; i++) await set(`game_${Math.floor(i / 2) + 1}_score_${i % 2 === 0 ? "a" : "b"}`, CUSTOM_SCORES[i]);
      await S.evaluate("window.__p1SelectMethod(/Bayes Method/, 15000)");
      await generateAndOpenDetails();
      shared.custom = await shareFromDetails("share (custom)", "custom");
      const prefix = `${site}predict/?custom=`;
      L.check(
        "share (custom): the copied URL is /predict/ with a ?custom= payload and utm_source",
        typeof shared.custom === "string" && shared.custom.startsWith(prefix) && /^[A-Za-z0-9_-]+&utm_source=share$/.test(shared.custom.slice(prefix.length)),
        shared.custom ?? "nothing copied"
      );
    } catch (e) {
      L.check("share (custom): drive the custom matchup to a shared result", false, e.message);
    }
  } finally {
    S.close();
  }

  // Row 12, second half: each shared URL in a fresh browser — new Chrome, new profile.
  const openFresh = async (label, url, read, verify) => {
    if (!url) {
      L.check(`fresh open (${label}): a shared URL to open`, false, "nothing was shared");
      return;
    }
    const F = await openBrowserSession({ viewport: "1440x900", analyticsHost: readEnv().VITE_POSTHOG_HOST || null });
    try {
      await F.navigate(url);
      const r = await F.evaluate(read).catch((e) => ({ error: e.message }));
      console.log(`     fresh open (${label}): ${JSON.stringify(r)}`);
      verify(r);
      // Settle window: a request fired a tick after the preload painted must still count.
      await new Promise((res) => setTimeout(res, 1500));
      L.check(
        `fresh open (${label}): nothing runs on arrival — no predict-game-7 request, no result`,
        !r.error && F.predictRequests.length === 0 && !r.resultShown && r.generateEnabled,
        r.error ?? `${F.predictRequests.length} request(s)`
      );
      const pv = await F.waitForAnalytics((e) => e.event === "$pageview" && /[?&]utm_source=share(&|$)/.test(String(e.properties.$current_url || "")));
      const seen = F.analytics.filter((e) => e.event === "$pageview").map((e) => e.properties.$current_url);
      L.check(`fresh open (${label}): the landing $pageview carries utm_source=share`, !!pv, pv ? pv.properties.$current_url : `pageviews: ${JSON.stringify(seen)}`);
    } finally {
      F.close();
    }
  };

  await openFresh("series", shared.series, READ_PRELOAD, (r) => {
    L.check(
      "fresh open (series): redirects to /predict?series=<id>&method=elo&utm_source=share",
      !r.error && r.search === `?series=${known.id}&method=elo&utm_source=share`,
      r.error ?? `${r.pathname}${r.search}`
    );
    L.check(
      "fresh open (series): the same series and Elo are selected",
      !r.error && (known.codes ? r.seriesText.includes(`${known.codes[0]} vs ${known.codes[1]}`) : / vs /.test(r.seriesText)) && r.methodText.includes("Elo Rating") && r.games.length === 6,
      r.error ?? `${r.seriesText} · ${r.methodText}`
    );
  });
  await openFresh("custom", shared.custom, READ_CUSTOM_ARRIVAL, (r) => {
    L.check(
      "fresh open (custom): the same matchup — both names, non-ASCII intact, and all 12 scores — is prefilled",
      !r.error && r.teamA === "Montréal" && r.teamB === "Miami Heat" && r.scores.join() === CUSTOM_SCORES.join(),
      r.error ?? `${r.teamA} vs ${r.teamB} · ${r.scores.join(",")}`
    );
    L.check("fresh open (custom): Bayes is the selected method", !r.error && /Bayes Method/.test(r.methodText), r.error ?? r.methodText.slice(0, 60));
  });

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
