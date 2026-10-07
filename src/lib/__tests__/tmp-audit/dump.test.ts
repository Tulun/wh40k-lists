import { it } from "vitest";
import * as data40k from "@alpaca-software/40kdc-data";
import { readFileSync, writeFileSync } from "node:fs";
import { mergedData } from "../../data";
const doc = JSON.parse(readFileSync("/private/tmp/claude-501/-Users-jasonkiraly-Desktop-projects-claude-40k-app/669800a0-9e75-418e-9b9f-84c6e86d62b2/scratchpad/codex.json", "utf8"));
it("dump", () => {
  const d: any = mergedData(data40k as never, doc);
  const F = ["orks","grey-knights","adeptus-astartes","adeptus-custodes","leagues-of-votann","agents-of-the-imperium"];
  const out: any[] = [];
  const all = Array.isArray(d.units.all) ? d.units.all : (typeof d.units.all === "function" ? d.units.all() : Object.values(d.units));
  for (const u of all) {
    const raw = u.raw ?? u;
    if (!F.includes(raw.faction_id)) continue;
    let opts: any[] = [], comp: any;
    try { opts = d.dataset.wargearOptionsOf(raw) ?? []; } catch (e) { opts = ["ERR " + e]; }
    try { comp = d.dataset.unitCompositionOf(raw)?.models; } catch (e) { comp = "ERR"; }
    out.push({ id: raw.id, f: raw.faction_id, name: raw.name, budgets: raw.wargear_budgets, comp, opts });
  }
  writeFileSync("/private/tmp/claude-501/-Users-jasonkiraly-Desktop-projects-claude-40k-app/669800a0-9e75-418e-9b9f-84c6e86d62b2/scratchpad/app.json", JSON.stringify(out, null, 1));
});
