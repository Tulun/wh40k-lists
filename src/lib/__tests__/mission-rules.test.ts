import { describe, expect, it } from "vitest";
import {
  describeTrigger,
  primaryIdFor,
  primaryRules,
  stripMatchupPreamble,
} from "../mission-rules";

describe("primary mission rules", async () => {
  const data = await import("@alpaca-software/40kdc-data");

  it("has scoring rows for every primary in the matchup matrix", () => {
    for (const m of data.missionMatchups.all) {
      const rules = primaryRules(data, m.mission_id);
      expect(rules?.rows.length, m.mission_id).toBeGreaterThan(0);
      expect(rules?.summary, m.mission_id).toBeTruthy();
    }
  });

  it("matches the printed Sabotage card", () => {
    const id = primaryIdFor(data, "priority-assets", "priority-assets");
    expect(id).toBe("sabotage");
    const rules = primaryRules(data, id!)!;
    expect(rules.summary?.startsWith("The Sabotage action")).toBe(true);
    expect(rules.rows[0]).toMatchObject({
      section: "Any battle round",
      when: "End of your turn",
      condition: "Each unit that committed sabotage this turn",
      vp: "3 VP each",
    });
    expect(rules.rows[1]).toMatchObject({ cumulative: true, vp: "2 VP each" });
    expect(rules.rows[2]).toMatchObject({
      section: "Second battle round onwards",
      when: "End of your Command phase (or end of your turn in the fifth battle round)",
      condition: "Control a non-home objective",
      vp: "4 VP",
    });
    expect(rules.actions).toEqual([
      {
        name: "Sabotage",
        starts: "Your Shooting phase",
        units: "A unit within range of an objective (not your home objective)",
        useLimit: "Unlimited",
        effect: undefined,
      },
    ]);
    expect(rules.vpPerRoundCap).toBe(15);
  });

  it("keeps a gated count's condition and its per-thing", () => {
    const rows = primaryRules(data, "battlefield-dominance")!.rows;
    expect(rows[2].condition).toMatch(/^Control your home objective: each /);
  });

  it("marks tiered OR rows", () => {
    const rows = primaryRules(data, "triangulation")!.rows.filter((r) => r.exclusiveGroup);
    expect(rows.map((r) => r.vp)).toEqual(["3 VP", "6 VP", "10 VP"]);
  });

  it("leaves the round-5 clause off Command-phase windows that stop before round 5", () => {
    const rows = primaryRules(data, "immovable-object")!.rows;
    expect(rows[1]).toMatchObject({
      section: "Battle rounds 2–4",
      when: "End of your Command phase",
    });
    expect(rows[2]).toMatchObject({ section: "Fifth battle round", when: "End of your turn" });
  });

  it("formats sections, WHEN lines and preambles", () => {
    expect(describeTrigger({ timing: "end-of-battle", player_turn: "your-turn" })).toEqual({
      section: "End of the battle",
      when: "End of the battle",
    });
    expect(describeTrigger({ timing: "end-of-turn", player_turn: "either" }).when).toBe(
      "End of either player's turn",
    );
    expect(describeTrigger({ timing: "end-of-turn", battle_round: { max: 2 } }).section).toBe(
      "Battle rounds 1–2",
    );
    expect(stripMatchupPreamble("Take-and-Hold against Purge-the-Foe. Central pays.")).toBe(
      "Central pays.",
    );
    expect(stripMatchupPreamble("Priority-Assets mirror. The action.")).toBe("The action.");
  });

  it("lists player actions but not setup bookkeeping", () => {
    const punish = primaryRules(data, "punishment")!.actions;
    expect(punish.map((a) => [a.name, a.starts, a.useLimit])).toEqual([
      ["Condemn", "Start of your turn", "Up to 3 per turn"],
    ]);
    const locate = primaryRules(data, "locate-and-deny")!.actions.map((a) => a.name);
    expect(locate).not.toContain("Place Markers");
    expect(locate).not.toContain("Clear Markers");
  });
});
