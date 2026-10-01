/**
 * Grey Knights wargear the editor must offer (and refuse): shared-chassis
 * options survive the dataset rebuild, and squad special-weapon budgets cap
 * the swap steppers.
 */
import { describe, expect, it } from "vitest";
import * as data40k from "@alpaca-software/40kdc-data";
import { emptyCodexDoc } from "../codex-model";
import { mergedData } from "../data";
import {
  addUnit,
  applyWargearOption,
  blankSavedList,
  setFaction,
  nextSize,
  setModelCount,
  sizeRange,
  wargearCounts,
  wargearOptionStates,
  type ListContent,
} from "../list-edit";
import { byId } from "../lookup";
import { wargearOptionText } from "../describe";

const d = mergedData(data40k as never, emptyCodexDoc());
const blank = blankSavedList("test");
const gk = setFaction(
  { roster: blank.roster, roleHints: {}, attachments: {} },
  "grey-knights",
);
const unitOf = (id: string) => byId(d.units, id, "grey-knights")!.raw;

describe("shared-chassis options", () => {
  it("keeps the GK Razorback's options although SM owns the same option ids", () => {
    const c = addUnit(d, gk, "razorback");
    const states = wargearOptionStates(d, c.roster.units[0], unitOf("razorback"));
    const adds = states.flatMap((s) => s.branches.flatMap((b) => b.ids));
    expect(adds).toEqual(
      expect.arrayContaining(["twin-lascannon", "storm-bolter", "hunter-killer-missile"]),
    );
  });
});

describe("Interceptor special-weapon budget", () => {
  const takeAll = (c: ListContent, times: number) => {
    const opt = wargearOptionStates(d, c.roster.units[0], unitOf("interceptor-squad"))[0];
    for (let i = 0; i < times; i++) c = applyWargearOption(d, c, 0, opt.option.id, 1, 1);
    return c;
  };
  const psycannons = (c: ListContent) =>
    wargearCounts(c.roster.units[0]).get("psycannon-interceptor-squad") ?? 0;

  it("allows one special per 5 models", () => {
    let c = addUnit(d, gk, "interceptor-squad");
    expect(wargearOptionStates(d, c.roster.units[0], unitOf("interceptor-squad"))[0].cap).toBe(1);
    expect(psycannons(takeAll(c, 3))).toBe(1);

    c = setModelCount(d, c, 0, 10);
    expect(wargearOptionStates(d, c.roster.units[0], unitOf("interceptor-squad"))[0].cap).toBe(2);
    expect(psycannons(takeAll(c, 5))).toBe(2);
  });
});

describe("size stepper", () => {
  const steps = (id: string) => {
    const unit = unitOf(id);
    const out = [sizeRange(unit)!.min];
    for (let n = nextSize(d, unit, out[0], 1); n != null; n = nextSize(d, unit, n, 1)) out.push(n);
    return out;
  };

  it("steps between tier tops, skipping undersized counts", () => {
    expect(steps("paladin-squad")).toEqual([4, 5, 8, 10]);
    expect(steps("brotherhood-terminator-squad")).toEqual([4, 5, 8, 10]);
    expect(steps("strike-squad")).toEqual([5, 10]);
    expect(steps("purifier-squad")).toEqual([5, 10]);
    expect(nextSize(d, unitOf("paladin-squad"), 7, -1)).toBe(5);
  });
});

describe("budgeted wargear text", () => {
  it("prints the Purifier swap as 2 per 5 models, gun first", () => {
    const unit = unitOf("purifier-squad");
    const opt = d.dataset.wargearOptionsOf(unit)[0];
    const name = (id: string) => byId(d.weapons, id, "grey-knights")?.raw.name ?? id;
    const t = wargearOptionText(opt, name, unit.wargear_budgets ?? []);
    expect(t.text).toMatch(/^For every 5 models in this unit, up to 2 Purifier models/);
    expect(t.choices).toContain("1 Psycannon and 1 Close combat weapon");
  });
});
