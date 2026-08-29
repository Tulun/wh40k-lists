/**
 * Canary for the damage-summary wiring in src/lib/crunch.ts: the package's
 * cruncher API (crunch / stackableBuffsFor / defensiveBuffsFor / target
 * profiles) keeps the shape we consume, and the numbers stay sane.
 */
import { describe, expect, it } from "vitest";
import * as pkg from "@alpaca-software/40kdc-data";
import type { RosterUnit } from "@alpaca-software/40kdc-data";
import type { Data40k } from "../data";
import {
  DEFAULT_SITUATION,
  crunchLevers,
  engineContext,
  memberFromRosterUnit,
  standardTargets,
  unitOutput,
} from "../crunch";

const data = pkg as Data40k;

function rosterUnit(id: string, wargear: [string, number][]): RosterUnit {
  return {
    ref: { id, raw_name: id, confidence: "exact" },
    model_count: 5,
    points: null,
    enhancement: null,
    enhancement_points: null,
    is_warlord: false,
    leader_attachment: null,
    wargear: wargear.map(([wid, count]) => ({
      ref: { id: wid, raw_name: wid, confidence: "exact" },
      count,
    })),
  } as unknown as RosterUnit;
}

describe("crunch summary", () => {
  const factionId = "adeptus-astartes";
  const unit = rosterUnit("intercessor-squad", [
    ["bolt-rifle", 5],
    ["close-combat-weapon", 5],
  ]);

  it("resolves standard targets", () => {
    const targets = standardTargets(data);
    expect(targets.length).toBeGreaterThanOrEqual(5);
    for (const t of targets) {
      expect(t.modelCount).toBeGreaterThan(0);
      expect(t.unitRaw.profiles[0]?.W).toBeTruthy();
    }
  });

  it("computes shooting output with always-on levers applied", () => {
    const member = memberFromRosterUnit(data, unit, factionId);
    expect(member).not.toBeNull();
    expect(member!.lines.length).toBe(2);

    const members = [member!];
    const ctx = engineContext(data, members, factionId, DEFAULT_SITUATION);
    const levers = crunchLevers(data, members, factionId, undefined, ctx);
    const chosen = levers.buffs.filter((l) => l.enabled).flatMap((l) => l.buffs);

    const targets = standardTargets(data);
    const geq = targets.find((t) => t.profileId === "geq-guardsmen")!;
    const out = unitOutput(data, members, factionId, chosen, ctx, geq);

    // 5 bolt rifles into guardsmen kill a couple at minimum; kills never
    // exceed the squad size and only the ranged weapon fires this phase.
    expect(out.damage).toBeGreaterThan(1);
    expect(out.kills).toBeLessThanOrEqual(geq.modelCount);
    expect(out.weapons.map((w) => w.weaponId)).toEqual(["bolt-rifle"]);
  });

  it("melee phase picks the melee weapon and charged context holds", () => {
    const member = memberFromRosterUnit(data, unit, factionId)!;
    const members = [member];
    const ctx = engineContext(data, members, factionId, {
      ...DEFAULT_SITUATION,
      phase: "fight",
      charged: true,
    });
    const geq = standardTargets(data).find((t) => t.profileId === "geq-guardsmen")!;
    const out = unitOutput(data, members, factionId, [], ctx, geq);
    expect(out.weapons.map((w) => w.weaponId)).toEqual(["close-combat-weapon"]);
    expect(out.damage).toBeGreaterThan(0);
  });
});
