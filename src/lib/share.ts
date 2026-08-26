/**
 * Copy-friendly list export for Facebook/Discord: the WTC-compact tournament
 * format the package ships — header block (name, faction, detachments, points,
 * warlord, enhancements), then one line per unit with points and wargear.
 */
import type { SavedList } from "../store/schema";
import type { Data40k } from "./data";

export function shareText(data: Data40k, list: SavedList): string {
  const roster = structuredClone(list.roster);
  roster.name = list.name;
  // The serializer reports the roster's own totals; after in-app edits only
  // total_computed is current.
  roster.points = { ...roster.points, total_reported: roster.points.total_computed };
  return data.exportRoster(roster, "newrecruit-wtc-compact");
}
