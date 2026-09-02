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
  const faction = factionId ? data.factions.getAny(factionId) : undefined;
  return byId(data.abilities, faction?.raw.faction_rule_id, factionId);
}
