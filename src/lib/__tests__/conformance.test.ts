/**
 * Import conformance: feed the 40kdc repo's roster fixtures through
 * tryImportRoster and compare the resolution-critical fields against the
 * repo's expected output. This doubles as the canary when the weekly
 * data-bump workflow updates the dataset package.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { tryImportRoster, type Roster } from "@alpaca-software/40kdc-data";

const FIXTURES = join(import.meta.dirname, "fixtures");

function essentials(roster: Roster) {
  return {
    faction_id: roster.faction_id,
    detachments: roster.detachments.map((d) => d.ref.id),
    units: roster.units.map((u) => ({
      id: u.ref.id,
      model_count: u.model_count,
      enhancement: u.enhancement?.id ?? null,
      wargear: [...u.wargear]
        .map((w) => ({ id: w.ref.id, raw: w.ref.raw_name, count: w.count }))
        .sort((a, b) => (a.id ?? a.raw).localeCompare(b.id ?? b.raw)),
      leader_attachment: u.leader_attachment
        ? { bodyguard: u.leader_attachment.bodyguard_ref.id, role: u.leader_attachment.role }
        : null,
    })),
  };
}

describe("roster import conformance", () => {
  for (const dir of readdirSync(FIXTURES)) {
    it(dir, () => {
      const caseDir = join(FIXTURES, dir);
      const inputFile = readdirSync(caseDir).find((f) => f.startsWith("input."));
      expect(inputFile).toBeDefined();
      const input = readFileSync(join(caseDir, inputFile!), "utf8");
      const expected: Roster = JSON.parse(
        readFileSync(join(caseDir, "expected.roster.json"), "utf8"),
      );

      const result = tryImportRoster(input);
      expect(result.ok, result.ok ? "" : result.message).toBe(true);
      if (!result.ok) return;
      expect(essentials(result.roster)).toEqual(essentials(expected));
    });
  }
});
