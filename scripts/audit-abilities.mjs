/**
 * Local QA audit: compare our DSL-generated ability text against reference
 * wording extracted from a reference site's public bundle, and flag abilities
 * whose conditions/numbers don't line up (e.g. a missing "While the Waaagh!
 * is active…" clause).
 *
 * Usage:
 *   node scripts/audit-abilities.mjs <faction-id> [--bundle path/to/bundle.js]
 *
 * The reference text is used TRANSIENTLY for comparison and printed only in
 * short fragments to your terminal. It is GW's copyrighted prose — do not
 * commit it, ship it in the app, or contribute it verbatim upstream. Fixes
 * belong in 40kdc-data as Ability-DSL mechanics.
 */
import { readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileSync } from "node:fs";

const BUNDLE_INDEX = "https://39k.pro/";

const factionId = process.argv[2];
if (!factionId) {
  console.error("usage: node scripts/audit-abilities.mjs <faction-id> [--bundle file]");
  process.exit(1);
}
const bundleArg = process.argv.indexOf("--bundle");
let bundlePath = bundleArg > -1 ? process.argv[bundleArg + 1] : join(tmpdir(), "39k-bundle.js");

if (!existsSync(bundlePath)) {
  console.error(`Fetching reference bundle → ${bundlePath}`);
  const html = await (await fetch(BUNDLE_INDEX)).text();
  const src = /src="(\/assets\/index-[^"]+\.js)"/.exec(html)?.[1];
  if (!src) throw new Error("could not locate bundle in index.html");
  const js = await (await fetch(new URL(src, BUNDLE_INDEX))).text();
  writeFileSync(bundlePath, js);
}

const bundle = readFileSync(bundlePath, "utf8");

// Extract every `localisations:{en:{name:"…",rules:"…"}}` pair from the
// minified bundle. Strings are JS-escaped.
const STR = String.raw`"((?:\\.|[^"\\])*)"`;
const abilityRe = new RegExp(
  String.raw`localisations:\{en:\{name:${STR},rules:${STR}`,
  "g",
);
const unescape = (s) =>
  s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
   .replace(/\\(.)/g, "$1");

const reference = new Map(); // normalized name -> Set of rules texts
const norm = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
for (const m of bundle.matchAll(abilityRe)) {
  const name = norm(unescape(m[1]));
  const rules = unescape(m[2]);
  if (!reference.has(name)) reference.set(name, new Set());
  reference.get(name).add(rules);
}
console.error(`reference abilities extracted: ${reference.size}\n`);

// Signals whose presence in the reference but absence in ours suggests a
// dropped condition or clause.
const CONDITION_MARKERS = [
  ["waaagh", /waaagh/i],
  ["while…", /\bwhile\b/i],
  ["if…", /\bif\b/i],
  ["once per", /\bonce per\b/i],
  ["each time", /\beach time\b/i],
  ["start/end of", /\b(start|end) of\b/i],
  ["below half", /below (its )?(half|starting)/i],
  ["leading", /\b(leads|leading|attached)\b/i],
  ["enemy within", /enemy.{0,20}within/i],
];
const numbersOf = (s) => new Set((s.match(/\d+d\d+|\bd\d+\b|\d+"|\d+\+|\b\d+\b/gi) ?? []).map((x) => x.toLowerCase()));

const { abilities, units } = await import("@alpaca-software/40kdc-data");
// Datasheet abilities carry no faction_id — collect them via the faction's
// units, then add faction-scoped abilities (detachment rules etc.).
const toCheck = new Map();
for (const u of units.byFaction(factionId)) {
  for (const a of u.abilities) toCheck.set(a.id, a);
}
for (const a of abilities.byFaction(factionId)) toCheck.set(a.id, a);

let flagged = 0, matched = 0, missing = 0;
for (const a of toCheck.values()) {
  const refTexts = reference.get(norm(a.name));
  if (!refTexts) { missing++; continue; }
  matched++;
  const ours = a.describe();
  const problems = [];
  // Compare against the closest reference variant (fewest problems).
  let best = null;
  for (const ref of refTexts) {
    const p = [];
    for (const [label, re] of CONDITION_MARKERS) {
      if (re.test(ref) && !re.test(ours)) p.push(`missing ${label}`);
    }
    const refNums = numbersOf(ref), ourNums = numbersOf(ours);
    for (const n of refNums) if (!ourNums.has(n)) p.push(`missing number ${n}`);
    if (!best || p.length < best.p.length) best = { ref, p };
  }
  if (best && best.p.length > 0) {
    flagged++;
    console.log(`▶ ${a.id}  (${a.name})`);
    console.log(`  issues: ${best.p.join(", ")}`);
    console.log(`  ours:   ${ours.replace(/\n/g, " ")}`);
    console.log(`  ref:    ${best.ref.slice(0, 160)}${best.ref.length > 160 ? "…" : ""}`);
    console.log();
  }
}
console.error(
  `checked ${matched} abilities (${missing} had no reference match) — ${flagged} flagged`,
);
