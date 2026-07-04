/**
 * Apply user candidate-picks to a freshly imported roster. Overrides are a
 * `raw_name → entity id` map saved with the list, so re-importing the same
 * text (e.g. after a dataset update) re-applies the user's decisions.
 */
import type { ResolvedRef, Roster } from "@alpaca-software/40kdc-data";

export type Overrides = Record<string, string>;

function patchRef(ref: ResolvedRef, overrides: Overrides): ResolvedRef {
  if (ref.resolved) return ref;
  const id = overrides[ref.raw_name];
  if (!id) return ref;
  return { ...ref, id, resolved: true, candidates: [] };
}

export function applyOverrides(roster: Roster, overrides: Overrides): Roster {
  if (Object.keys(overrides).length === 0) return roster;
  return {
    ...roster,
    detachments: roster.detachments.map((d) => ({
      ...d,
      ref: patchRef(d.ref, overrides),
    })),
    units: roster.units.map((u) => ({
      ...u,
      ref: patchRef(u.ref, overrides),
      enhancement: u.enhancement ? patchRef(u.enhancement, overrides) : null,
      wargear: u.wargear.map((w) => ({ ...w, ref: patchRef(w.ref, overrides) })),
    })),
  };
}

/** Every still-unresolved ref in the roster, deduped by raw name. */
export interface UnresolvedRef {
  kind: "detachment" | "unit" | "enhancement" | "weapon";
  ref: ResolvedRef;
}

export function collectUnresolved(roster: Roster): UnresolvedRef[] {
  const seen = new Set<string>();
  const out: UnresolvedRef[] = [];
  const add = (kind: UnresolvedRef["kind"], ref: ResolvedRef) => {
    if (ref.resolved) return;
    const key = `${kind}:${ref.raw_name}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ kind, ref });
  };
  for (const d of roster.detachments) add("detachment", d.ref);
  for (const u of roster.units) {
    add("unit", u.ref);
    if (u.enhancement) add("enhancement", u.enhancement);
    for (const w of u.wargear) add("weapon", w.ref);
  }
  return out;
}
