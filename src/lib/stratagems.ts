/**
 * Link stratagems to the army and to individual units.
 *
 * A stratagem is "for" a unit when the unit's keywords (datasheet + faction +
 * any construction keywords granted by the detachment) satisfy the stratagem's
 * target_restrictions. Untargeted stratagems (`target_restrictions: null`)
 * belong in the army-wide section, not on every unit.
 */
import type { Detachment, Stratagem, Unit } from "@alpaca-software/40kdc-data";

export interface ArmyStratagems {
  detachment: Stratagem[];
  core: Stratagem[];
}

export function armyStratagems(
  all: readonly Stratagem[],
  detachmentId: string | null,
): ArmyStratagems {
  return {
    detachment: all.filter(
      (s) => s.category === "detachment" && s.detachment_id === detachmentId,
    ),
    core: all.filter((s) => s.category === "core"),
  };
}

const lc = (k: string) => k.toLowerCase();

/** Datasheet + faction keywords, plus detachment-granted construction keywords. */
export function effectiveKeywords(
  unit: Pick<Unit, "keywords" | "faction_keywords">,
  detachment?: Detachment | null,
): Set<string> {
  const kw = new Set([
    ...(unit.keywords ?? []).map(lc),
    ...(unit.faction_keywords ?? []).map(lc),
  ]);
  for (const grant of detachment?.granted_keywords ?? []) {
    const to = (grant.to_keywords ?? []).map(lc);
    if (to.some((k) => kw.has(k))) kw.add(lc(grant.keyword));
  }
  return kw;
}

export function matchesTargetRestrictions(
  stratagem: Stratagem,
  keywords: Set<string>,
): boolean {
  const tr = stratagem.target_restrictions;
  if (!tr) return false;
  const required = (tr.required_keywords ?? []).map(lc);
  const any = (tr.required_keywords_any ?? []).map(lc);
  const excluded = (tr.excluded_keywords ?? []).map(lc);
  return (
    required.every((k) => keywords.has(k)) &&
    (any.length === 0 || any.some((k) => keywords.has(k))) &&
    !excluded.some((k) => keywords.has(k))
  );
}

export function stratagemsForUnit(
  unit: Pick<Unit, "keywords" | "faction_keywords">,
  pool: readonly Stratagem[],
  detachment?: Detachment | null,
): Stratagem[] {
  const kw = effectiveKeywords(unit, detachment);
  return pool.filter((s) => matchesTargetRestrictions(s, kw));
}

const PHASE_ORDER = [
  "any",
  "command",
  "movement",
  "shooting",
  "charge",
  "fight",
  "morale",
] as const;

/** Stable sort for display: by first phase, then CP, then name. */
export function sortStratagems(stratagems: Stratagem[]): Stratagem[] {
  return [...stratagems].sort((a, b) => {
    const pa = PHASE_ORDER.indexOf((a.phases[0] ?? "any") as (typeof PHASE_ORDER)[number]);
    const pb = PHASE_ORDER.indexOf((b.phases[0] ?? "any") as (typeof PHASE_ORDER)[number]);
    if (pa !== pb) return pa - pb;
    if (a.cp_cost !== b.cp_cost) return a.cp_cost - b.cp_cost;
    return a.name.localeCompare(b.name);
  });
}
