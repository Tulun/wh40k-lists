/**
 * Dual-mode weapon hygiene for roster wargear.
 *
 * A datasheet can carry two weapon records with the same display name — the
 * modes of one physical weapon (Nazdreg's Kustom Blasta X is a ranged record
 * plus an Extra Attacks melee record). A wargear line naming it means the
 * physical weapon, i.e. every mode. Sources disagree on how many lines that
 * is: a GW export prints one line (so the melee record never enters the
 * bag), some exports print one line per profile (the importer resolves both
 * to the same record and double-counts it), and lists saved before a mode
 * record existed in the codex are missing it outright. Rebalance so every
 * mode record carries the physical count.
 */
import type { Roster, RosterUnit } from "@alpaca-software/40kdc-data";
import type { Data40k } from "./data";

type WargearItem = RosterUnit["wargear"][number];

export function completeDualModeWargear(
  unitWeapons: readonly { id: string; name: string }[],
  wargear: RosterUnit["wargear"],
  normalizeName: (s: string) => string,
): RosterUnit["wargear"] {
  const byName = new Map<string, { id: string; name: string }[]>();
  for (const w of unitWeapons) {
    const key = normalizeName(w.name);
    byName.set(key, [...(byName.get(key) ?? []), w]);
  }
  const groupOfId = new Map<string, string>();
  for (const [key, records] of byName) {
    if (records.length < 2) continue;
    for (const r of records) groupOfId.set(r.id, key);
  }
  if (groupOfId.size === 0) return wargear;

  const totals = new Map<string, number>();
  for (const item of wargear) {
    const key = item.ref.id ? groupOfId.get(item.ref.id) : undefined;
    if (key) totals.set(key, (totals.get(key) ?? 0) + item.count);
  }
  if (totals.size === 0) return wargear;

  // One line per printed profile double-counts the physical weapon; a single
  // line counts it once. A total divisible by the mode count is the former.
  const physical = (key: string) => {
    const total = totals.get(key)!;
    const modes = byName.get(key)!.length;
    return total % modes === 0 ? total / modes : total;
  };

  const out: WargearItem[] = [];
  const emitted = new Set<string>();
  for (const item of wargear) {
    const key = item.ref.id ? groupOfId.get(item.ref.id) : undefined;
    if (!key) {
      out.push(item);
      continue;
    }
    // Later lines of an emitted group merged into its first occurrence.
    if (emitted.has(key)) continue;
    emitted.add(key);
    const count = physical(key);
    for (const record of byName.get(key)!) {
      const existing =
        record.id === item.ref.id ? item : wargear.find((o) => o.ref.id === record.id);
      out.push(
        existing?.count === count
          ? existing
          : {
              ref: existing?.ref ?? {
                id: record.id,
                raw_name: record.name,
                resolved: true,
                candidates: [],
              },
              count,
            },
      );
    }
  }
  const unchanged = out.length === wargear.length && out.every((w, i) => w === wargear[i]);
  return unchanged ? wargear : out;
}

/** Apply the rebalance across a whole roster; returns the same reference when nothing changed. */
export function completeRosterWargear(data: Data40k, roster: Roster): Roster {
  let changed = false;
  const units = roster.units.map((unit) => {
    if (!unit.ref.resolved) return unit;
    const view = data.resolveRosterUnit(unit, data.dataset, roster.faction_id);
    if (!view) return unit;
    const wargear = completeDualModeWargear(view.weapons, unit.wargear, data.normalizeName);
    if (wargear === unit.wargear) return unit;
    changed = true;
    return { ...unit, wargear };
  });
  return changed ? { ...roster, units } : roster;
}
