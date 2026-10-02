/** v5 migration: saved lists that took the GW title total as their limit. */
import { describe, expect, it } from "vitest";
import { migrate } from "../../store/schema";

const list = (id: string, rawText: string, declared_limit: number | null) => ({
  id,
  rawText,
  updated: "2026-01-01T00:00:00.000Z",
  roster: { points: { declared_limit } },
});

describe("migrate to v5", () => {
  it("repairs title-total limits and stamps the fixed lists", () => {
    const s = migrate(
      {
        lists: {
          a: list("a", "My list (1,995 Points)\n\nOrks\nStrike Force (2,000 Points)", 1995),
          b: list("b", '{"name":"copied json"}', 1995),
          c: list("c", "Other (2,000 Points)", 2000),
          d: list("d", "Small (1,000 Points)\nIncursion (1,000 Points)", 1500),
        },
        slots: { mine: null, opponent: null },
        activeSlot: "mine",
        updated: null,
        dirty: false,
        sync: { lastSynced: null, remoteUpdated: null, knownIds: [] },
      },
      4,
    );
    expect(s.lists.a.roster.points.declared_limit).toBe(2000);
    expect(s.lists.b.roster.points.declared_limit).toBe(2000);
    expect(s.lists.c.roster.points.declared_limit).toBe(2000);
    expect(s.lists.c.updated).toBe("2026-01-01T00:00:00.000Z");
    expect(s.lists.d.roster.points.declared_limit).toBe(1000);
    expect(s.dirty).toBe(true);
  });
});
