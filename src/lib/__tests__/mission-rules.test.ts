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

  it("describes Sabotage's scoring", () => {
    const id = primaryIdFor(data, "priority-assets", "priority-assets");
    expect(id).toBe("sabotage");
    const rules = primaryRules(data, id!)!;
    expect(rules.summary?.startsWith("The Sabotage action")).toBe(true);
    expect(rules.rows[0]).toMatchObject({
      when: "End of your turn",
      condition: "Each unit that committed sabotage this turn",
      vp: "3 VP each",
    });
    expect(rules.rows[1].cumulative).toBe(true);
    expect(rules.rows[2]).toMatchObject({
      when: "End of your Command phase · round 2+",
      condition: "Control a non-home objective",
      vp: "4 VP",
    });
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

  it("formats triggers and preambles", () => {
    expect(describeTrigger({ timing: "end-of-battle", player_turn: "your-turn" })).toBe(
      "End of the battle",
    );
    expect(describeTrigger({ timing: "end-of-turn", player_turn: "either" })).toBe(
      "End of either player's turn",
    );
    expect(describeTrigger({ timing: "end-of-turn", battle_round: { min: 2, max: 4 } })).toBe(
      "End of your turn · rounds 2–4",
    );
    expect(stripMatchupPreamble("Take-and-Hold against Purge-the-Foe. Central pays.")).toBe(
      "Central pays.",
    );
    expect(stripMatchupPreamble("Priority-Assets mirror. The action.")).toBe("The action.");
  });
});
