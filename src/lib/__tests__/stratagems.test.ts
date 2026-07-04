import { describe, expect, it } from "vitest";
import type { Detachment, Stratagem } from "@alpaca-software/40kdc-data";
import {
  armyStratagems,
  effectiveKeywords,
  matchesTargetRestrictions,
  stratagemsForUnit,
} from "../stratagems";

const strat = (partial: Partial<Stratagem> & { id: string }): Stratagem => ({
  name: partial.id.toUpperCase(),
  category: "detachment",
  detachment_id: "kult-of-speed",
  cp_cost: 1,
  phases: ["shooting"],
  player_turn: "your-turn",
  timing: "once-per-phase",
  target_restrictions: null,
  game_version: { edition: "11th", dataslate: "launch" },
  ...partial,
});

const orkBoyz = {
  keywords: ["Infantry", "Battleline", "Mob", "Boyz"],
  faction_keywords: ["Orks"],
};

describe("armyStratagems", () => {
  it("splits core from the roster's detachment and drops other detachments", () => {
    const all = [
      strat({ id: "a", category: "core", detachment_id: null }),
      strat({ id: "b", detachment_id: "kult-of-speed" }),
      strat({ id: "c", detachment_id: "war-horde" }),
    ];
    const { core, detachment } = armyStratagems(all, "kult-of-speed");
    expect(core.map((s) => s.id)).toEqual(["a"]);
    expect(detachment.map((s) => s.id)).toEqual(["b"]);
  });
});

describe("matchesTargetRestrictions", () => {
  const kw = effectiveKeywords(orkBoyz);

  it("matches required keywords case-insensitively", () => {
    expect(
      matchesTargetRestrictions(
        strat({ id: "s", target_restrictions: { required_keywords: ["ORKS", "infantry"] } }),
        kw,
      ),
    ).toBe(true);
  });

  it("rejects when a required keyword is missing", () => {
    expect(
      matchesTargetRestrictions(
        strat({ id: "s", target_restrictions: { required_keywords: ["Orks", "Vehicle"] } }),
        kw,
      ),
    ).toBe(false);
  });

  it("honors required_keywords_any and excluded_keywords", () => {
    expect(
      matchesTargetRestrictions(
        strat({
          id: "s",
          target_restrictions: { required_keywords_any: ["Vehicle", "Mob"] },
        }),
        kw,
      ),
    ).toBe(true);
    expect(
      matchesTargetRestrictions(
        strat({
          id: "s",
          target_restrictions: { required_keywords: ["Orks"], excluded_keywords: ["Mob"] },
        }),
        kw,
      ),
    ).toBe(false);
  });

  it("never matches untargeted stratagems per-unit", () => {
    expect(matchesTargetRestrictions(strat({ id: "s" }), kw)).toBe(false);
  });
});

describe("detachment granted keywords", () => {
  const detachment = {
    id: "houndpack",
    name: "Houndpack",
    faction_id: "chaos-knights",
    granted_keywords: [{ keyword: "Battleline", to_keywords: ["War Dog"] }],
    game_version: { edition: "11th", dataslate: "launch" },
  } as unknown as Detachment;

  it("grants construction keywords to matching units for stratagem targeting", () => {
    const warDog = { keywords: ["Vehicle", "War Dog"], faction_keywords: ["Chaos Knights"] };
    const pool = [
      strat({ id: "s", target_restrictions: { required_keywords: ["Battleline"] } }),
    ];
    expect(stratagemsForUnit(warDog, pool, detachment)).toHaveLength(1);
    expect(stratagemsForUnit(orkBoyz, pool, detachment)).toHaveLength(1); // Boyz are Battleline already
    const rhino = { keywords: ["Vehicle"], faction_keywords: ["Chaos Knights"] };
    expect(stratagemsForUnit(rhino, pool, detachment)).toHaveLength(0);
  });
});
