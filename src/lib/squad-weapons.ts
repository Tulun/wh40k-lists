/**
 * Squad-wide weapon choices: datasheets where every model of a type carries
 * the same weapon ("all bolt cannons, or all graviton blast cannons"), which
 * the package schema can't say — upstream models them as `any_number`
 * per-model swaps, so the editor would happily build a mixed squad.
 *
 * Each entry names one package option (by model + replaced items); its
 * branches are the squad's alternatives. The option stays in the data — it's
 * what lets the validator accept a converted squad — but the editor renders
 * it as one squad picker and keeps the squad uniform across size changes and
 * other swaps (see `setSquadWeapon` / `withSquadBase` in list-edit.ts).
 */
import type { WargearOption } from "@alpaca-software/40kdc-data";

interface SquadChoiceKey {
  /** The option's `model_constraint.model_name`; omitted for single-model-type units. */
  model?: string;
  /** The datasheet default the whole squad swaps away from. */
  replaces: string[];
}

// 11e datasheets, cross-checked against BSData wh40k-11e ("Squad weapon
// choice", "All models must be equipped with the same weapon").
const SQUAD_WEAPON_CHOICES: Record<string, Record<string, SquadChoiceKey[]>> = {
  // Sergeant included — the whole squad matches (codex overlay ids).
  "adeptus-astartes": {
    "aggressor-squad": [{ replaces: ["aggressor-squad--flamestorm-gauntlets"] }],
    "inceptor-squad": [{ replaces: ["inceptor-squad--assault-bolters"] }],
  },
  "leagues-of-votann": {
    "cthonian-beserks": [{ replaces: ["heavy-plasma-axe"] }],
    "brokhyr-thunderkyn": [{ replaces: ["bolt-cannon"] }],
    "hernkyn-yaegirs": [{ model: "Hernkyn Yaegir", replaces: ["bolt-shotgun"] }],
    "einhyr-hearthguard": [
      { model: "Einhyr Hearthguard", replaces: ["etacarn-plasma-gun"] },
      { model: "Einhyr Hearthguard", replaces: ["concussion-gauntlet"] },
    ],
  },
};

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

/** True when `option` is one of its unit's squad-wide choices. */
export function isSquadChoiceOption(
  unit: { id: string; faction_id: string },
  option: WargearOption,
): boolean {
  const keys = SQUAD_WEAPON_CHOICES[unit.faction_id]?.[unit.id];
  if (!keys) return false;
  const mc = option.model_constraint;
  // Only the uncapped per-model record is the squad choice — a per-5 swap of
  // the same default (Beserk gauntlets, the Yaegir special weapon) is not.
  if (mc && (mc.per_n_models || mc.max_count || mc.any_number === false)) return false;
  const model = mc?.model_name;
  return keys.some(
    (k) => (k.model ?? undefined) === (model ?? undefined) && sameSet(k.replaces, option.replaces ?? []),
  );
}

/** True when the unit has any squad-wide choice. */
export function hasSquadChoices(unit: { id: string; faction_id: string }): boolean {
  return !!SQUAD_WEAPON_CHOICES[unit.faction_id]?.[unit.id];
}
