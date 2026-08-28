/** The copy-share export: WTC-compact with the list's current name and totals. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as data40k from "@alpaca-software/40kdc-data";
import { shareText } from "../share";
import { normalizeImportedRoster } from "../normalize";
import type { SavedList } from "../../store/schema";

const text = readFileSync(join(import.meta.dirname, "gw-11e-attached.txt"), "utf8");

describe("shareText", () => {
  const result = data40k.tryImportRoster(text);
  if (!result.ok) throw new Error(result.message);
  const list = {
    id: "l1",
    name: "My Renamed List",
    roster: {
      ...result.roster,
      points: { ...result.roster.points, total_computed: 1600 },
    },
  } as SavedList;
  const out = shareText(data40k as never, list);

  it("uses the list's display name and current computed total", () => {
    expect(out).toContain("LIST NAME: My Renamed List");
    expect(out).toContain("TOTAL ARMY POINTS: 1600pts");
  });

  it("shows enhancements and per-unit wargear", () => {
    expect(out).toContain("ENHANCEMENT: Da Kaptin");
    expect(out).toMatch(/Beastboss on Squigosaur \(105 pts\): .*Beastchoppa/);
    expect(out).toMatch(/Squighog Boyz \(270 pts\)/);
  });

  it("orders characters before other units", () => {
    // Wazdakka sits mid-roster in the source; the share pulls characters up.
    expect(out.indexOf("1x Wazdakka Gutsmek")).toBeLessThan(out.indexOf("Squighog Boyz"));
    expect(out.indexOf("1x Wazdakka Gutsmek")).toBeLessThan(out.indexOf("x Boyz"));
  });

  it("tags every character with CharN by datasheet role, not just enhanced ones", () => {
    // Wazdakka is a character with no enhancement/attachment — the raw
    // serializer would leave him untagged.
    expect(out).toMatch(/Char\d+: 1x Wazdakka Gutsmek/);
    // Non-characters stay untagged; header warlord reference uses the same numbering.
    expect(out).not.toMatch(/Char\d+: \d+x Boyz/);
    const warlordSlot = out.match(/\+ WARLORD: Char(\d+): Beastboss on Squigosaur/)?.[1];
    expect(warlordSlot).toBeDefined();
    expect(out).toContain(`Char${warlordSlot}: 1x Beastboss on Squigosaur`);
  });

  it("hoists a led unit directly behind its leader", () => {
    // The fixture attaches the Beastboss (a character, pulled to the top) to
    // Squighog Boyz (mid-roster) — the pair must stay adjacent in the export.
    const { attachmentSeeds } = normalizeImportedRoster(result.roster, data40k as never, text);
    const withAtt = shareText(data40k as never, { ...list, attachments: attachmentSeeds });
    const units = withAtt
      .slice(withAtt.lastIndexOf("+++"))
      .split("\n")
      .filter((l) => /^\S.*\(\d+ pts\)/.test(l));
    const leader = units.findIndex((l) => l.includes("Beastboss on Squigosaur"));
    expect(leader).toBeGreaterThanOrEqual(0);
    expect(units[leader + 1]).toContain("Squighog Boyz");
  });

  it("filters attached characters to the top and renumbers CharN to match", () => {
    // Attach ONLY the third pair (Bigboss → Breaka Boyz, indices 4→5): the
    // pair must jump ahead of the earlier, now-loose characters, and Char1
    // must be the attached leader, not the roster's first character.
    const withAtt = shareText(data40k as never, { ...list, attachments: { "4": 5 } });
    const units = withAtt
      .slice(withAtt.lastIndexOf("+++"))
      .split("\n")
      .filter((l) => /^\S.*\(\d+ pts\)/.test(l));
    expect(units[0]).toMatch(/^Char1: 1x Bigboss/);
    expect(units[1]).toContain("Breaka Boyz");
    // Loose characters follow the attached pair, numbered after it.
    const squig = units.findIndex((l) => l.includes("Beastboss on Squigosaur"));
    expect(squig).toBeGreaterThan(1);
    expect(units[squig]).toMatch(/^Char[2-9]/);
  });

  it("puts a blank line between unit blocks, keeping Enhancement lines attached", () => {
    const body = out.slice(out.lastIndexOf("+++"));
    // Units are separated by exactly one blank line…
    expect(body).toMatch(/Squigosaur.*\nEnhancement: Da Kaptin\n\n/);
    // …and no unit line directly follows another without one.
    const lines = out.split("\n");
    const start = lines.map((l) => l.startsWith("+++")).lastIndexOf(true) + 2;
    for (let i = start; i < lines.length - 1; i++) {
      if (lines[i] === "" || lines[i + 1] === "") continue;
      expect(lines[i + 1].startsWith("Enhancement:")).toBe(true);
    }
  });
});
