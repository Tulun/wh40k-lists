/**
 * Allied units resolve their gear under their own faction: shared weapon ids
 * carry different stats per faction.
 */
import { describe, expect, it } from "vitest";
import * as data40k from "@alpaca-software/40kdc-data";
import { emptyCodexDoc } from "../codex-model";
import { mergedData } from "../data";
import { byId, unitFactionId } from "../lookup";

const d = mergedData(data40k as never, emptyCodexDoc());

describe("unitFactionId", () => {
  it("uses the ally's faction for an Imperial Agents Rhino in a Grey Knights army", () => {
    const f = unitFactionId(d, "imperial-rhino", "grey-knights");
    expect(f).toBe("agents-of-the-imperium");
    expect(byId(d.weapons, "armoured-tracks", f)!.raw.profiles[0].stats.A).toBe(3);
  });

  it("keeps the army faction for native units", () => {
    expect(unitFactionId(d, "paladin-squad", "grey-knights")).toBe("grey-knights");
  });
});
