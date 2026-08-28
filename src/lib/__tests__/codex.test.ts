/**
 * The editable-codex pipeline: model seeding, compilation to package record
 * shapes, and the two merge modes (replace faction / patch records).
 * Synthetic bases cover strip/append semantics; the real embedded dataset
 * covers seeding, round-trips, and applyCodex end to end.
 */
import { describe, expect, it } from "vitest";
import * as mod from "@alpaca-software/40kdc-data";
import type { RawData, Unit } from "@alpaca-software/40kdc-data";
import { parseWeaponKeyword, compileFaction, compilePatches } from "../codex-compile";
import type {
  CodexDoc,
  EditableDatasheet,
  PatchFaction,
  ReplaceFaction,
} from "../codex-model";
import { docIsEmpty, seedDatasheetFromUpstream, slugify, uniqueSlug } from "../codex-model";
import { abilityText } from "../describe";
import { applyCodex, applyRecordPatches, buildMergedRaw, rawFromDataset } from "../overlay-dataset";

const GV = { edition: "11th", dataslate: "test" } as Unit["game_version"];

function unit(id: string, faction_id: string, extra: Partial<Unit> = {}): Unit {
  return {
    id,
    name: id,
    faction_id,
    profiles: [{ M: 6, T: 5, W: 1, Sv: 5, Ld: 7, OC: 2 }],
    game_version: GV,
    ...extra,
  } as Unit;
}

function syntheticBase(): RawData {
  const raw = mod.emptyRawData();
  raw.factions.push(
    { id: "orks", name: "Orks", faction_rule_id: "waaagh-old", game_version: GV },
    { id: "bystanders", name: "Bystanders", game_version: GV },
  );
  raw.units.push(
    unit("boyz-old", "orks", {
      weapon_ids: ["shoota-x", "shared-blade"],
      ability_ids: ["krump-old", "shared-ability"],
    }),
    unit("bystander-unit", "bystanders", {
      weapon_ids: ["shared-blade"],
      ability_ids: ["shared-ability"],
    }),
  );
  raw.weapons.push(
    { id: "shoota-x", name: "Shoota X", type: "ranged", profiles: [{ name: "x", range: 18, stats: { A: 1, BS: 5, S: 4, AP: 0, D: 1 } }], game_version: GV },
    { id: "shared-blade", name: "Shared blade", type: "melee", profiles: [{ name: "x", range: "Melee", stats: { A: 1, WS: 4, S: 4, AP: 0, D: 1 } }], game_version: GV },
  );
  const ability = (ability_id: string, extra: object = {}) =>
    ({
      ability_id,
      name: ability_id,
      authored_by: "test",
      effect: { type: "rule-state", target: "self" },
      scope: { range: "self", duration: "permanent" },
      game_version: GV,
      ...extra,
    }) as RawData["abilities"][number];
  raw.abilities.push(
    ability("waaagh-old", { faction_id: "orks", ability_type: "faction" }),
    ability("krump-old", { ability_type: "unit" }),
    ability("shared-ability", { ability_type: "unit" }),
    ability("horde-rule-old", { detachment_id: "war-horde-old", ability_type: "detachment" }),
    ability("strat-old-rule", { detachment_id: "war-horde-old", ability_type: "stratagem" }),
  );
  raw.detachments.push({
    id: "war-horde-old",
    name: "War Horde (old)",
    faction_id: "orks",
    detachment_rule_ids: ["horde-rule-old"],
    game_version: GV,
  });
  raw.stratagems.push(
    { id: "strat-old", name: "Old Strat", category: "detachment", detachment_id: "war-horde-old", cp_cost: 1, phases: ["fight"], player_turn: "your-turn", timing: "once-per-turn", ability_id: "strat-old-rule", game_version: GV },
    { id: "core-strat", name: "Core Strat", category: "core", cp_cost: 1, phases: ["fight"], player_turn: "either", timing: "once-per-phase", game_version: GV },
  );
  raw.enhancements.push({ id: "enh-old", name: "Old Enh", detachment_id: "war-horde-old", cost: 10, game_version: GV });
  raw.leaderAttachments.push({ leader_id: "boyz-old", eligible_bodyguard_ids: ["boyz-old"], game_version: GV });
  raw.phaseMappings.push({ source_id: "strat-old", source_type: "stratagem", phases: ["fight"], game_version: GV });
  return raw;
}

const NEW_SHEET: EditableDatasheet = {
  id: "new-ladz",
  name: "New Ladz",
  role: "battleline",
  profiles: [{ name: "New Lad", M: 6, T: 5, W: 1, Sv: 5, Ld: 7, OC: 2 }],
  keywords: ["Infantry", "Battleline"],
  factionKeywords: ["Orks"],
  points: [
    { models: 10, cost: 70 },
    { models: 20, cost: 140 },
  ],
  weapons: [
    {
      name: "New Blasta",
      type: "ranged",
      profiles: [
        { range: 18, A: 2, skill: 5, S: 4, AP: 0, D: 1, keywords: ["Sustained Hits 1", "Zappy 4+", "Anti-Vehicle 3+"] },
      ],
    },
  ],
  abilities: [{ name: "New Rule", text: "Paraphrased new-codex prose." }],
  leads: [],
};

const REPLACE_ORKS: ReplaceFaction = {
  mode: "replace",
  name: "Orks",
  armyRule: { name: "New Waaagh", text: "New army rule prose." },
  datasheets: [
    NEW_SHEET,
    {
      ...NEW_SHEET,
      id: "new-bignob",
      name: "New Bignob",
      role: "character",
      points: [{ models: 1, cost: 80 }],
      weapons: [],
      abilities: [],
      leads: ["new-ladz"],
    },
  ],
  detachments: [
    {
      id: "new-det",
      name: "New Det",
      points: 2,
      dispositions: ["take-and-hold", "disruption"],
      ruleName: "New Det Rule",
      ruleText: "Detachment rule prose.",
      enhancements: [
        { id: "new-enh", name: "New Enh", cost: 15, text: "Enhancement prose.", restrictions: ["Character"] },
      ],
      stratagems: [
        {
          id: "new-strat",
          name: "New Strat",
          cpCost: 1,
          phases: ["movement"],
          playerTurn: "your-turn",
          timing: "once-per-turn",
          text: "Stratagem prose.",
          requiredKeywords: ["Orks"],
        },
      ],
    },
  ],
};

describe("slugify / uniqueSlug", () => {
  it("slugs names", () => {
    expect(slugify("Ghazghkull's Big Krusha!")).toBe("ghazghkulls-big-krusha");
    expect(uniqueSlug("Boyz", ["boyz", "boyz-2"])).toBe("boyz-3");
  });
});

describe("parseWeaponKeyword", () => {
  it("parses value, threshold, anti, and plain forms", () => {
    expect(parseWeaponKeyword("Sustained Hits 1")).toEqual({
      keyword_id: "sustained-hits",
      name: "Sustained Hits",
      parameters: { value: 1 },
    });
    expect(parseWeaponKeyword("Rapid Fire D3")).toEqual({
      keyword_id: "rapid-fire",
      name: "Rapid Fire",
      parameters: { value: "D3" },
    });
    expect(parseWeaponKeyword("Anti-Vehicle 4+")).toEqual({
      keyword_id: "anti",
      name: "Anti",
      parameters: { target_keyword: "Vehicle", threshold: 4 },
    });
    expect(parseWeaponKeyword("Zappy 4+")).toEqual({
      keyword_id: "zappy",
      name: "Zappy",
      parameters: { threshold: 4 },
    });
    expect(parseWeaponKeyword("Devastating Wounds")).toEqual({
      keyword_id: "devastating-wounds",
      name: "Devastating Wounds",
    });
  });
});

describe("compileFaction", () => {
  const compiled = compileFaction("orks", REPLACE_ORKS);

  it("emits the faction with an army-rule ability carrying leak_text", () => {
    expect(compiled.faction?.faction_rule_id).toBe("orks--army-rule");
    const rule = compiled.abilities.find((a) => a.ability_id === "orks--army-rule");
    expect(rule?.leak_text).toBe("New army rule prose.");
    expect(rule?.ability_type).toBe("faction");
  });

  it("compiles datasheets with unit-scoped weapon/ability records", () => {
    const ladz = compiled.units.find((u) => u.id === "new-ladz");
    expect(ladz?.weapon_ids).toEqual(["new-ladz--new-blasta"]);
    expect(ladz?.ability_ids).toEqual(["new-ladz--new-rule"]);
    expect(ladz?.model_count).toEqual({ min: 10, max: 20 });
    const blasta = compiled.weapons.find((w) => w.id === "new-ladz--new-blasta");
    expect(blasta?.profiles[0].stats.BS).toBe(5);
    expect(blasta?.profiles[0].keywords).toEqual([
      { keyword_id: "sustained-hits", parameters: { value: 1 } },
      { keyword_id: "zappy", parameters: { threshold: 4 } },
      { keyword_id: "anti", parameters: { target_keyword: "Vehicle", threshold: 3 } },
    ]);
  });

  it("emits ad-hoc catalog records for hand-typed keywords", () => {
    expect(compiled.weaponKeywords.map((k) => k.id)).toContain("zappy");
  });

  it("compiles leader links and detachment contents", () => {
    expect(compiled.leaderAttachments).toEqual([
      expect.objectContaining({ leader_id: "new-bignob", eligible_bodyguard_ids: ["new-ladz"] }),
    ]);
    const det = compiled.detachments[0];
    expect(det.detachment_rule_ids).toEqual(["new-det--rule"]);
    expect(det.detachment_points).toBe(2);
    expect(det.force_dispositions).toEqual(["take-and-hold", "disruption"]);
    expect(det.enhancement_ids).toEqual(["new-enh"]);
    const strat = compiled.stratagems[0];
    expect(strat.target_restrictions?.required_keywords).toEqual(["Orks"]);
    const stratRule = compiled.abilities.find((a) => a.ability_id === "new-strat--rule");
    expect(stratRule?.leak_text).toBe("Stratagem prose.");
  });
});

describe("buildMergedRaw (replace mode)", () => {
  const base = syntheticBase();
  const baseUnitCount = base.units.length;
  const merged = buildMergedRaw(base, compileFaction("orks", REPLACE_ORKS));
  const ids = <T extends { id: string }>(arr: T[]) => arr.map((r) => r.id);

  it("replaces the faction's units and record, leaving others alone", () => {
    expect(ids(merged.units)).toEqual(["bystander-unit", "new-ladz", "new-bignob"]);
    expect(merged.factions.find((f) => f.id === "orks")?.faction_rule_id).toBe("orks--army-rule");
    expect(merged.factions.find((f) => f.id === "bystanders")).toBeDefined();
  });

  it("removes orphaned weapons and abilities but keeps shared ones", () => {
    expect(ids(merged.weapons)).toEqual(["shared-blade", "new-ladz--new-blasta"]);
    const abilityIds = merged.abilities.map((a) => a.ability_id);
    expect(abilityIds).not.toContain("waaagh-old");
    expect(abilityIds).not.toContain("krump-old");
    expect(abilityIds).not.toContain("horde-rule-old");
    expect(abilityIds).toContain("shared-ability");
  });

  it("swaps detachment-scoped records and scrubs mappings", () => {
    expect(ids(merged.detachments)).toEqual(["new-det"]);
    expect(ids(merged.stratagems)).toEqual(["core-strat", "new-strat"]);
    expect(ids(merged.enhancements)).toEqual(["new-enh"]);
    expect(merged.leaderAttachments.map((l) => l.leader_id)).toEqual(["new-bignob"]);
    expect(merged.phaseMappings).toHaveLength(0);
  });

  it("does not mutate its inputs", () => {
    expect(base.units).toHaveLength(baseUnitCount);
  });

  it("links into a working Dataset with leak_text riding along", () => {
    const ds = new mod.Dataset(merged);
    const ladz = ds.units.getInFaction("new-ladz", "orks");
    expect(ladz).toBeDefined();
    expect(ladz && abilityText(ladz.abilities[0])).toBe("Paraphrased new-codex prose.");
    expect(ds.leadersAttachableTo("new-ladz").map((u) => u.id)).toEqual(["new-bignob"]);
  });
});

describe("wargear options", () => {
  const dread: EditableDatasheet = {
    ...NEW_SHEET,
    id: "new-dread",
    name: "New Dread",
    role: "",
    points: [{ models: 1, cost: 130 }],
    weapons: [
      { name: "Dual Big Shoota", type: "ranged", profiles: [{ range: 36, A: 6, skill: 5, S: 5, AP: 0, D: 1, keywords: [] }] },
      { name: "Rokkit Launcha", type: "ranged", profiles: [{ range: 24, A: 2, skill: 5, S: 9, AP: -2, D: 3, keywords: [] }] },
      { name: "Buzzsaw", type: "melee", profiles: [{ range: "Melee", A: 4, skill: 4, S: 9, AP: -2, D: 2, keywords: [] }] },
      { name: "Grabbin' Klaw", type: "melee", profiles: [{ range: "Melee", A: 3, skill: 4, S: 10, AP: -2, D: 3, keywords: [] }] },
    ],
    wargearOptions: [
      { replaces: ["Dual Big Shoota"], choices: [["Rokkit Launcha"]], limit: { kind: "count", n: 1 } },
      { replaces: [], choices: [["Buzzsaw"], ["Grabbin' Klaw"]], limit: { kind: "count", n: 1 } },
      { replaces: ["No Such Gun"], choices: [["Buzzsaw"]], limit: { kind: "any" } },
    ],
    abilities: [],
    leads: [],
  };
  const compiled = compileFaction("orks", { ...REPLACE_ORKS, datasheets: [dread] }, "Orks");

  it("compiles name-based options to id-based records, skipping unknown names", () => {
    expect(compiled.wargearOptions).toHaveLength(2);
    const [swap, choice] = compiled.wargearOptions;
    expect(swap.replaces).toEqual(["new-dread--dual-big-shoota"]);
    expect(swap.replacement).toEqual(["new-dread--rokkit-launcha"]);
    expect(swap.model_constraint?.max_count).toBe(1);
    expect(choice.replaces).toBeUndefined();
    expect(choice.replacement_choice).toEqual([
      ["new-dread--buzzsaw"],
      ["new-dread--grabbin-klaw"],
    ]);
  });

  it("compiles composition so a no-options unit reads as fixed, with defaults", () => {
    const trakk: EditableDatasheet = {
      ...dread,
      id: "new-trakk",
      name: "New Trakk",
      wargearOptions: [],
      composition: [
        { name: "Wartrakk", min: 1, max: 2, weapons: ["Dual Big Shoota", "Buzzsaw"] },
      ],
    };
    const out = compileFaction("orks", { ...REPLACE_ORKS, datasheets: [trakk] }, "Orks");
    expect(out.unitCompositions).toHaveLength(1);
    const merged = buildMergedRaw(syntheticBase(), out);
    const ds = new mod.Dataset(merged);
    const unit = ds.units.getInFaction("new-trakk", "orks")!.raw;
    const comp = ds.unitCompositionOf(unit);
    expect(comp?.models[0].default_weapon_ids).toEqual([
      "new-trakk--dual-big-shoota",
      "new-trakk--buzzsaw",
    ]);
    // Fixed loadout: every default weapon's bounds pin to the model count.
    const base = mod.baseLoadout(unit, 2, [], comp?.models);
    expect(base.counts.get("new-trakk--dual-big-shoota")).toBe(2);
    const bounds = mod.weaponBounds(unit, 2, [], comp?.models);
    expect(bounds.get("new-trakk--buzzsaw")).toEqual({ min: 2, max: 2 });
  });

  it("gives same-named dual-mode weapons distinct ids so neither is dropped", () => {
    const wartrike: EditableDatasheet = {
      ...NEW_SHEET,
      id: "new-wartrike",
      name: "New Wartrike",
      abilities: [],
      wargearOptions: [],
      weapons: [
        { name: "Snagga Klaw", type: "ranged", profiles: [{ range: 12, A: 1, skill: 5, S: 7, AP: -2, D: 2, keywords: [] }] },
        { name: "Snagga Klaw", type: "melee", profiles: [{ range: "Melee", A: 6, skill: 2, S: 10, AP: -2, D: 2, keywords: [] }] },
      ],
    };
    const out = compileFaction("orks", { ...REPLACE_ORKS, datasheets: [wartrike] }, "Orks");
    const unit = out.units.find((u) => u.id === "new-wartrike")!;
    expect(unit.weapon_ids).toEqual([
      "new-wartrike--snagga-klaw",
      "new-wartrike--snagga-klaw--melee",
    ]);
    const merged = buildMergedRaw(syntheticBase(), out);
    const ds = new mod.Dataset(merged);
    const view = ds.units.getInFaction("new-wartrike", "orks")!;
    expect(view.weapons).toHaveLength(2);
    expect(view.weapons.map((w) => w.raw.type).sort()).toEqual(["melee", "ranged"]);
  });

  it("compiles ordinal-banded points tiers (the 3rd Meganobz squad pays more)", () => {
    const banded: EditableDatasheet = {
      ...NEW_SHEET,
      id: "new-manz",
      name: "New Manz",
      weapons: [],
      abilities: [],
      wargearOptions: [],
      points: [
        { models: 3, cost: 110 },
        { models: 5, cost: 185, toUnit: 2 },
        { models: 5, cost: 225, fromUnit: 3 },
      ],
    };
    const out = compileFaction("orks", { ...REPLACE_ORKS, datasheets: [banded] }, "Orks");
    const unit = out.units.find((u) => u.id === "new-manz")!;
    expect(mod.baseUnitPoints(unit, 5, 1)).toBe(185);
    expect(mod.baseUnitPoints(unit, 5, 2)).toBe(185);
    expect(mod.baseUnitPoints(unit, 5, 3)).toBe(225);
    expect(mod.baseUnitPoints(unit, 3, 3)).toBe(110); // unbanded size unaffected
  });

  it("compiles per-weapon costs into wargear_costs and prices them", () => {
    const priced: EditableDatasheet = {
      ...dread,
      id: "new-meganobz",
      name: "New Meganobz",
      weapons: dread.weapons.map((w) =>
        w.name === "Buzzsaw" ? { ...w, cost: 5 } : w,
      ),
      wargearOptions: [],
    };
    const out = compileFaction("orks", { ...REPLACE_ORKS, datasheets: [priced] }, "Orks");
    const unit = out.units.find((u) => u.id === "new-meganobz")!;
    expect(unit.wargear_costs).toEqual([{ item_id: "new-meganobz--buzzsaw", cost: 5 }]);
    const counts = new Map([["new-meganobz--buzzsaw", 3]]);
    expect(mod.wargearPoints(unit, counts)).toBe(15);
  });

  it("rides through the merge so the loadout maths sees the swap", () => {
    const merged = buildMergedRaw(syntheticBase(), compiled);
    const ds = new mod.Dataset(merged);
    const unit = ds.units.getInFaction("new-dread", "orks")!.raw;
    const options = ds.wargearOptionsOf(unit);
    expect(options).toHaveLength(2);
    // Base loadout carries the dual big shoota, not its replacement.
    const base = mod.baseLoadout(unit, 1, options);
    expect(base.counts.get("new-dread--dual-big-shoota")).toBe(1);
    expect(base.counts.get("new-dread--rokkit-launcha") ?? 0).toBe(0);
    const bounds = mod.weaponBounds(unit, 1, options);
    expect(bounds.get("new-dread--rokkit-launcha")).toEqual({ min: 0, max: 1 });
  });
});

describe("applyRecordPatches (patch mode)", () => {
  const base = syntheticBase();
  const patch: PatchFaction = {
    mode: "patch",
    datasheets: {
      "boyz-old": {
        ...NEW_SHEET,
        id: "boyz-old",
        name: "Boyz (fixed)",
        points: [{ models: 10, cost: 65 }],
        weapons: [{ name: "Fixed Shoota", type: "ranged", profiles: [{ range: 18, A: 2, skill: 5, S: 4, AP: 0, D: 1, keywords: [] }] }],
        abilities: [{ name: "Fixed Rule", text: "Fixed prose." }],
        leads: [],
      },
    },
    detachments: {},
  };
  const merged = applyRecordPatches(base, compilePatches("orks", patch));

  it("swaps the unit record in place, keeping its id", () => {
    const boyz = merged.units.filter((u) => u.id === "boyz-old");
    expect(boyz).toHaveLength(1);
    expect(boyz[0].name).toBe("Boyz (fixed)");
    expect(boyz[0].points).toEqual([{ models: 10, cost: 65 }]);
    expect(boyz[0].weapon_ids).toEqual(["boyz-old--fixed-shoota"]);
  });

  it("leaves shared and unrelated records untouched", () => {
    expect(merged.weapons.map((w) => w.id)).toContain("shared-blade");
    expect(merged.weapons.map((w) => w.id)).toContain("shoota-x");
    expect(merged.units.find((u) => u.id === "bystander-unit")?.name).toBe("bystander-unit");
    expect(merged.detachments.map((d) => d.id)).toContain("war-horde-old");
    expect(merged.leaderAttachments.map((l) => l.leader_id)).toContain("boyz-old");
  });
});

describe("against the real dataset", () => {
  it("rawFromDataset round-trips the embedded dataset", () => {
    const rebuilt = new mod.Dataset(rawFromDataset(mod.dataset));
    expect(rebuilt.units.all.length).toBe(mod.dataset.units.all.length);
    expect(rebuilt.stratagems.all.length).toBe(mod.dataset.stratagems.all.length);
  });

  it("seedDatasheetFromUpstream → compile round-trips profiles and points", () => {
    const boyz = mod.units.getInFaction("boyz", "orks");
    expect(boyz).toBeDefined();
    const seeded = seedDatasheetFromUpstream(boyz!);
    expect(seeded.id).toBe("boyz");
    expect(seeded.weapons.length).toBeGreaterThan(0);
    expect(seeded.abilities.length).toBeGreaterThan(0);

    const compiled = compilePatches("orks", {
      mode: "patch",
      datasheets: { boyz: seeded },
      detachments: {},
    });
    const unitRecord = compiled.units[0];
    expect(unitRecord.profiles).toMatchObject(
      boyz!.raw.profiles.map((p) => ({ M: p.M, T: p.T, W: p.W, Sv: p.Sv, Ld: p.Ld, OC: p.OC })),
    );
    // Ordinal bands (unit_count_min/max) round-trip through the seed too.
    expect(unitRecord.points).toEqual(
      boyz!.raw.points?.map((p) => ({
        models: p.models,
        cost: p.cost,
        ...(p.unit_count_min != null ? { unit_count_min: p.unit_count_min } : {}),
        ...(p.unit_count_max != null ? { unit_count_max: p.unit_count_max } : {}),
      })),
    );
  });

  it("applyCodex end to end: replace Orks + patch an Aeldari unit", () => {
    const aeldariUnit = mod.units.byFaction("aeldari")[0];
    const seeded = seedDatasheetFromUpstream(aeldariUnit);
    seeded.points = [{ models: 1, cost: 999 }];
    const doc: CodexDoc = {
      version: 1,
      updated: "2026-08-25T00:00:00Z",
      factions: {
        orks: REPLACE_ORKS,
        aeldari: { mode: "patch", datasheets: { [seeded.id]: seeded }, detachments: {} },
      },
    };
    expect(docIsEmpty(doc)).toBe(false);
    const ds = applyCodex(mod, doc);
    expect(ds).not.toBeNull();
    expect(ds!.units.byFaction("orks").map((u) => u.id).sort()).toEqual(["new-bignob", "new-ladz"]);
    expect(ds!.units.getInFaction(seeded.id, "aeldari")?.raw.points).toEqual([{ models: 1, cost: 999 }]);
    expect(ds!.units.byFaction("aeldari").length).toBe(mod.units.byFaction("aeldari").length);
    expect(ds!.units.byFaction("grey-knights").length).toBe(mod.units.byFaction("grey-knights").length);
  });

  it("applyCodex strips replace-faction upstream data even from an empty doc", () => {
    // The superseded old-edition Orks records must never show, doc or no doc.
    const ds = applyCodex(mod, { version: 1, updated: "x", factions: {} });
    expect(ds).not.toBeNull();
    expect(ds!.units.byFaction("orks")).toEqual([]);
    expect(ds!.detachments.byFaction("orks")).toEqual([]);
    expect(ds!.factions.getAny("orks")?.name).toBe("Orks");
    expect(ds!.units.byFaction("aeldari").length).toBe(mod.units.byFaction("aeldari").length);

    const ds2 = applyCodex(mod, {
      version: 1,
      updated: "x",
      factions: {
        orks: { mode: "replace", name: "Orks", armyRule: null, datasheets: [], detachments: [] },
        aeldari: { mode: "patch", datasheets: {}, detachments: {} },
      },
    });
    expect(ds2).not.toBeNull();
    expect(ds2!.units.byFaction("orks")).toEqual([]);
    expect(ds2!.units.byFaction("aeldari").length).toBe(mod.units.byFaction("aeldari").length);
  });
});

describe("abilityText", () => {
  it("prefers leak_text prose over the DSL renderer", () => {
    expect(abilityText({ describe: () => "dsl", raw: { leak_text: "prose" } })).toBe("prose");
    expect(abilityText({ describe: () => "dsl", raw: {} })).toBe("dsl");
    expect(abilityText({ describe: () => "dsl", raw: { leak_text: "" } })).toBe("dsl");
  });
});
