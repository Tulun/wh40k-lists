/**
 * Datasheet prose for wargear options — one case per constraint/body shape
 * that appears in the dataset corpus.
 */
import { describe, expect, it } from "vitest";
import { wargearOptionText, type WargearOptionLike } from "../describe";

const names: Record<string, string> = {
  shoota: "Kustom Shoota",
  klaw: "Power Klaw",
  rokkit: "Kombi-rokkit",
  choppa: "Big Choppa",
  drone: "Gun Drone",
};
const nameOf = (id: string) => names[id] ?? id;
const text = (o: WargearOptionLike) => wargearOptionText(o, nameOf);

describe("wargearOptionText", () => {
  it("any-number swap", () => {
    expect(
      text({ model_constraint: { any_number: true }, replaces: ["shoota"], replacement: ["rokkit"] }),
    ).toEqual({ text: "Any number of models can each replace their Kustom Shoota with 1 Kombi-rokkit." });
  });

  it("per-N model-name swap with a pick-one choice", () => {
    expect(
      text({
        model_constraint: { model_name: "Nob", per_n_models: 5 },
        replaces: ["shoota", "klaw"],
        replacement_choice: [["rokkit"], ["choppa", "choppa"]],
      }),
    ).toEqual({
      text: "For every 5 models, 1 Nob can replace their Kustom Shoota and Power Klaw with one of the following:",
      choices: ["1 Kombi-rokkit", "2× Big Choppa"],
    });
  });

  it("flat allowances: 1 model vs up-to-K models", () => {
    expect(
      text({ model_constraint: { max_count: 1 }, replaces: ["klaw"], replacement: ["choppa"] }).text,
    ).toBe("1 model can replace their Power Klaw with 1 Big Choppa.");
    expect(
      text({ model_constraint: { max_count: 2 }, replaces: ["klaw"], replacement: ["choppa"] }).text,
    ).toBe("Up to 2 models can each replace their Power Klaw with 1 Big Choppa.");
  });

  it("multi-take add-on mount with a cost", () => {
    expect(
      text({
        model_constraint: { any_number: true, max_count: 2 },
        replacement: ["drone"],
        additional_cost: 10,
      }).text,
    ).toBe("Each model can be equipped with 1 Gun Drone, up to 2 times per model for +10 pts.");
  });

  it("unconstrained option reads as any-number", () => {
    expect(text({ replacement: ["drone"] }).text).toBe(
      "Any number of models can each be equipped with 1 Gun Drone.",
    );
  });
});
