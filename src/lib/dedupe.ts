/**
 * Collapse a roster's unit instances into glanceable display entries.
 *
 * Grouping key: datasheet id (or normalized raw name when unresolved) plus the
 * enhancement. Three plain Boyz squads become one entry with a ×3 badge and
 * the union of their wargear; two Bannernobz where only one carries an
 * enhancement stay separate entries, because the enhancement changes what the
 * unit does.
 */
import type {
  ResolvedRef,
  Roster,
  RosterLeaderAttachment,
  RosterUnit,
} from "@alpaca-software/40kdc-data";

type RosterLoadoutGroup = NonNullable<RosterUnit["loadout_groups"]>[number];

export interface InstanceInfo {
  rosterIndex: number;
  modelCount: number;
  points: number | null;
  enhancementPoints: number | null;
  isWarlord: boolean;
  leaderAttachment: RosterLeaderAttachment | null;
  loadoutGroups?: RosterLoadoutGroup[];
}

export interface MergedWeapon {
  ref: ResolvedRef;
  totalCount: number;
  /** Count carried by each instance, aligned with DisplayEntry.instances. */
  perInstance: number[];
  /** True when every instance carries the same non-zero count. */
  universal: boolean;
  /**
   * Model types that carry this weapon, when the import decomposed loadouts
   * per model AND only some model types carry it ("Nob on Smasha Squig").
   * Empty when carried squad-wide or when no loadout breakdown exists.
   */
  carrierModels: string[];
}

export interface DisplayEntry {
  key: string;
  unitId: string | null;
  name: string;
  enhancement: ResolvedRef | null;
  instances: InstanceInfo[];
  count: number;
  totalModels: number;
  totalPoints: number;
  isWarlord: boolean;
  mergedWargear: MergedWeapon[];
}

/** Loose normalization for grouping unresolved names ("Killa Kanz " ≡ "killa kanz"). */
export function normalizeKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Display key for a roster unit: datasheet id + enhancement — the unit-detail route key. */
export function unitKey(unit: RosterUnit): string {
  const base = unit.ref.id ?? `raw:${normalizeKey(unit.ref.raw_name)}`;
  const enh = unit.enhancement
    ? (unit.enhancement.id ?? `raw:${normalizeKey(unit.enhancement.raw_name)}`)
    : "";
  return `${base}::${enh}`;
}

function wargearKey(ref: ResolvedRef): string {
  return ref.id ?? `raw:${normalizeKey(ref.raw_name)}`;
}

export function dedupeRoster(roster: Roster): DisplayEntry[] {
  const entries = new Map<string, DisplayEntry>();
  const gearByEntry = new Map<string, Map<string, MergedWeapon>>();
  // Per entry: model name → weapon keys it carries, from loadout_groups.
  const carriersByEntry = new Map<string, Map<string, Set<string>>>();

  roster.units.forEach((unit, rosterIndex) => {
    const key = unitKey(unit);
    let entry = entries.get(key);
    if (!entry) {
      entry = {
        key,
        unitId: unit.ref.id,
        name: unit.ref.raw_name,
        enhancement: unit.enhancement,
        instances: [],
        count: 0,
        totalModels: 0,
        totalPoints: 0,
        isWarlord: false,
        mergedWargear: [],
      };
      entries.set(key, entry);
      gearByEntry.set(key, new Map());
      carriersByEntry.set(key, new Map());
    }

    const instanceIndex = entry.instances.length;
    entry.instances.push({
      rosterIndex,
      modelCount: unit.model_count,
      points: unit.points,
      enhancementPoints: unit.enhancement_points,
      isWarlord: unit.is_warlord,
      leaderAttachment: unit.leader_attachment,
      loadoutGroups: unit.loadout_groups,
    });
    entry.count += 1;
    entry.totalModels += unit.model_count;
    entry.totalPoints += (unit.points ?? 0) + (unit.enhancement_points ?? 0);
    entry.isWarlord ||= unit.is_warlord;

    const gear = gearByEntry.get(key)!;
    for (const item of unit.wargear) {
      const gKey = wargearKey(item.ref);
      let merged = gear.get(gKey);
      if (!merged) {
        merged = { ref: item.ref, totalCount: 0, perInstance: [], universal: false, carrierModels: [] };
        gear.set(gKey, merged);
      }
      // Pad up to the current instance, then add this instance's count.
      while (merged.perInstance.length < instanceIndex) merged.perInstance.push(0);
      if (merged.perInstance.length === instanceIndex) merged.perInstance.push(0);
      merged.perInstance[instanceIndex] += item.count;
      merged.totalCount += item.count;
    }

    const carriers = carriersByEntry.get(key)!;
    for (const group of unit.loadout_groups ?? []) {
      if (!group.model_name) continue;
      let carried = carriers.get(group.model_name);
      if (!carried) {
        carried = new Set();
        carriers.set(group.model_name, carried);
      }
      for (const item of group.wargear) carried.add(wargearKey(item.ref));
    }
  });

  for (const entry of entries.values()) {
    const gear = gearByEntry.get(entry.key)!;
    const carriers = carriersByEntry.get(entry.key)!;
    const modelTypeCount = carriers.size;
    for (const [gKey, merged] of gear) {
      while (merged.perInstance.length < entry.count) merged.perInstance.push(0);
      merged.universal = merged.perInstance.every(
        (n) => n === merged.perInstance[0] && n > 0,
      );
      // Tag the weapon with its carrier model(s) only when carried by a strict
      // subset of the unit's model types ("Big choppa — Nob on Smasha Squig").
      if (modelTypeCount > 1) {
        const carrying = [...carriers.entries()]
          .filter(([, keys]) => keys.has(gKey))
          .map(([name]) => name);
        if (carrying.length > 0 && carrying.length < modelTypeCount) {
          merged.carrierModels = carrying.sort();
        }
      }
      entry.mergedWargear.push(merged);
    }
  }

  return [...entries.values()];
}

/** Human tag for a non-universal weapon: which instances carry it. */
export function instanceTag(weapon: MergedWeapon): string | null {
  if (weapon.universal || weapon.perInstance.length <= 1) return null;
  const carriers = weapon.perInstance
    .map((n, i) => (n > 0 ? i + 1 : 0))
    .filter(Boolean);
  if (carriers.length === weapon.perInstance.length) return "all, varies";
  return carriers.map((i) => `#${i}`).join(", ");
}
