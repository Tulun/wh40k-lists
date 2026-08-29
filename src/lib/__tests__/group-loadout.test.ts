/**
 * Spread-preferring loadout grouping: each wargear option lands on its own
 * model instead of the package's alphabetical-first assignment, which stacked
 * every Kommando special onto a single model.
 */
import { describe, expect, it } from "vitest";
import type { Unit, WargearOption } from "@alpaca-software/40kdc-data";
import { groupLoadoutSpread } from "../group-loadout";

// Kommandos as the codex overlay compiles them: Nob (choppa/slugga, swap to
// big choppa or power klaw), 9 Kommandos (choppa/slugga; +1 burna, +1 rokkit,
// breacha ram replaces a choppa, up to 2 kustom shootas).
const W = {
  choppa: "k--choppa",
  slugga: "k--slugga",
  bigChoppa: "k--big-choppa",
  powerKlaw: "k--power-klaw",
  burna: "k--burna",
  rokkit: "k--rokkit-launcha",
  breacha: "k--breacha-ram",
  kustom: "k--kustom-shoota",
};

const unit = { id: "k", weapon_ids: Object.values(W) } as unknown as Unit;

const models = [
  { name: "Nob", min: 1, max: 1, default_weapon_ids: [W.choppa, W.slugga] },
  { name: "Kommando", min: 9, max: 9, default_weapon_ids: [W.choppa, W.slugga] },
];

const opt = (o: Partial<WargearOption>): WargearOption =>
  ({ id: "o", unit_id: "k", ...o }) as WargearOption;

const options: WargearOption[] = [
  opt({
    model_constraint: { model_name: "Nob", any_number: true },
    replaces: [W.choppa],
    replacement_choice: [[W.bigChoppa], [W.powerKlaw]],
  }),
  opt({
    model_constraint: { model_name: "Kommando", max_count: 1 },
    replacement: [W.burna],
  }),
  opt({
    model_constraint: { model_name: "Kommando", max_count: 1 },
    replacement: [W.rokkit],
  }),
  opt({
    model_constraint: { model_name: "Kommando", max_count: 1 },
    replaces: [W.choppa],
    replacement: [W.breacha],
  }),
  opt({
    model_constraint: { model_name: "Kommando", max_count: 2 },
    replacement: [W.kustom],
  }),
];

describe("groupLoadoutSpread", () => {
  it("gives each Kommando option its own model", () => {
    // Nob with power klaw; full specials: burna, rokkit, breacha, 2 kustom.
    const counts = new Map([
      [W.powerKlaw, 1],
      [W.slugga, 10],
      [W.choppa, 8],
      [W.burna, 1],
      [W.rokkit, 1],
      [W.breacha, 1],
      [W.kustom, 2],
    ]);
    const groups = groupLoadoutSpread(unit, 10, options, models, counts);
    expect(groups).not.toBeNull();
    const byKey = groups!.map((g) => ({
      name: g.model_name,
      count: g.count,
      weapons: g.weapons.map((w) => w.id).join(","),
    }));
    expect(byKey).toEqual([
      { name: "Nob", count: 1, weapons: `${W.powerKlaw},${W.slugga}` },
      { name: "Kommando", count: 4, weapons: `${W.choppa},${W.slugga}` },
      { name: "Kommando", count: 2, weapons: `${W.choppa},${W.kustom},${W.slugga}` },
      { name: "Kommando", count: 1, weapons: `${W.breacha},${W.slugga}` },
      { name: "Kommando", count: 1, weapons: `${W.burna},${W.choppa},${W.slugga}` },
      { name: "Kommando", count: 1, weapons: `${W.choppa},${W.rokkit},${W.slugga}` },
    ]);
  });

  it("returns null when the bag has no exact partition", () => {
    const counts = new Map([
      [W.slugga, 10],
      [W.choppa, 10],
      [W.burna, 3], // over the single-model cap
    ]);
    expect(groupLoadoutSpread(unit, 10, options, models, counts)).toBeNull();
  });

  it("keeps the plain base loadout grouped as one block per model type", () => {
    const counts = new Map([
      [W.slugga, 10],
      [W.choppa, 10],
    ]);
    const groups = groupLoadoutSpread(unit, 10, options, models, counts);
    expect(groups).toEqual([
      {
        model_name: "Nob",
        count: 1,
        weapons: [
          { id: W.choppa, count: 1 },
          { id: W.slugga, count: 1 },
        ],
      },
      {
        model_name: "Kommando",
        count: 9,
        weapons: [
          { id: W.choppa, count: 1 },
          { id: W.slugga, count: 1 },
        ],
      },
    ]);
  });
});
