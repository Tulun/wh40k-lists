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
import {
  legalityIssues,
  removeWargear,
  repriceAll,
  setModelCount,
  strayWargearIds,
  wargearCounts,
  wargearOptionStates,
} from "../list-edit";
import { normalizeImportedRoster } from "../normalize";
import { abilityText } from "../describe";
import { byId } from "../lookup";

const d = mergedData(data40k as never, emptyCodexDoc());
const text = readFileSync(
  join(import.meta.dirname, "gw-flattened-gk-allies.txt"),
  "utf8",
);
const { result, sourceText } = importRosterLenient(d, text);
if (!result.ok) throw new Error(result.message);
const n = normalizeImportedRoster(result.roster, d, sourceText);
const content = repriceAll(d, {
  roster: n.roster,
  roleHints: n.roleHints,
  attachments: n.attachmentSeeds,
});

// The fixture was written at MFM v1.4 prices; repriced at v1.5 it runs over
// 2,000, which is not what these tests are about.
const issuesOf = (c: typeof content) =>
  legalityIssues(d, c.roster, c.attachments).filter(
    (m) => !/army totals/.test(m),
  );

function states(id: string, size?: number) {
  const i = content.roster.units.findIndex((u) => u.ref.id === id);
  const c = size ? setModelCount(d, content, i, size) : content;
  const unit = d.units.getInFaction(id, "grey-knights")!.raw;
  const byKind = (kind: string) =>
    wargearOptionStates(d, c.roster.units[i], unit).find((s) =>
      s.option.id.endsWith(kind),
    )!;
  return {
    guns: byKind("guns-1"),
    narthecium: byKind("narthecium"),
    ancient: byKind("ancient"),
  };
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

  it("whole-model validation sees both per-5 gun records (4 psycannons + Ancient's)", () => {
    // The wargear panel validates the unit on its own; it must pass every
    // option record — the merged states drop the duplicate and halve the cap.
    const u = content.roster.units.find((x) => x.ref.id === "paladin-squad")!;
    const unit = d.units.getInFaction("paladin-squad", "grey-knights")!.raw;
    const violations = d.validateLoadout(
      unit,
      u.model_count,
      d.dataset.wargearOptionsOf(unit),
      wargearCounts(u),
      d.dataset.unitCompositionOf(unit)?.models,
    );
    expect(violations).toEqual([]);
  });

  it("the imported list reads clean, with Ancient rows treated as models", () => {
    expect(issuesOf(content)).toEqual([]);
    expect(
      content.roster.units.flatMap((u) => u.wargear.filter((w) => !w.ref.id)),
    ).toEqual([]);
  });

  it("gear the sheet can't carry is flagged plainly and removable", () => {
    // A saved list from the old data: the "Ancient" model line matched to
    // the Fury of the Ancients weapon, banner/incinerator since removed.
    const i = content.roster.units.findIndex(
      (u) => u.ref.id === "brotherhood-terminator-squad",
    );
    const stale = structuredClone(content);
    const ru = stale.roster.units[i];
    ru.wargear = ru.wargear.filter(
      (w) => w.ref.id !== "ancients-banner" && w.ref.id !== "incinerator",
    );
    ru.wargear.find((w) => w.ref.id === "storm-bolter")!.count = 3;
    ru.wargear.push({
      ref: {
        id: "fury-of-the-ancients",
        raw_name: "Ancient",
        resolved: true,
        candidates: [],
      },
      count: 1,
    });
    const unit = d.units.getInFaction(
      "brotherhood-terminator-squad",
      "grey-knights",
    )!.raw;
    expect(strayWargearIds(d, ru, unit)).toEqual(["fury-of-the-ancients"]);
    const issues = legalityIssues(d, stale.roster, stale.attachments);
    expect(
      issues.some((m) =>
        // The weapon's own record left with the replaced Space Marines
        // codex, so the message falls back to the id.
        /fury.of.the.ancients isn't on this datasheet/i.test(m),
      ),
    ).toBe(true);
    expect(issues.some((m) => /whole-model/.test(m))).toBe(false);
    const fixed = removeWargear(d, stale, i, "fury-of-the-ancients");
    expect(strayWargearIds(d, fixed.roster.units[i], unit)).toEqual([]);
    expect(issuesOf(fixed)).toEqual([]);
  });
});

describe("ability and enhancement text fixes", () => {
  const text = (id: string) =>
    abilityText(byId(d.abilities, id, "grey-knights")!);

  it("scopes Sanctic Hood's Feel No Pain to Psychic Attacks", () => {
    const hood = d.units
      .getInFaction("brotherhood-librarian", "grey-knights")!
      .abilities.find((a) => a.id === "sanctic-hood")!;
    expect(abilityText(hood)).toMatch(
      /Feel No Pain 4\+ ability against Psychic Attacks/,
    );
  });

  it("links paraphrased text to enhancements upstream left blank", () => {
    for (const id of [
      "sixty-sixth-seal-banishers",
      "sigil-of-the-hunt-banishers",
      "ephemeral-tome-banishers",
      "pyresoul-psychic-banishers",
      "vigilance-of-titan-argent-assault",
      "psychic-celerity-argent-assault",
    ]) {
      const enh = byId(d.enhancements, id, "grey-knights")!;
      expect(enh.ability_id).toBe(id);
      expect(text(id).length).toBeGreaterThan(20);
    }
    expect(text("sixty-sixth-seal-banishers")).toMatch(/Armour Penetration/);
  });

  it("links paraphrased text to Argent Assault and Banishers stratagems", () => {
    for (const id of [
      "truesilver-aegis-argent-assault",
      "a-threat-ended-argent-assault",
      "aura-of-vengeance-argent-assault",
      "hexwrought-reprisal-banishers",
      "warding-chant-banishers",
      "chaos-bane-banishers",
      "celerity-banishers",
      "circle-of-sanctuary-banishers",
      "shadow-of-anarch-banishers",
    ]) {
      expect(byId(d.stratagems, id, "grey-knights")!.ability_id).toBe(id);
      expect(text(id)).toMatch(/^When: .*\nTarget: .*\nEffect: /);
    }
  });

  it("gives the Grey Knights Rhino its aura and drops Self Repair", () => {
    const rhino = d.units.getInFaction("rhino", "grey-knights")!;
    const ids = rhino.abilities.map((a) => a.id);
    expect(ids).not.toContain("self-repair");
    const aegis = rhino.abilities.find(
      (a) => a.id === "truesilver-aegis-aura",
    )!;
    expect(abilityText(aegis)).toMatch(/wholly within 6".*mortal wounds/);
    expect(aegis.raw.effect.type).toBe("aura");
    // Other factions' Rhinos keep Self Repair.
    expect(
      d.units
        .getInFaction("imperial-rhino", "agents-of-the-imperium")!
        .abilities.map((a) => a.id),
    ).toContain("self-repair");
  });

  it("keeps Grey Knights rewordings off other factions' same-id abilities", () => {
    for (const [id, faction] of [
      ["truesilver-aegis-aura", "adeptus-astartes"],
      ["ancient-s-banner", "agents-of-the-imperium"],
    ]) {
      const a = byId(d.abilities, id, faction)!;
      expect(a.raw.faction_id).toBe(faction);
      expect((a.raw as { leak_text?: string }).leak_text).toBeUndefined();
    }
  });

  it("rewords clumsy upstream abilities", () => {
    expect(text("dauntless-champions")).toMatch(
      /^Each time a friendly PALADIN SQUAD/,
    );
    expect(text("channelled-force")).toMatch(/\[LETHAL HITS\]$/);
    expect(text("gate-of-infinity")).toMatch(/Strike Force: up to 3 units/);
    expect(text("force-edge-psychic")).toMatch(/isn't a MONSTER or VEHICLE/);
    expect(text("righteous-persecution")).toMatch(
      /pinned until the start of your next turn/,
    );
    expect(text("attuned-onslaught-psychic")).toMatch(/\+1 Damage/);
    expect(text("apothecary-s-narthecium")).toMatch(/^In your Command phase/);
    expect(text("might-of-titan-psychic")).toMatch(
      /^Once per battle, at the start of the Fight phase/,
    );
    expect(text("warrior-strategist")).toMatch(/costs 1CP less/);
    expect(text("sanctifying-ritual-psychic")).toMatch(
      /^At the end of your Command phase/,
    );
  });

  it("prices Grey Knights per MFM v1.5", () => {
    const pts = (id: string) =>
      d.units.getInFaction(id, "grey-knights")!.raw.points!.map((p) => p.cost);
    expect(pts("strike-squad")).toEqual([125, 250]);
    expect(pts("paladin-squad")).toEqual([
      185, 230, 385, 490, 225, 270, 425, 530,
    ]);
    const raven = d.units.getInFaction("stormraven-gunship", "grey-knights")!;
    expect(raven.raw.wargear_costs).toContainEqual({
      item_id: "hurricane-bolter",
      cost: 10,
    });
  });

  it("rewords core stratagems", () => {
    const overwatch = byId(d.abilities, "fire-overwatch")!;
    expect(abilityText(overwatch)).toMatch(/hits are not Critical Hits/);
  });
});
