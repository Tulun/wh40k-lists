import { describe, expect, it } from "vitest";
import * as data40k from "@alpaca-software/40kdc-data";
import type { ResolvedRef, Roster, RosterUnit } from "@alpaca-software/40kdc-data";
import {
  attachmentMarker,
  extractAttachedGroups,
  normalizeImportedRoster,
} from "../normalize";

const resolved = (id: string): ResolvedRef => ({
  id,
  raw_name: id,
  resolved: true,
  candidates: [],
});
const unresolved = (raw: string): ResolvedRef => ({
  id: null,
  raw_name: raw,
  resolved: false,
  candidates: [],
});

const unit = (partial: Partial<RosterUnit> & { ref: ResolvedRef }): RosterUnit => ({
  model_count: 1,
  points: null,
  is_warlord: false,
  enhancement: null,
  enhancement_points: null,
  wargear: [],
  leader_attachment: null,
  ...partial,
});

const roster = (partial: Partial<Roster>): Roster => ({
  name: "test",
  source: { format: "newrecruit-simple", generated_by: null },
  faction_id: "orks",
  detachments: [],
  battle_size: null,
  force_disposition: null,
  points: { declared_limit: null, detachment_cap: null, total_reported: null, total_computed: 0 },
  units: [],
  game_version: { edition: "11th", dataslate: "launch" },
  diagnostics: {
    resolved_units: 0,
    unresolved_units: 0,
    resolved_weapons: 0,
    unresolved_weapons: 0,
    warnings: [],
  },
  ...partial,
});

describe("attachmentMarker", () => {
  it("recognizes the annotation lines some exports emit as wargear", () => {
    expect(attachmentMarker("Leader (Character)")).toEqual({ role: "leader", partner: null });
    expect(attachmentMarker("Bodyguard ()")).toEqual({ role: "bodyguard", partner: null });
    expect(attachmentMarker("Support (Character)")).toEqual({ role: "support", partner: null });
    expect(attachmentMarker("Leader")).toEqual({ role: "leader", partner: null });
    expect(attachmentMarker("Leader (Beast Snagga Boyz)")).toEqual({
      role: "leader",
      partner: "Beast Snagga Boyz",
    });
    expect(attachmentMarker("Bomb Squig")).toBeNull();
    expect(attachmentMarker("Leader of da Waaagh")).toBeNull();
  });
});

describe("normalizeImportedRoster", () => {
  it("strips markers into role hints and resolves wargear-collection items", () => {
    const r = roster({
      units: [
        unit({
          ref: resolved("nobz"),
          wargear: [
            { ref: unresolved("Leader (Character)"), count: 1 },
            { ref: unresolved("Ammo Runt"), count: 2 },
            { ref: unresolved("Bomb Squig"), count: 1 },
            { ref: resolved("choppa"), count: 5 },
          ],
        }),
        unit({
          ref: resolved("boyz"),
          wargear: [{ ref: unresolved("Bodyguard ()"), count: 1 }],
        }),
      ],
    });

    const { roster: out, roleHints, attachmentSeeds } = normalizeImportedRoster(r, data40k);

    expect(roleHints).toEqual({ "0": "leader", "1": "bodyguard" });
    expect(attachmentSeeds).toEqual({}); // generic "(Character)" names no partner

    const nobzGear = out.units[0].wargear;
    expect(nobzGear.map((w) => w.ref.raw_name)).not.toContain("Leader (Character)");
    const ammoRunt = nobzGear.find((w) => w.ref.raw_name === "Ammo Runt")!;
    expect(ammoRunt.ref.resolved).toBe(true);
    expect(ammoRunt.ref.id).toBe("ammo-runt");
    const bombSquig = nobzGear.find((w) => w.ref.raw_name === "Bomb Squig")!;
    expect(bombSquig.ref.resolved).toBe(false); // not in the dataset — kept as text
    expect(out.units[1].wargear).toHaveLength(0);
  });

  it("seeds attachments when the marker names its partner unit", () => {
    const r = roster({
      units: [
        unit({
          ref: resolved("painboy"),
          wargear: [{ ref: unresolved("Leader (Beast Snagga Boyz)"), count: 1 }],
        }),
        unit({ ref: { ...resolved("beast-snagga-boyz"), raw_name: "Beast Snagga Boyz" } }),
      ],
    });
    const { attachmentSeeds } = normalizeImportedRoster(r, data40k);
    expect(attachmentSeeds).toEqual({ "0": 1 });
  });

  it("strips model-group lines, captures Warlord, and fuzzy-matches unit weapons", () => {
    const r = roster({
      faction_id: "drukhari",
      units: [
        unit({
          ref: { ...resolved("incubi"), raw_name: "Incubi" },
          model_count: 5,
          wargear: [
            { ref: unresolved("Klaivex"), count: 1 }, // model-group header, not wargear
            { ref: unresolved("Incubi"), count: 4 }, // ditto
            { ref: resolved("klaive"), count: 4 },
          ],
        }),
        unit({
          ref: { ...resolved("talos"), raw_name: "Talos" },
          wargear: [
            { ref: unresolved("Warlord"), count: 1 }, // annotation, not wargear
            { ref: unresolved("Macro-scalpel"), count: 2 }, // dataset spells it "maco-scalpel"
          ],
        }),
      ],
    });

    const { roster: out } = normalizeImportedRoster(r, data40k);

    const incubi = out.units[0];
    expect(incubi.wargear.map((w) => w.ref.raw_name)).toEqual(["klaive"]);

    const talos = out.units[1];
    expect(talos.is_warlord).toBe(true);
    expect(talos.wargear).toHaveLength(1);
    expect(talos.wargear[0].ref.id).toBe("maco-scalpel");
    expect(talos.wargear[0].ref.resolved).toBe(true);
    expect(talos.wargear[0].ref.raw_name).toBe("Macro-scalpel"); // source name kept
  });

  it("does not fuzzy-match a weapon the unit cannot carry", () => {
    const r = roster({
      faction_id: "drukhari",
      units: [
        unit({
          ref: { ...resolved("wyches"), raw_name: "Wyches" },
          wargear: [{ ref: unresolved("Macro-scalpel"), count: 1 }], // Talos gear, not Wych gear
        }),
      ],
    });
    const { roster: out } = normalizeImportedRoster(r, data40k);
    expect(out.units[0].wargear[0].ref.resolved).toBe(false);
  });

  it("strips sergeant-model names from the unit composition (Hekatrix on Wyches)", () => {
    const r = roster({
      faction_id: "drukhari",
      units: [
        unit({
          ref: { ...resolved("wyches"), raw_name: "Wyches" },
          wargear: [
            { ref: unresolved("Hekatrix"), count: 1 },
            { ref: resolved("hekatarii-blade"), count: 10 },
          ],
        }),
      ],
    });
    const { roster: out } = normalizeImportedRoster(r, data40k);
    expect(out.units[0].wargear.map((w) => w.ref.raw_name)).toEqual(["hekatarii-blade"]);
  });

  it("infers anonymous-marker attachments from dataset leader eligibility", () => {
    // Mozrog can only lead Squighog Boyz — one eligible squad forces the pair.
    const r = roster({
      units: [
        unit({
          ref: { ...resolved("mozrog-skragbad"), raw_name: "Mozrog Skragbad" },
          wargear: [{ ref: unresolved("Leader (Character)"), count: 1 }],
        }),
        unit({ ref: resolved("boyz"), wargear: [{ ref: unresolved("Bodyguard ()"), count: 1 }] }),
        unit({
          ref: { ...resolved("squighog-boyz"), raw_name: "Squighog Boyz" },
          wargear: [{ ref: unresolved("Bodyguard ()"), count: 1 }],
        }),
      ],
    });
    const { attachmentSeeds } = normalizeImportedRoster(r, data40k);
    expect(attachmentSeeds["0"]).toBe(2); // Mozrog → Squighog Boyz, not plain Boyz
  });

  it("leaves genuinely ambiguous attachments unmatched", () => {
    // Two identical bodyguard-marked squads: no forced pairing.
    const r = roster({
      units: [
        unit({
          ref: { ...resolved("mozrog-skragbad"), raw_name: "Mozrog Skragbad" },
          wargear: [{ ref: unresolved("Leader (Character)"), count: 1 }],
        }),
        unit({
          ref: { ...resolved("squighog-boyz"), raw_name: "Squighog Boyz" },
          wargear: [{ ref: unresolved("Bodyguard ()"), count: 1 }],
        }),
        unit({
          ref: { ...resolved("squighog-boyz"), raw_name: "Squighog Boyz" },
          wargear: [{ ref: unresolved("Bodyguard ()"), count: 1 }],
        }),
      ],
    });
    const { attachmentSeeds } = normalizeImportedRoster(r, data40k);
    expect(attachmentSeeds).toEqual({});
  });

  it("splits 11e dual-detachment headers and resolves both parts", () => {
    const r = roster({
      detachments: [
        {
          ref: unresolved("Freebooter Krew and More Dakka! (3 Detachment Points)"),
          dp_cost: null,
        },
      ],
    });

    const { roster: out } = normalizeImportedRoster(r, data40k);
    expect(out.detachments.map((d) => d.ref.id)).toEqual(["freebooter-krew", "more-dakka"]);
    expect(out.detachments.every((d) => d.ref.resolved)).toBe(true);
  });

  it("resolves a single detachment with a points suffix", () => {
    const r = roster({
      detachments: [{ ref: unresolved("War Horde (2 Detachment Points)"), dp_cost: null }],
    });
    const { roster: out } = normalizeImportedRoster(r, data40k);
    expect(out.detachments.map((d) => d.ref.id)).toEqual(["war-horde"]);
  });

  it("pairs GW-export 'Attached unit' groupings from the raw text", () => {
    const rawText = `
CHARACTERS

Attached Unit 1
Bannernob (60 pts)
• 1x Choppa
• 1x Shoota

Boyz (75 pts)
• 10x Choppa

CHARACTERS

Weirdboy (55 pts)
• 1x Weirdboy staff
`;
    expect(extractAttachedGroups(rawText)).toEqual([["Bannernob", "Boyz"]]);

    const r = roster({
      units: [
        unit({ ref: { ...resolved("bannernob"), raw_name: "Bannernob" } }),
        unit({ ref: { ...resolved("boyz"), raw_name: "Boyz" }, model_count: 10 }),
        unit({ ref: { ...resolved("weirdboy"), raw_name: "Weirdboy" } }),
      ],
    });
    const { attachmentSeeds, roleHints } = normalizeImportedRoster(r, data40k, rawText);
    expect(attachmentSeeds["0"]).toBe(1); // Bannernob → Boyz
    expect(attachmentSeeds["2"]).toBeUndefined(); // Weirdboy stays solo
    expect(roleHints["1"]).toBe("bodyguard");
  });

  it("pairs duplicate attached groups with distinct squads", () => {
    const rawText = `
Attached Unit 1
Bannernob (60 pts)
Boyz (75 pts)

Attached Unit 2
Bannernob (60 pts)
Boyz (75 pts)
`;
    expect(extractAttachedGroups(rawText)).toEqual([
      ["Bannernob", "Boyz"],
      ["Bannernob", "Boyz"],
    ]);
    const r = roster({
      units: [
        unit({ ref: { ...resolved("bannernob"), raw_name: "Bannernob" } }),
        unit({ ref: { ...resolved("boyz"), raw_name: "Boyz" }, model_count: 10 }),
        unit({ ref: { ...resolved("bannernob"), raw_name: "Bannernob" } }),
        unit({ ref: { ...resolved("boyz"), raw_name: "Boyz" }, model_count: 10 }),
      ],
    });
    const { attachmentSeeds } = normalizeImportedRoster(r, data40k, rawText);
    expect(attachmentSeeds).toEqual({ "0": 1, "2": 3 });
  });

  it("imports a full GW export with an attached grouping end to end", () => {
    const text = `+++++++++++++++++++++++++++++++++++++++++++++++
+ FACTION KEYWORD: Xenos - Orks
+ DETACHMENT: War Horde
+ TOTAL ARMY POINTS: 265pts
+
+ NUMBER OF UNITS: 3
+++++++++++++++++++++++++++++++++++++++++++++++

CHARACTERS

Attached Unit 1
Bannernob (60 pts)
• 1x Choppa
• 1x Shoota

Boyz (75 pts)
• 9x Boy
    • 9x Choppa
    • 9x Slugga
• 1x Boss Nob
    • 1x Power klaw
    • 1x Slugga

OTHER DATASHEETS

Deff Dread (130 pts)
• 2x Dread klaw
• 2x Rokkit launcha
• 1x Stompy feet
`;
    const result = data40k.tryImportRoster(text);
    expect(result.ok, result.ok ? "" : result.message).toBe(true);
    if (!result.ok) return;
    const { attachmentSeeds } = normalizeImportedRoster(result.roster, data40k, text);
    const bannernob = result.roster.units.findIndex((u) => u.ref.id === "bannernob");
    const boyz = result.roster.units.findIndex((u) => u.ref.id === "boyz");
    expect(bannernob).toBeGreaterThanOrEqual(0);
    expect(attachmentSeeds[String(bannernob)]).toBe(boyz);
  });

  it("leaves unsplittable detachments untouched for the candidate picker", () => {
    const r = roster({
      detachments: [{ ref: unresolved("Da Best Boyz and Some Nonsense"), dp_cost: null }],
    });
    const { roster: out } = normalizeImportedRoster(r, data40k);
    expect(out.detachments[0].ref.resolved).toBe(false);
    expect(out.detachments[0].ref.raw_name).toBe("Da Best Boyz and Some Nonsense");
  });
});
