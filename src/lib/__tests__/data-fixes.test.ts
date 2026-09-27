/**
 * Upstream corrections (src/lib/data-fixes.ts) as the list editor sees them:
 * the Grey Knights Ancient becomes a one-off trooper swap, the special-gun
 * swap scales per 5 models, and a mixed import attributes each swap once.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as data40k from "@alpaca-software/40kdc-data";
import { emptyCodexDoc } from "../codex-model";
import { mergedData } from "../data";
import { importRosterLenient } from "../lenient-import";
import { legalityIssues, repriceAll, setModelCount, wargearOptionStates } from "../list-edit";
import { normalizeImportedRoster } from "../normalize";

const d = mergedData(data40k as never, emptyCodexDoc());
const text = readFileSync(join(import.meta.dirname, "gw-flattened-gk-allies.txt"), "utf8");
const { result, sourceText } = importRosterLenient(d, text);
if (!result.ok) throw new Error(result.message);
const n = normalizeImportedRoster(result.roster, d, sourceText);
const content = repriceAll(d, {
  roster: n.roster,
  roleHints: n.roleHints,
  attachments: n.attachmentSeeds,
});

function states(id: string, size?: number) {
  const i = content.roster.units.findIndex((u) => u.ref.id === id);
  const c = size ? setModelCount(d, content, i, size) : content;
  const unit = d.units.getInFaction(id, "grey-knights")!.raw;
  const byKind = (kind: string) =>
    wargearOptionStates(d, c.roster.units[i], unit).find((s) => s.option.id.endsWith(kind))!;
  return { guns: byKind("guns-1"), narthecium: byKind("narthecium"), ancient: byKind("ancient") };
}

describe("Grey Knights squad fixes", () => {
  it("Terminators: guns per 5 models, one narthecium, one Ancient", () => {
    const four = states("brotherhood-terminator-squad");
    expect(four.guns.cap).toBe(0);
    expect(four.narthecium).toMatchObject({ cap: 1, totalApplied: 1 });
    // The imported incinerator rides WITH the banner — the Ancient's swap,
    // not a per-5 gun swap the 4-model squad can't take.
    expect(four.ancient).toMatchObject({ cap: 1, totalApplied: 1 });
    expect(four.guns.totalApplied).toBe(0);
    expect(states("brotherhood-terminator-squad", 10).guns.cap).toBe(2);
  });

  it("Paladins: up to 2 guns per 5 models, merged into one option", () => {
    const ten = states("paladin-squad");
    expect(ten.guns).toMatchObject({ cap: 4, totalApplied: 4 });
    expect(ten.ancient).toMatchObject({ cap: 1, totalApplied: 1 });
    const ids = wargearOptionStates(
      d,
      content.roster.units.find((u) => u.ref.id === "paladin-squad")!,
      d.units.getInFaction("paladin-squad", "grey-knights")!.raw,
    ).map((s) => s.option.id);
    expect(ids.filter((id) => id.includes("guns"))).toHaveLength(1);
  });

  it("the imported list reads clean, with Ancient rows treated as models", () => {
    expect(legalityIssues(d, content.roster, content.attachments)).toEqual([]);
    expect(content.roster.units.flatMap((u) => u.wargear.filter((w) => !w.ref.id))).toEqual([]);
  });
});
