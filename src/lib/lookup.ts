/**
 * Faction-aware id lookup. Plain `collection.get(id)` throws on ids that exist
 * under multiple factions (shared-chassis units, Space Marine chapter
 * detachments, common ability ids), so always prefer the roster's faction and
 * fall back to first-wins.
 */
import type { Collection } from "@alpaca-software/40kdc-data";
import type { Data40k } from "./data";

export function byId<V>(
  collection: Collection<unknown, V>,
  id: string | null | undefined,
  factionId?: string | null,
): V | undefined {
  if (!id) return undefined;
  if (factionId) {
    const scoped = collection.getInFaction(id, factionId);
    if (scoped) return scoped;
  }
  return collection.getAny(id);
}

/**
 * The faction's army rule (Waaagh!…). Unit datasheets carry a same-named core
 * tag with no text of its own — render sites fall back to this ability.
 */
export function armyRule(data: Data40k, factionId: string | null | undefined) {
  return armyRules(data, factionId)[0];
}

/** Every army rule the faction carries (11e factions can have several). */
export function armyRules(data: Data40k, factionId: string | null | undefined) {
  const faction = factionId ? data.factions.getAny(factionId) : undefined;
  return (faction?.raw.faction_rule_ids ?? [])
    .map((id) => byId(data.abilities, id, factionId))
    .filter((a) => a != null);
}

/**
 * The faction a roster unit's own records live under: the army's faction for
 * native units, the ally's faction for allied ones (an Imperial Agents Rhino in
 * a Grey Knights list). Weapon/ability ids are shared across factions with
 * different stats (`armoured-tracks` is A3 for Agents, A6 for Grey Knights), so
 * resolving an ally's gear with the army faction picks up the wrong profile.
 */
export function unitFactionId(
  data: Data40k,
  unitId: string | null | undefined,
  armyFactionId: string | null | undefined,
): string | null {
  if (!unitId) return armyFactionId ?? null;
  if (armyFactionId && data.units.getInFaction(unitId, armyFactionId))
    return armyFactionId;
  return data.units.getAny(unitId)?.raw.faction_id ?? armyFactionId ?? null;
}
