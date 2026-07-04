/**
 * The founding use case, end to end: a GW-app-style Ork list with Ghaz, two
 * Bannernobz (one enhanced), three Boyz squads (one carrying a single rokkit),
 * and two Deff Dreads with different wargear — imported from pasted text, then
 * deduped for the glance screen.
 */
import { describe, expect, it } from "vitest";
import { stratagems, tryImportRoster } from "@alpaca-software/40kdc-data";
import { dedupeRoster, instanceTag } from "../dedupe";
import { armyStratagems, stratagemsForUnit } from "../stratagems";

const LIST = `
+++++++++++++++++++++++++++++++++++++++++++++++
+ FACTION KEYWORD: Xenos - Orks
+ DETACHMENT: War Horde
+ TOTAL ARMY POINTS: 1000pts
+
+ WARLORD: Char1: Ghazghkull Thraka
+ ENHANCEMENT: Follow Me Ladz (on Char2: Bannernob)
+ NUMBER OF UNITS: 8
+++++++++++++++++++++++++++++++++++++++++++++++

CHARACTERS

Ghazghkull Thraka (235 pts)
• Warlord
• 1x Gork's klaw
• 1x Mork's roar
• 1x Makari's stabba

Bannernob (75 pts)
• 1x Choppa
• 1x Shoota
• Follow Me Ladz (+15 pts)

Bannernob (60 pts)
• 1x Choppa
• 1x Shoota

BATTLELINE

Boyz (75 pts)
• 9x Boy
    • 9x Choppa
    • 9x Slugga
• 1x Boss Nob
    • 1x Power klaw
    • 1x Slugga

Boyz (75 pts)
• 9x Boy
    • 8x Choppa
    • 8x Slugga
    • 1x Rokkit launcha
    • 1x Close combat weapon
• 1x Boss Nob
    • 1x Power klaw
    • 1x Slugga

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
• 1x Skorcha
• 1x Big shoota
• 1x Stompy feet

Deff Dread (130 pts)
• 2x Dread klaw
• 2x Rokkit launcha
• 1x Stompy feet
`;

describe("ork glance scenario", () => {
  const result = tryImportRoster(LIST);

  it("imports and resolves the whole list", () => {
    expect(result.ok, result.ok ? "" : result.message).toBe(true);
    if (!result.ok) return;
    expect(result.roster.faction_id).toBe("orks");
    expect(result.roster.detachments[0]?.ref.id).toBe("war-horde");
    expect(result.roster.units).toHaveLength(8);
    for (const u of result.roster.units) {
      expect(u.ref.resolved, `unit not resolved: ${u.ref.raw_name}`).toBe(true);
    }
  });

  it("collapses 8 roster units into 5 glance entries", () => {
    if (!result.ok) return;
    const entries = dedupeRoster(result.roster);
    // Ghaz, enhanced Bannernob, plain Bannernob, Boyz ×3, Deff Dread ×2
    expect(entries).toHaveLength(5);

    const boyz = entries.find((e) => e.unitId === "boyz")!;
    expect(boyz.count).toBe(3);
    expect(boyz.totalModels).toBe(30);

    const rokkit = boyz.mergedWargear.find((w) => w.ref.id === "rokkit-launcha-boyz")!;
    expect(rokkit.totalCount).toBe(1);
    expect(rokkit.universal).toBe(false);
    expect(instanceTag(rokkit)).toBe("#2"); // only the second squad carries it

    const bannernobs = entries.filter((e) => e.unitId === "bannernob");
    expect(bannernobs).toHaveLength(2); // enhancement splits them
    expect(bannernobs.filter((e) => e.enhancement).length).toBe(1);

    const dread = entries.find((e) => e.unitId === "deff-dread")!;
    expect(dread.count).toBe(2);
    const skorcha = dread.mergedWargear.find((w) => w.ref.id === "skorcha")!;
    expect(instanceTag(skorcha)).toBe("#1");
    const dreadRokkit = dread.mergedWargear.find(
      (w) => w.ref.id === "rokkit-launcha-deff-dread",
    )!;
    expect(instanceTag(dreadRokkit)).toBe("#2");
    const klaw = dread.mergedWargear.find((w) => w.ref.id === "dread-klaw")!;
    expect(klaw.universal).toBe(true);
  });

  it("links stratagems with authored target restrictions by keyword", () => {
    if (!result.ok) return;
    const pool = armyStratagems(stratagems.all, "war-horde");
    expect(pool.detachment.length).toBeGreaterThan(0);
    expect(pool.core.length).toBeGreaterThan(0);

    const all = [...pool.detachment, ...pool.core];
    // Characters match Epic Challenge (core, requires Character keyword).
    const ghaz = { keywords: ["Character", "Epic Hero", "Infantry"], faction_keywords: ["Orks"] };
    expect(stratagemsForUnit(ghaz, all).map((s) => s.id)).toContain("epic-challenge");

    // Boyz match only stratagems with authored restrictions — most War Horde
    // stratagems carry none yet (dataset gap), so an empty result is valid.
    const boyz = { keywords: ["Infantry", "Battleline", "Mob", "Boyz"], faction_keywords: ["Orks"] };
    for (const s of stratagemsForUnit(boyz, all)) {
      expect(s.target_restrictions).not.toBeNull();
    }
  });
});
