/**
 * In-app list editing over a real imported roster: index-table remapping,
 * dataset-driven repricing, loadout clamping, enhancement and warlord rules.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as data40k from "@alpaca-software/40kdc-data";
import {
  addDetachment,
  addUnit,
  applyWargearOption,
  duplicateUnit,
  enhancementChoices,
  nextSize,
  removeDetachment,
  removeUnit,
  setEnhancement,
  setModelCount,
  setWarlord,
  setWeaponCount,
  sizeRange,
  wargearCounts,
  wargearOptionStates,
  type ListContent,
} from "../list-edit";
import { normalizeImportedRoster } from "../normalize";

const text = readFileSync(join(import.meta.dirname, "gw-11e-attached.txt"), "utf8");

function importFixture(): ListContent {
  const result = data40k.tryImportRoster(text);
  if (!result.ok) throw new Error(result.message);
  const { roster, roleHints, attachmentSeeds } = normalizeImportedRoster(
    result.roster,
    data40k,
    text,
  );
  return { roster, roleHints, attachments: attachmentSeeds };
}

const base = importFixture();
const indexOf = (content: ListContent, id: string, nth = 0) =>
  content.roster.units
    .map((u, i) => ({ u, i }))
    .filter(({ u }) => u.ref.id === id)[nth]!.i;

function total(content: ListContent): number {
  return content.roster.units.reduce(
    (s, u) => s + (u.points ?? 0) + (u.enhancement_points ?? 0),
    0,
  );
}

describe("removeUnit", () => {
  it("drops the unit and remaps attachments and role hints past it", () => {
    const leader = indexOf(base, "beastboss-on-squigosaur");
    const bodyguard = base.attachments[String(leader)];
    // Remove a unit that sits before the leader/bodyguard pair.
    const victim = Math.min(leader, bodyguard) - 1 >= 0 ? 0 : 2;
    const next = removeUnit(data40k, base, victim);

    expect(next.roster.units).toHaveLength(base.roster.units.length - 1);
    const shift = (i: number) => (i > victim ? i - 1 : i);
    expect(next.attachments[String(shift(leader))]).toBe(shift(bodyguard));
    for (const [k, v] of Object.entries(base.roleHints)) {
      if (Number(k) === victim) continue;
      expect(next.roleHints[String(shift(Number(k)))]).toBe(v);
    }
  });

  it("drops attachments whose either end was removed", () => {
    const leader = indexOf(base, "beastboss");
    const next = removeUnit(data40k, base, leader);
    expect(Object.keys(next.attachments)).not.toContain(String(leader));
    expect(
      Object.entries(next.attachments).some(
        ([k]) => base.attachments[String(Number(k) >= leader ? Number(k) + 1 : Number(k))] === undefined,
      ),
    ).toBe(false);
  });

  it("keeps the running total consistent", () => {
    const next = removeUnit(data40k, base, 0);
    expect(next.roster.points.total_computed).toBe(total(next));
  });
});

describe("duplicateUnit", () => {
  it("inserts a copy after the original without enhancement or warlord", () => {
    const i = indexOf(base, "beastboss-on-squigosaur");
    const next = duplicateUnit(data40k, base, i);
    expect(next.roster.units).toHaveLength(base.roster.units.length + 1);
    const copy = next.roster.units[i + 1];
    expect(copy.ref.id).toBe("beastboss-on-squigosaur");
    expect(copy.enhancement).toBeNull();
    expect(copy.enhancement_points).toBeNull();
    expect(copy.is_warlord).toBe(false);
    expect(next.roster.points.total_computed).toBe(total(next));
  });

  it("shifts attachments past the insertion point", () => {
    const i = 0;
    const next = duplicateUnit(data40k, base, i);
    for (const [k, v] of Object.entries(base.attachments)) {
      const nk = Number(k) > i ? Number(k) + 1 : Number(k);
      const nv = v > i ? v + 1 : v;
      expect(next.attachments[String(nk)]).toBe(nv);
    }
  });
});

describe("setModelCount", () => {
  it("resizes Boyz, repricing from the dataset and scaling base weapons", () => {
    const i = indexOf(base, "boyz");
    const u = base.roster.units[i];
    const unit = data40k.units.getInFaction("boyz", "orks")!.raw;
    const bigger = nextSize(data40k, unit, u.model_count, 1);
    if (bigger == null) return; // dataset only prices one size — nothing to test
    const next = setModelCount(data40k, base, i, bigger);
    const resized = next.roster.units[i];
    expect(resized.model_count).toBe(bigger);
    expect(resized.points).toBe(data40k.baseUnitPoints(unit, bigger));
    // Base weapons scale with the squad: every clamped count is within bounds.
    const options = data40k.dataset.wargearOptionsOf(unit);
    const models = data40k.dataset.unitCompositionOf(unit)?.models;
    const bounds = data40k.weaponBounds(unit, bigger, options, models);
    for (const [id, count] of wargearCounts(resized)) {
      const b = bounds.get(id);
      if (b) {
        expect(count).toBeGreaterThanOrEqual(b.min);
        expect(count).toBeLessThanOrEqual(b.max);
      }
    }
    expect(next.roster.points.total_computed).toBe(total(next));
  });

  it("sizeRange reflects the points tiers", () => {
    const unit = data40k.units.getInFaction("boyz", "orks")!.raw;
    const range = sizeRange(unit);
    expect(range).not.toBeNull();
    expect(range!.min).toBeGreaterThan(0);
    expect(range!.max).toBeGreaterThanOrEqual(range!.min);
  });
});

describe("setWeaponCount", () => {
  it("clamps into the valid range and updates wargear", () => {
    const i = indexOf(base, "boyz");
    const unit = data40k.units.getInFaction("boyz", "orks")!.raw;
    const u = base.roster.units[i];
    const options = data40k.dataset.wargearOptionsOf(unit);
    const models = data40k.dataset.unitCompositionOf(unit)?.models;
    const bounds = data40k.weaponBounds(unit, u.model_count, options, models);
    const [id, bound] = [...bounds.entries()].find(([, b]) => b.max > b.min) ?? [];
    if (!id || !bound) return; // no variable weapon on this sheet in this dataset
    const next = setWeaponCount(data40k, base, i, id, bound.max + 5);
    expect(wargearCounts(next.roster.units[i]).get(id)).toBe(bound.max);
  });
});

describe("enhancements", () => {
  // Stock data ships no Ork enhancements (they live in the codex overlay), so
  // drive this from the first faction whose stock data has an offerable one.
  function findCase() {
    for (const enh of data40k.enhancements.all) {
      const det = data40k.detachments.getAny(enh.detachment_id);
      if (!det) continue;
      const character = data40k.units
        .byFaction(det.faction_id)
        .find((u) => {
          if (u.raw.role !== "character") return false;
          const kws = new Set(
            [...(u.raw.keywords ?? []), ...(u.raw.faction_keywords ?? [])].map((k) =>
              k.toLowerCase(),
            ),
          );
          return (
            (enh.keyword_restrictions ?? []).every((k) => kws.has(k.toLowerCase())) &&
            !(enh.exclusion_keywords ?? []).some((k) => kws.has(k.toLowerCase()))
          );
        });
      if (character) return { enh, det, character };
    }
    return null;
  }

  function syntheticContent(factionId: string, detId: string, unitId: string): ListContent {
    const unit = data40k.units.getInFaction(unitId, factionId)!.raw;
    return {
      roleHints: {},
      attachments: {},
      roster: {
        name: "test",
        source: { format: "roster-json", generated_by: null },
        faction_id: factionId,
        detachments: [
          { ref: { id: detId, raw_name: detId, resolved: true, candidates: [] }, dp_cost: null },
        ],
        battle_size: null,
        force_disposition: null,
        units: [
          {
            ref: { id: unit.id, raw_name: unit.name, resolved: true, candidates: [] },
            model_count: 1,
            points: null,
            is_warlord: false,
            enhancement: null,
            enhancement_points: null,
            wargear: [],
            leader_attachment: null,
          },
        ],
        points: {
          declared_limit: null,
          detachment_cap: null,
          total_reported: null,
          total_computed: 0,
        },
        diagnostics: {
          resolved_units: 1,
          unresolved_units: 0,
          resolved_weapons: 0,
          unresolved_weapons: 0,
          warnings: [],
        },
        game_version: { edition: "11th", dataslate: "launch" },
      },
    };
  }

  it("offers detachment enhancements to a character and prices the pick", () => {
    const found = findCase();
    expect(found).not.toBeNull();
    const { enh, det, character } = found!;
    const content = syntheticContent(det.faction_id, det.id, character.id);
    const choices = enhancementChoices(data40k, content.roster, 0);
    expect(choices.map((c) => c.id)).toContain(enh.id);
    const next = setEnhancement(data40k, content, 0, enh.id);
    const u = next.roster.units[0];
    expect(u.enhancement?.id).toBe(enh.id);
    expect(u.enhancement_points).toBe(enh.cost);
    expect(next.roster.points.total_computed).toBe(total(next));
  });

  it("flags an enhancement another unit already took", () => {
    const found = findCase()!;
    const content = syntheticContent(found.det.faction_id, found.det.id, found.character.id);
    content.roster.units.push(structuredClone(content.roster.units[0]));
    const withEnh = setEnhancement(data40k, content, 1, found.enh.id);
    const choices = enhancementChoices(data40k, withEnh.roster, 0);
    expect(choices.find((c) => c.id === found.enh.id)?.takenBy).toBe(1);
  });
});

describe("wargear options (swaps)", () => {
  // Stock Boyz author a Boss Nob big-choppa → power-klaw swap; the fixture
  // squad took it (klaw 1, big choppa 0).
  const i = indexOf(base, "boyz");
  const unit = data40k.units.getInFaction("boyz", "orks")!.raw;

  function klawState(content: ListContent) {
    const states = wargearOptionStates(data40k, content.roster.units[i], unit);
    const s = states.find((st) =>
      st.branches.some((b) => b.ids.includes("power-klaw")),
    )!;
    return { s, branch: s.branches.findIndex((b) => b.ids.includes("power-klaw")) };
  }

  it("reads the taken swap out of the imported loadout", () => {
    const { s, branch } = klawState(base);
    expect(s.branches[branch].applied).toBe(1);
    expect(s.cap).toBeGreaterThanOrEqual(1);
    expect(s.option.replaces).toContain("big-choppa");
  });

  it("un-taking the swap returns the replaced weapon", () => {
    const { s, branch } = klawState(base);
    const next = applyWargearOption(data40k, base, i, s.option.id, branch, -1);
    const counts = wargearCounts(next.roster.units[i]);
    expect(counts.get("power-klaw") ?? 0).toBe(0);
    expect(counts.get("big-choppa")).toBe(1);
    // …and taking it again swaps back.
    const again = applyWargearOption(data40k, next, i, s.option.id, branch, 1);
    const counts2 = wargearCounts(again.roster.units[i]);
    expect(counts2.get("power-klaw")).toBe(1);
    expect(counts2.get("big-choppa") ?? 0).toBe(0);
  });

  it("refuses a swap when the replaced weapon isn't there", () => {
    const { s, branch } = klawState(base);
    // Already swapped: big choppa count is 0, so taking it again must refuse.
    const refused = applyWargearOption(data40k, base, i, s.option.id, branch, 1);
    expect(refused).toBe(base);
  });
});

describe("setWarlord", () => {
  it("keeps at most one warlord", () => {
    const i = indexOf(base, "bigboss");
    const next = setWarlord(base, i, true);
    expect(next.roster.units.filter((u) => u.is_warlord)).toHaveLength(1);
    expect(next.roster.units[i].is_warlord).toBe(true);
    const cleared = setWarlord(next, i, false);
    expect(cleared.roster.units.some((u) => u.is_warlord)).toBe(false);
  });
});

describe("addUnit", () => {
  it("appends a fresh unit at minimum size with a priced base loadout", () => {
    const next = addUnit(data40k, base, "stormboyz");
    const added = next.roster.units.at(-1)!;
    expect(added.ref.id).toBe("stormboyz");
    const unit = data40k.units.getInFaction("stormboyz", "orks")!.raw;
    expect(added.model_count).toBe(sizeRange(unit)?.min ?? 1);
    expect(added.wargear.length).toBeGreaterThan(0);
    expect(added.points).toBe(data40k.baseUnitPoints(unit, added.model_count, 2)); // fixture already has one
    expect(next.roster.points.total_computed).toBe(total(next));
  });
});

describe("detachments", () => {
  it("adds and removes detachments with their DP costs", () => {
    const withDet = addDetachment(data40k, base, "war-horde");
    expect(withDet.roster.detachments.at(-1)?.ref.id).toBe("war-horde");
    const removed = removeDetachment(withDet, withDet.roster.detachments.length - 1);
    expect(removed.roster.detachments).toHaveLength(base.roster.detachments.length);
  });
});
