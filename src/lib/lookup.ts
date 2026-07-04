/**
 * Faction-aware id lookup. Plain `collection.get(id)` throws on ids that exist
 * under multiple factions (shared-chassis units, Space Marine chapter
 * detachments, common ability ids), so always prefer the roster's faction and
 * fall back to first-wins.
 */
import type { Collection } from "@alpaca-software/40kdc-data";

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
