/** The copy-share export: WTC-compact with the list's current name and totals. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as data40k from "@alpaca-software/40kdc-data";
import { shareText } from "../share";
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
