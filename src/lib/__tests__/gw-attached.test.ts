/**
 * Regression fixture: a real GW app 11e export (v2.0.5) with five "Attached
 * unit" groupings, dual detachments, enhancements, and ◦-nested per-model
 * loadouts. This is the exact shape the app must keep importing correctly.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as data40k from "@alpaca-software/40kdc-data";
import { dedupeRoster } from "../dedupe";
import { normalizeImportedRoster } from "../normalize";

const text = readFileSync(join(import.meta.dirname, "gw-11e-attached.txt"), "utf8");

describe("GW 11e export with attached units", () => {
  const result = data40k.tryImportRoster(text);
  it("imports", () => {
    expect(result.ok, result.ok ? "" : result.message).toBe(true);
  });
  if (!result.ok) return;
  const { roster, attachmentSeeds, roleHints } = normalizeImportedRoster(
    result.roster,
    data40k,
    text,
  );

  const indexOf = (id: string, nth = 0) =>
    roster.units.map((u, i) => ({ u, i })).filter(({ u }) => u.ref.id === id)[nth]?.i;

  it("splits the dual detachment header", () => {
    expect(roster.detachments.map((d) => d.ref.id)).toEqual(["freebooter-krew", "more-dakka"]);
  });

  it("pairs all five attached-unit groups, including the Support Bannernob", () => {
    expect(attachmentSeeds[String(indexOf("beastboss-on-squigosaur"))]).toBe(
      indexOf("squighog-boyz"),
    );
    expect(attachmentSeeds[String(indexOf("beastboss"))]).toBe(indexOf("beast-snagga-boyz"));
    expect(attachmentSeeds[String(indexOf("bigboss"))]).toBe(indexOf("breaka-boyz"));
    expect(attachmentSeeds[String(indexOf("bannernob"))]).toBe(indexOf("flash-gitz"));
    expect(attachmentSeeds[String(indexOf("big-mek-with-shokk-attack-gun"))]).toBe(
      indexOf("tankbustas"),
    );
    expect(roleHints[String(indexOf("bannernob"))]).toBe("support");
    // Solo units stay solo.
    expect(attachmentSeeds[String(indexOf("wazdakka-gutsmek"))]).toBeUndefined();
  });

  it("resolves enhancements and the warlord flag", () => {
    const beastboss = roster.units[indexOf("beastboss-on-squigosaur")!];
    expect(beastboss.is_warlord).toBe(true);
    expect(beastboss.enhancement?.resolved).toBe(true);
    const bannernob = roster.units[indexOf("bannernob")!];
    expect(bannernob.enhancement?.id).toBe("git-spotter-squig-freebooter-krew");
  });

  it("rebuilds loadout groups from ◦ nesting so carrier tags work", () => {
    const squighogs = roster.units[indexOf("squighog-boyz")!];
    expect(squighogs.loadout_groups?.map((g) => g.model_name)).toEqual([
      "Squighog Boy",
      "Nob on Smasha Squig",
    ]);

    const entries = dedupeRoster(roster);
    const entry = entries.find((e) => e.unitId === "squighog-boyz")!;
    const bigChoppa = entry.mergedWargear.find((w) => w.ref.id === "big-choppa-squighog-boyz")!;
    expect(bigChoppa.carrierModels).toEqual(["Nob on Smasha Squig"]);
    const jaws = entry.mergedWargear.find((w) => w.ref.id === "squig-jaws")!;
    expect(jaws.carrierModels).toEqual([]); // both model types carry it
  });
});
