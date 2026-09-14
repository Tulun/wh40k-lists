import { describe, expect, it } from "vitest";
import type { ResolvedRef, RosterUnit } from "@alpaca-software/40kdc-data";
import { completeDualModeWargear } from "../wargear-modes";

const nn = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

const ref = (id: string, rawName = id): ResolvedRef => ({
  id,
  raw_name: rawName,
  resolved: true,
  candidates: [],
});

const item = (id: string, count: number, rawName?: string): RosterUnit["wargear"][number] => ({
  ref: ref(id, rawName),
  count,
});

// Nazdreg's arsenal: a dual-mode gun (ranged + Extra Attacks melee record)
// plus a plain melee weapon.
const NAZDREG_WEAPONS = [
  { id: "nazdreg--kustom-blasta-x", name: "Kustom Blasta X" },
  { id: "nazdreg--kustom-blasta-x--melee", name: "Kustom Blasta X" },
  { id: "nazdreg--moonchewa", name: "Moonchewa" },
];

describe("completeDualModeWargear", () => {
  it("adds the missing mode when the bag carries only one record (single-line import)", () => {
    const out = completeDualModeWargear(
      NAZDREG_WEAPONS,
      [item("nazdreg--kustom-blasta-x", 1, "Kustom Blasta X"), item("nazdreg--moonchewa", 1)],
      nn,
    );
    expect(out.map((w) => [w.ref.id, w.count])).toEqual([
      ["nazdreg--kustom-blasta-x", 1],
      ["nazdreg--kustom-blasta-x--melee", 1],
      ["nazdreg--moonchewa", 1],
    ]);
  });

  it("splits a double-counted single record across the modes (per-profile lines)", () => {
    const out = completeDualModeWargear(
      NAZDREG_WEAPONS,
      [item("nazdreg--kustom-blasta-x", 2, "Kustom Blasta X"), item("nazdreg--moonchewa", 1)],
      nn,
    );
    expect(out.map((w) => [w.ref.id, w.count])).toEqual([
      ["nazdreg--kustom-blasta-x", 1],
      ["nazdreg--kustom-blasta-x--melee", 1],
      ["nazdreg--moonchewa", 1],
    ]);
  });

  it("keeps a multi-model count on every mode (5 klaws → 5 of each record)", () => {
    const weapons = [
      { id: "klaw", name: "Snagga Klaw" },
      { id: "klaw--melee", name: "Snagga Klaw" },
    ];
    const out = completeDualModeWargear(weapons, [item("klaw", 5, "Snagga Klaw")], nn);
    expect(out.map((w) => [w.ref.id, w.count])).toEqual([
      ["klaw", 5],
      ["klaw--melee", 5],
    ]);
  });

  it("merges separate same-group lines into one balanced run", () => {
    const out = completeDualModeWargear(
      NAZDREG_WEAPONS,
      [
        item("nazdreg--kustom-blasta-x", 1, "Kustom Blasta X"),
        item("nazdreg--moonchewa", 1),
        item("nazdreg--kustom-blasta-x--melee", 1, "Kustom Blasta X"),
      ],
      nn,
    );
    expect(out.map((w) => [w.ref.id, w.count])).toEqual([
      ["nazdreg--kustom-blasta-x", 1],
      ["nazdreg--kustom-blasta-x--melee", 1],
      ["nazdreg--moonchewa", 1],
    ]);
  });

  it("returns the same reference when the bag is already balanced", () => {
    const wargear = [
      item("nazdreg--kustom-blasta-x", 1, "Kustom Blasta X"),
      item("nazdreg--kustom-blasta-x--melee", 1, "Kustom Blasta X"),
      item("nazdreg--moonchewa", 1),
    ];
    expect(completeDualModeWargear(NAZDREG_WEAPONS, wargear, nn)).toBe(wargear);
  });

  it("leaves units without dual-mode weapons untouched", () => {
    const wargear = [item("choppa", 5), item("slugga", 5)];
    const weapons = [
      { id: "choppa", name: "Choppa" },
      { id: "slugga", name: "Slugga" },
    ];
    expect(completeDualModeWargear(weapons, wargear, nn)).toBe(wargear);
  });

  it("does not conjure a weapon the unit does not carry", () => {
    // Dual-mode records exist on the sheet, but the bag has none of them
    // (weapon not taken) — nothing should be added.
    const out = completeDualModeWargear(NAZDREG_WEAPONS, [item("nazdreg--moonchewa", 1)], nn);
    expect(out.map((w) => w.ref.id)).toEqual(["nazdreg--moonchewa"]);
  });
});
