import { readFileSync } from "node:fs";

const html = readFileSync("dist/index.html", "utf8");
const base = "/predictgame7/";

if (!html.includes(`src="${base}`) && !html.includes(`href="${base}`)) {
  console.error(`Build output is missing the ${base} asset prefix.`);
  process.exit(1);
}

console.log(`Build output uses the ${base} asset prefix.`);
