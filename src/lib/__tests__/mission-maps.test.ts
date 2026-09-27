import { describe, expect, it } from "vitest";
import { matchMissionPage, missionPairings, pageKey } from "../mission-maps";

describe("mission map pages", async () => {
  const data = await import("@alpaca-software/40kdc-data");
  const pairings = missionPairings(data);

  it("covers all 15 disposition pairings", () => {
    expect(pairings).toHaveLength(15);
    expect(
      pairings.find((p) => p.a === "take-and-hold" && p.b === "purge-the-foe")?.missions,
    ).toEqual(["Immovable Object", "Unstoppable Force"]);
  });

  it("matches a map page by its two primaries and layout letter", () => {
    const text =
      'TAKE AND HOLD VS FORCE DISPOSITION MISSION LAYOUT B UNSTOPPABLE  FORCE IMMOVABLE OBJECT 12" AB';
    expect(matchMissionPage(text, pairings)).toBe(pageKey("purge-the-foe", "take-and-hold", "B"));
  });

  it("matches mirror matchups, curly apostrophes and split words", () => {
    expect(matchMissionPage("LAYOUT C MEATGRINDER MEATGRINDER", pairings)).toBe(
      pageKey("purge-the-foe", "purge-the-foe", "C"),
    );
    expect(matchMissionPage("LAYOUT A VITAL LINK DESTROYER’S WR ATH", pairings)).toBe(
      pageKey("priority-assets", "purge-the-foe", "A"),
    );
  });

  it("ignores pages without a layout or with a different mission mix", () => {
    expect(matchMissionPage("Take and Hold vs Take and Hold: Layout B", pairings)).toBeNull();
    expect(matchMissionPage("LAYOUTS KEY BATTLEFIELD DOMINANCE", pairings)).toBeNull();
    expect(matchMissionPage("LAYOUT A MEATGRINDER SABOTAGE", pairings)).toBeNull();
  });
});
