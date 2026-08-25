/**
 * Character attachments: which roster unit a character is leading. Two
 * sources, merged: seeds inferred by the importer (`unit.leader_attachment`)
 * and the user's explicit picks stored on the saved list (which win).
 */
import type { Roster } from "@alpaca-software/40kdc-data";
import type { SavedList } from "../store/schema";

/** leader roster index → bodyguard roster index */
export function effectiveAttachments(list: SavedList): Map<number, number> {
  const map = new Map<number, number>();
  seedFromImport(list.roster, map);
  for (const [leader, bodyguard] of Object.entries(list.attachments)) {
    map.set(Number(leader), bodyguard);
  }
  return map;
}

function seedFromImport(roster: Roster, map: Map<number, number>) {
  const taken = new Set<number>();
  roster.units.forEach((unit, leaderIndex) => {
    const att = unit.leader_attachment;
    if (!att?.bodyguard_ref.id) return;
    // First matching squad not already claimed by another character.
    const bodyguardIndex = roster.units.findIndex(
      (u, i) => i !== leaderIndex && u.ref.id === att.bodyguard_ref.id && !taken.has(i),
    );
    if (bodyguardIndex === -1) return;
    taken.add(bodyguardIndex);
    map.set(leaderIndex, bodyguardIndex);
  });
}

/** Leader roster indices attached to any of the given bodyguard roster indices. */
export function leadersAttachedTo(
  list: SavedList,
  bodyguardIndices: readonly number[],
): Map<number, number> {
  const wanted = new Set(bodyguardIndices);
  const out = new Map<number, number>();
  for (const [leader, bodyguard] of effectiveAttachments(list)) {
    if (wanted.has(bodyguard)) out.set(leader, bodyguard);
  }
  return out;
}
