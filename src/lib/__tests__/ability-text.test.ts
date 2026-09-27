/**
 * Doc-level ability rewordings: one upstream ability's text replaced in
 * place, scoped to its faction, without touching the rest of the datasheet.
 */
import { describe, expect, it } from "vitest";
import * as data40k from "@alpaca-software/40kdc-data";
import { emptyCodexDoc, type CodexDoc } from "../codex-model";
import { mergedData } from "../data";
import { abilityText } from "../describe";

describe("abilityText overrides", () => {
  const doc: CodexDoc = {
    ...emptyCodexDoc(),
    abilityText: { "grey-knights": { "personal-teleporters": "  Reworded prose.  " } },
  };
  const d = mergedData(data40k as never, doc);
  const sheet = d.units.getInFaction("interceptor-squad", "grey-knights")!;

  it("replaces the generated text and clears the provisional flag", () => {
    const a = sheet.abilities.find((x) => x.id === "personal-teleporters")!;
    expect(abilityText(a)).toBe("Reworded prose.");
    expect(a.raw.game_version?.dataslate).toBe("reworded");
  });

  it("leaves the sheet's weapons and other abilities untouched", () => {
    const stock = data40k.units.getInFaction("interceptor-squad", "grey-knights")!;
    expect(sheet.raw.weapon_ids).toEqual(stock.raw.weapon_ids);
    const deep = sheet.abilities.find((x) => x.id === "deep-strike")!;
    expect(abilityText(deep)).toBe(
      abilityText(stock.abilities.find((x) => x.id === "deep-strike")!),
    );
  });

  it("ignores another faction's key", () => {
    const other = mergedData(data40k as never, {
      ...emptyCodexDoc(),
      abilityText: { orks: { "personal-teleporters": "Nope." } },
    });
    const a = other.units
      .getInFaction("interceptor-squad", "grey-knights")!
      .abilities.find((x) => x.id === "personal-teleporters")!;
    expect(abilityText(a)).not.toBe("Nope.");
  });
});
