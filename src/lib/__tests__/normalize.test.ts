import { describe, expect, it } from "vitest";
import * as data40k from "@alpaca-software/40kdc-data";
import type { ResolvedRef, Roster, RosterUnit } from "@alpaca-software/40kdc-data";
import { attachmentMarker, normalizeImportedRoster } from "../normalize";

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

  it("leaves unsplittable detachments untouched for the candidate picker", () => {
    const r = roster({
      detachments: [{ ref: unresolved("Da Best Boyz and Some Nonsense"), dp_cost: null }],
    });
    const { roster: out } = normalizeImportedRoster(r, data40k);
    expect(out.detachments[0].ref.resolved).toBe(false);
    expect(out.detachments[0].ref.raw_name).toBe("Da Best Boyz and Some Nonsense");
  });
});
