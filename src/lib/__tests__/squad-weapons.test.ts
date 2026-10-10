/**
 * Squad-wide weapon choices (squad-weapons.ts): the editor swaps the whole
 * squad at once and keeps it uniform through other swaps and size changes.
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
  setModelCount,
  setSquadWeapon,
  squadChoiceStates,
  wargearCounts,
  wargearOptionStates,
  type ListContent,
} from "../list-edit";
import { byId } from "../lookup";
import { isSquadChoiceOption } from "../squad-weapons";
import type { WargearOption } from "@alpaca-software/40kdc-data";

const d = mergedData(data40k as never, emptyCodexDoc());
const F = "leagues-of-votann";
const unit = (id: string) => byId(d.units, id, F)!.raw;
const start = (id: string): ListContent =>
  addUnit(d, setFaction({ roster: blankSavedList("t").roster, roleHints: {}, attachments: {} }, F), id);
const counts = (c: ListContent) => Object.fromEntries(wargearCounts(c.roster.units[0]));
const squad = (c: ListContent, n = 0) =>
  squadChoiceStates(d, c.roster.units[0], unit(c.roster.units[0].ref.id!))[n];
const optionTo = (c: ListContent, item: string) =>
  wargearOptionStates(d, c.roster.units[0], unit(c.roster.units[0].ref.id!)).find((s) =>
    s.branches.some((b) => b.ids.includes(item)),
  )!;

describe("squad-wide weapon choices", () => {
  it("Beserks swap every axe for a maul, and keep it through gauntlets and resizing", () => {
    let c = start("cthonian-beserks");
    const sq = squad(c);
    expect(sq.branch).toBe(-1);
    c = setSquadWeapon(d, c, 0, sq.state.option.id, 0);
    expect(counts(c)["heavy-plasma-axe"] ?? 0).toBe(0);
    expect(counts(c)["concussion-maul"]).toBe(5);
    expect(squad(c).branch).toBe(0);

    // The gauntlet swap still works on a maul squad (it trades a maul).
    const g = optionTo(c, "twin-concussion-gauntlet");
    c = applyWargearOption(d, c, 0, g.option.id, 0, 1);
    expect(counts(c)).toMatchObject({ "concussion-maul": 4, "twin-concussion-gauntlet": 1 });
    expect(counts(c)["heavy-plasma-axe"] ?? 0).toBe(0);

    // Growing the squad hands the new models mauls, not axes.
    c = setModelCount(d, c, 0, 10);
    expect(counts(c)["heavy-plasma-axe"] ?? 0).toBe(0);
    expect(counts(c)["concussion-maul"]! + counts(c)["twin-concussion-gauntlet"]!).toBe(10);

    // And back to axes, gauntlets kept.
    c = setSquadWeapon(d, c, 0, squad(c).state.option.id, -1);
    expect(counts(c)["concussion-maul"] ?? 0).toBe(0);
    expect(counts(c)["heavy-plasma-axe"]).toBe(9);
  });

  it("drops the bundled Beserk axe → mole launcher + maul swap", () => {
    const states = wargearOptionStates(d, start("cthonian-beserks").roster.units[0], unit("cthonian-beserks"));
    expect(states.some((s) => s.branches.some((b) => b.ids.length === 2))).toBe(false);
  });

  it("Yaegirs: revolver + knife is squad-wide; one APM and one magna-coil", () => {
    let c = start("hernkyn-yaegirs");
    for (const item of ["apm-launcher", "magna-coil-rifle"]) {
      const st = optionTo(c, item);
      expect(st.cap).toBe(1);
      expect(st.branches.map((b) => b.ids)).toEqual([[item]]);
      c = applyWargearOption(d, c, 0, st.option.id, 0, 1);
      expect(optionTo(c, item)).toMatchObject({ cap: 1, totalApplied: 1 });
    }

    c = setSquadWeapon(d, c, 0, squad(c).state.option.id, 0);
    // 7 troopers switch; the APM and magna-coil Yaegirs keep their guns, the
    // Theyn keeps his shotgun (his swap is separate).
    expect(counts(c)).toMatchObject({
      "apm-launcher": 1,
      "magna-coil-rifle": 1,
      "bolt-revolver": 7,
      "plasma-knife": 7,
      "bolt-shotgun": 1,
    });
  });

  it("Pioneers: heavy per 3 models, one each of comms/scanner/searchlight, one add-on per model", () => {
    let c = start("hernkyn-pioneers");
    expect(c.roster.units[0].model_count).toBe(3);
    const take = (item: string) => {
      const st = optionTo(c, item);
      const b = st.branches.findIndex((x) => x.ids.includes(item));
      c = applyWargearOption(d, c, 0, st.option.id, b, 1);
    };
    take("multiwave-comms-array");
    take("panspectral-scanner");
    expect(counts(c)).toMatchObject({ "multiwave-comms-array": 1, "panspectral-scanner": 1 });
    expect(optionTo(c, "multiwave-comms-array")).toMatchObject({ cap: 1, totalApplied: 1 });
    take("hylas-rotary-cannon");
    expect(counts(c)["hylas-rotary-cannon"]).toBe(1);
    // All 3 models now carry an add-on: no searchlight, no second heavy.
    expect(optionTo(c, "rollbar-searchlight").cap).toBe(0);
    expect(optionTo(c, "ion-beamer")).toMatchObject({ cap: 1, totalApplied: 1 });

    c = setModelCount(d, c, 0, 6);
    expect(optionTo(c, "ion-beamer").cap).toBe(2);
    expect(optionTo(c, "rollbar-searchlight").cap).toBe(1);
  });

  it("Thunderkyn switch the whole squad between the three guns", () => {
    let c = start("brokhyr-thunderkyn");
    const sq = squad(c);
    const gbc = sq.state.branches.findIndex((b) => b.ids[0] === "graviton-blast-cannon");
    c = setSquadWeapon(d, c, 0, sq.state.option.id, gbc);
    expect(counts(c)["graviton-blast-cannon"]).toBe(3);
    c = setModelCount(d, c, 0, 6);
    expect(counts(c)["graviton-blast-cannon"]).toBe(6);
    expect(counts(c)["bolt-cannon"] ?? 0).toBe(0);
  });

  it("Hearthguard squad choices leave the Hesyr's own pick alone", () => {
    let c = start("einhyr-hearthguard");
    const ranged = squadChoiceStates(d, c.roster.units[0], unit("einhyr-hearthguard")).find((s) =>
      s.state.option.replaces?.includes("etacarn-plasma-gun"),
    )!;
    c = setSquadWeapon(d, c, 0, ranged.state.option.id, 0);
    const n = c.roster.units[0].model_count;
    expect(counts(c)["volkanite-disintegrator"]).toBe(n - 1);
    expect(counts(c)["etacarn-plasma-gun"]).toBe(1); // the Hesyr's
  });

  it("Space Marine Aggressors and Inceptors are squad-wide (codex overlay ids)", () => {
    const opt = (unit_id: string, from: string, to: string[]) =>
      ({ id: "x", unit_id, faction_id: "adeptus-astartes", replaces: [from], replacement: to,
        model_constraint: { any_number: true } }) as unknown as WargearOption;
    const sm = (id: string) => ({ id, faction_id: "adeptus-astartes" });
    expect(isSquadChoiceOption(sm("aggressor-squad"), opt("aggressor-squad",
      "aggressor-squad--flamestorm-gauntlets",
      ["aggressor-squad--auto-boltstorm-gauntlets", "aggressor-squad--fragstorm-grenade-launcher"]))).toBe(true);
    expect(isSquadChoiceOption(sm("inceptor-squad"), opt("inceptor-squad",
      "inceptor-squad--assault-bolters", ["inceptor-squad--plasma-exterminators"]))).toBe(true);
  });
});

describe("Imperial Agents one-model allowances", () => {
  const A = "agents-of-the-imperium";
  const states = (id: string) => {
    const c = addUnit(d, setFaction({ roster: blankSavedList("t").roster, roleHints: {}, attachments: {} }, A), id);
    return wargearOptionStates(d, c.roster.units[0], byId(d.units, id, A)!.raw);
  };
  const capOf = (id: string, item: string) =>
    states(id)
      .filter((s) => s.branches.some((b) => b.ids.includes(item)))
      .map((s) => s.cap);

  it("Sisters: one special-or-heavy slot plus one special-only slot", () => {
    expect(capOf("sisters-of-battle-squad", "multi-melta")).toEqual([1]);
    expect(capOf("sisters-of-battle-squad", "meltagun-sisters-of-battle-squad")).toEqual([1, 1]);
  });
  it("Terminators: 1 heavy, 1 narthecium, 1 banner", () => {
    expect(capOf("grey-knights-terminator-squad", "psycannon")).toEqual([1]);
    expect(capOf("grey-knights-terminator-squad", "narthecium")).toEqual([1]);
    expect(capOf("grey-knights-terminator-squad", "ancients-banner")).toEqual([1]);
  });
  it("Voidsmen: 1 rotor cannon; Sanctifiers: 1 extra hand flamer, 1 simulacrum", () => {
    expect(capOf("voidsmen-at-arms", "voidsman-rotor-cannon")).toEqual([1]);
    expect(capOf("sanctifiers", "simulacrum-imperialis")).toEqual([1]);
    expect(capOf("sanctifiers", "close-combat-weapon")).toEqual([1, 1]);
  });
});
