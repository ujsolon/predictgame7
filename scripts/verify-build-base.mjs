import { existsSync, readFileSync } from "node:fs";

const html = readFileSync("dist/index.html", "utf8");
const base = "/predictgame7/";

if (!html.includes(`src="${base}`) && !html.includes(`href="${base}`)) {
  console.error(`Build output is missing the ${base} asset prefix.`);
  process.exit(1);
}

console.log(`Build output uses the ${base} asset prefix.`);

// AD-6 (Story 4.1): GitHub Pages serves `404.html` for every path it has no
// file for, so the SPA fallback only works while that file IS the SPA shell.
if (!existsSync("dist/404.html")) {
  console.error("Build output is missing dist/404.html (the SPA fallback).");
  process.exit(1);
}

if (!readFileSync("dist/404.html").equals(readFileSync("dist/index.html"))) {
  console.error("dist/404.html is not a byte copy of dist/index.html.");
  process.exit(1);
}

console.log("dist/404.html is a byte copy of dist/index.html.");
