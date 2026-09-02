/**
 * The one army layout both the Glance screen and the share export render:
 * attached bricks (character + led unit) first in their own section, then
 * loose units in role sections — characters, battleline, and so on.
 */
import type { Roster } from "@alpaca-software/40kdc-data";
import type { SavedList } from "../store/schema";
import type { Data40k } from "./data";
import { battlelineGrants } from "./list-edit";
import { byId } from "./lookup";

export interface ArmyBlock {
  /** Roster indices in render order: leaders first, the led unit last. */
  indices: number[];
  /** True for a character + bodyguard pairing. */
  attached: boolean;
}

export interface ArmySection {
  label: string;
  blocks: ArmyBlock[];
}

const SECTION_LABELS = [
  "Attached units",
  "Characters",
  "Battleline",
  "Other units",
  "Dedicated transports",
  "Fortifications",
  "Allied units",
] as const;

const ROLE_RANK: Record<string, number> = {
  "epic-hero": 1,
  character: 1,
  battleline: 2,
  "dedicated-transport": 4,
  fortification: 5,
  allied: 6,
};

/** Sections in display order; empty sections are dropped. */
export function organizeArmy(data: Data40k | null, list: SavedList): ArmySection[] {
  const roster: Roster = list.roster;
  const attachments = list.attachments ?? {};

  const bodyguardOf = new Map<number, number>();
  const leadersOf = new Map<number, number[]>();
  for (const [l, b] of Object.entries(attachments)) {
    const li = Number(l);
    if (!roster.units[li] || !roster.units[b]) continue;
    bodyguardOf.set(li, b);
    if (!leadersOf.has(b)) leadersOf.set(b, []);
    leadersOf.get(b)!.push(li);
  }
  for (const leaders of leadersOf.values()) leaders.sort((a, b) => a - b);

  // Detachment-granted Battleline (Kult of Speed's Warbikers…) sorts as such.
  const granted = data ? battlelineGrants(data, roster) : new Set<string>();
  const rankAt = (i: number) => {
    const id = roster.units[i].ref.id;
    if (id && granted.has(id)) return ROLE_RANK.battleline;
    const role = id && data ? byId(data.units, id, roster.faction_id)?.raw.role : undefined;
    return ROLE_RANK[role ?? ""] ?? 3;
  };

  const sections: ArmySection[] = SECTION_LABELS.map((label) => ({ label, blocks: [] }));
  roster.units.forEach((_, i) => {
    if (leadersOf.has(i)) return; // a led unit rides in its leaders' block
    const b = bodyguardOf.get(i);
    if (b != null) {
      if (leadersOf.get(b)![0] !== i) return; // co-leaders ride with the first
      sections[0].blocks.push({ indices: [...leadersOf.get(b)!, b], attached: true });
    } else {
      sections[rankAt(i)].blocks.push({ indices: [i], attached: false });
    }
  });

  const nameAt = (i: number) => roster.units[i].ref.raw_name;
  for (const s of sections) {
    s.blocks.sort((x, y) => nameAt(x.indices[0]).localeCompare(nameAt(y.indices[0])));
  }
  return sections.filter((s) => s.blocks.length > 0);
}
