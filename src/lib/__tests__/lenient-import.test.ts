/**
 * Lenient importer: text no strict adapter recognises (numbered tournament
 * submissions, ad-hoc headers, roll-up lines) is rewritten and re-imported.
 * The full dataset package stands in for the app's Data40k facade — it's the
 * same module shape ImportScreen passes at runtime.
 */
import { describe, expect, it } from "vitest";
import * as data from "@alpaca-software/40kdc-data";
import type { Data40k } from "../data";
import { importRosterLenient } from "../lenient-import";

const d = data as unknown as Data40k;

/** BCP-style numbered team submission (the Krakow Teams sample). */
const KRAKOW = `1. Player Name: Brian Seipp
2. Team Name: Ignite
3. List Name: Krakow Teams
4. Factions Used: Orks
5. Army Points: 2000
6. Army Enhancements (list on which model): Dreadherder (on Big Mek Dakkarig), Supa-glowy Fing (on Big Mek in Mega Armour)
7. Disposition: Priority Assets
8. Detachment(s): Dread Mob, Shoota Boyz, Wreckas
9. +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
10.
11. Nazdreg + 3x Meganobz (300 pts)
12.  Nazdreg (175 pts)
13.  3x Meganobz (125 pts) - 3x Twin Killsaw
14.
15. Mek + 6x Tankbustas (190 pts)
16.  Mek (45 pts)
17.  6x Tankbustas (145 pts) - 2x Rokkit Pistol, 6x Busta Rokkit Launcha
18.
19. Mek + 6x Tankbustas (190 pts)
20.  Mek (45 pts)
21.  6x Tankbustas (145 pts) - 2x Rokkit Pistol, 6x Busta Rokkit Launcha
22.
23. Big Mek Dakkarig (155 pts) - Enhancement: Dreadherder
24. Big Mek Dakkarig (135 pts)
25. Big Mek Dakkarig (145 pts)
26.
27. Big Mek in Mega Armour (115 pts) - Kustom Mega-blasta, Tellyport Blasta, Enhancement: Supa-glowy Fing
28.
29. Warboss (100 pts) - Kombi-rokkit, Power Klaw, Warlord
30.
31. Trukk (60 pts) - Grabbin' Klaw, Rokkit Launcha
32.
33. 10x Gretchin (45 pts)
34. 10x Gretchin (45 pts)
35.
36. 6x Killa Kans (260 pts)
37. 6x Killa Kans (260 pts`;

describe("importRosterLenient", () => {
  it("imports the numbered team-submission format via inference", () => {
    const { result, inferred, notes } = importRosterLenient(d, KRAKOW);
    expect(result.ok).toBe(true);
    expect(inferred).toBe(true);
    expect(notes.length).toBeGreaterThan(0);
    if (!result.ok) return;
    const roster = result.roster;

    expect(roster.name).toBe("Krakow Teams");
    expect(roster.faction_id).toBe("orks");
    expect(roster.points.declared_limit).toBe(2000);
    expect(roster.points.total_computed).toBe(2000);

    // Roll-up lines ("Nazdreg + 3x Meganobz (300 pts)") are dropped; their
    // members import as their own units.
    expect(roster.units).toHaveLength(16);
    expect(roster.units.every((u) => !u.ref.raw_name.includes(" + "))).toBe(true);

    const byName = (n: string) => roster.units.filter((u) => u.ref.raw_name === n);
    expect(byName("Gretchin")[0]?.model_count).toBe(10);
    expect(byName("Killa Kans")[0]?.model_count).toBe(6);
    expect(byName("Meganobz")[0]?.model_count).toBe(3);
    expect(byName("Warboss")[0]?.is_warlord).toBe(true);

    // Inline "- Enhancement: X" suffixes become real enhancement refs, priced
    // from the dataset when it knows the enhancement.
    const megaMek = byName("Big Mek in Mega Armour")[0];
    expect(megaMek?.enhancement?.raw_name).toBe("Supa-glowy Fing");
    expect(megaMek?.enhancement?.resolved).toBe(true);
    const dakkarig = byName("Big Mek Dakkarig").find((u) => u.enhancement !== null);
    expect(dakkarig?.enhancement?.raw_name).toBe("Dreadherder");
  });

  it("infers the faction from unit names when no header names one", () => {
    const bare = `Warboss (100 pts) - Power Klaw, Warlord
10x Gretchin (45 pts)
6x Killa Kans (260 pts)`;
    const { result, inferred, notes } = importRosterLenient(d, bare);
    expect(result.ok).toBe(true);
    expect(inferred).toBe(true);
    if (!result.ok) return;
    expect(result.roster.faction_id).toBe("orks");
    expect(result.roster.units).toHaveLength(3);
    expect(notes.some((n) => n.includes("Inferred faction"))).toBe(true);
  });

  it("treats a leading army-total line as the title, not a unit", () => {
    const titled = `Da Big Push (2000 pts)
Warboss (100 pts) - Warlord
10x Gretchin (45 pts)`;
    const { result } = importRosterLenient(d, titled);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.roster.name).toBe("Da Big Push");
    expect(result.roster.units).toHaveLength(2);
    expect(result.roster.points.declared_limit).toBe(2000);
  });

  it("passes a strictly-valid export through untouched", () => {
    const strict = `+++++++++++++++++++++++++++++++
+ FACTION KEYWORD: Xenos - Orks
+ DETACHMENT: Dread Mob
+ TOTAL ARMY POINTS: 145 pts
+++++++++++++++++++++++++++++++
1x Warboss (100 pts): Power Klaw, Warlord
10x Gretchin (45 pts): `;
    const { result, inferred, notes } = importRosterLenient(d, strict);
    expect(result.ok).toBe(true);
    expect(inferred).toBe(false);
    expect(notes).toEqual([]);
    if (!result.ok) return;
    expect(result.format).toBe("newrecruit-wtc-compact");
  });

  it("returns the strict failure when the text has no unit lines at all", () => {
    const { result, inferred } = importRosterLenient(d, "just some prose\nwith no points anywhere");
    expect(result.ok).toBe(false);
    expect(inferred).toBe(false);
  });
});
