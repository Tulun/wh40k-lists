/**
 * Post-import cleanup over what the 40kdc importer leaves unresolved:
 *
 * - Attachment marker lines ("Leader (Character)", "Bodyguard ()",
 *   "Support (…)") are annotations some exports emit as wargear. They are
 *   stripped from the unit's wargear and kept as per-unit role hints.
 * - Non-weapon wargear (ammo runts, grots…) lives in the dataset's `wargear`
 *   collection, which the importer intentionally doesn't search. Resolve
 *   exact-name matches so they stop showing up as unrecognized weapons.
 * - 11e dual-detachment headers ("Freebooter Krew and More Dakka! (3
 *   Detachment Points)") arrive as one unresolved detachment ref. Strip the
 *   points suffix and split on "and"/"&"/"+", resolving each part.
 */
import type { ResolvedRef, Roster } from "@alpaca-software/40kdc-data";
import type { Data40k } from "./data";

type RosterDetachment = Roster["detachments"][number];

export type RoleHint = "leader" | "bodyguard" | "support";
/** Keyed by roster unit index (stringified for JSON round-tripping). */
export type RoleHints = Record<string, RoleHint>;

const MARKER = /^(leader|bodyguard|support)\s*(?:\((.*)\))?$/i;
const DP_SUFFIX = /\s*\(\s*\d+\s*detachment\s*points?\s*\)\s*$/i;
const DETACHMENT_JOINER = /\s+(?:and|&|\+)\s+/i;
/** Parenthetical contents that name a role category rather than a partner unit. */
const GENERIC_PARTNER = /^(character|epic hero)?$/i;

export function attachmentMarker(
  rawName: string,
): { role: RoleHint; partner: string | null } | null {
  const m = MARKER.exec(rawName.trim());
  if (!m) return null;
  const inner = (m[2] ?? "").trim();
  return {
    role: m[1].toLowerCase() as RoleHint,
    partner: GENERIC_PARTNER.test(inner) ? null : inner,
  };
}

function resolveByExactName<V extends { id: string; name: string }>(
  candidates: V[],
  rawName: string,
  normalizeName: (s: string) => string,
): V | undefined {
  const target = normalizeName(rawName);
  return candidates.find((c) => normalizeName(c.name) === target);
}

function splitDetachment(
  det: RosterDetachment,
  data: Data40k,
  factionId: string | null,
): RosterDetachment[] {
  if (det.ref.resolved) return [det];
  const cleaned = det.ref.raw_name.replace(DP_SUFFIX, "").trim();
  const inFaction = factionId ? data.detachments.byFaction(factionId) : data.detachments.all;

  const whole = resolveByExactName(inFaction, cleaned, data.normalizeName);
  if (whole) {
    return [
      {
        dp_cost: whole.detachment_points ?? det.dp_cost,
        ref: { id: whole.id, raw_name: det.ref.raw_name, resolved: true, candidates: [] },
      },
    ];
  }

  const parts = cleaned.split(DETACHMENT_JOINER).map((p) => p.trim());
  if (parts.length < 2) return [det];
  const resolved = parts.map((p) => resolveByExactName(inFaction, p, data.normalizeName));
  if (resolved.some((r) => !r)) return [det]; // only split when every part matches
  return resolved.map((entity, i) => ({
    dp_cost: entity!.detachment_points ?? null,
    ref: { id: entity!.id, raw_name: parts[i], resolved: true, candidates: [] },
  }));
}

function resolveWargearRef(ref: ResolvedRef, data: Data40k, factionId: string | null): ResolvedRef {
  if (ref.resolved) return ref;
  const pool = factionId
    ? [...data.wargear.byFaction(factionId), ...data.wargear.all]
    : data.wargear.all;
  const match = resolveByExactName(pool, ref.raw_name, data.normalizeName);
  if (!match) return ref;
  return { ...ref, id: match.id, resolved: true, candidates: [] };
}

export interface NormalizedImport {
  roster: Roster;
  roleHints: RoleHints;
  /** leader roster index → bodyguard roster index, when the marker named its partner. */
  attachmentSeeds: Record<string, number>;
}

export function normalizeImportedRoster(roster: Roster, data: Data40k): NormalizedImport {
  const roleHints: RoleHints = {};
  const attachmentSeeds: Record<string, number> = {};
  const partnerByIndex: { index: number; role: RoleHint; partner: string }[] = [];

  const units = roster.units.map((unit, index) => {
    const wargear: typeof unit.wargear = [];
    for (const item of unit.wargear) {
      const marker = !item.ref.resolved && attachmentMarker(item.ref.raw_name);
      if (marker) {
        roleHints[String(index)] = marker.role;
        if (marker.partner) partnerByIndex.push({ index, role: marker.role, partner: marker.partner });
        continue;
      }
      wargear.push({ ...item, ref: resolveWargearRef(item.ref, data, roster.faction_id) });
    }
    return { ...unit, wargear };
  });

  // Markers that named their partner unit ("Leader (Beast Snagga Boyz)")
  // become attachment seeds so the user doesn't have to declare them again.
  const findUnit = (name: string, excludeIndex: number) =>
    roster.units.findIndex(
      (u, i) =>
        i !== excludeIndex && data.normalizeName(u.ref.raw_name) === data.normalizeName(name),
    );
  for (const { index, role, partner } of partnerByIndex) {
    const partnerIndex = findUnit(partner, index);
    if (partnerIndex === -1) continue;
    if (role === "bodyguard") attachmentSeeds[String(partnerIndex)] = index;
    else attachmentSeeds[String(index)] = partnerIndex;
  }

  inferAttachments(roster, roleHints, attachmentSeeds, data);

  const detachments = roster.detachments.flatMap((d) =>
    splitDetachment(d, data, roster.faction_id),
  );

  return { roster: { ...roster, units, detachments }, roleHints, attachmentSeeds };
}

/**
 * Attachments are declared at list build, so a fed list implies them even when
 * the markers are anonymous ("Leader (Character)" / "Bodyguard ()"). Match
 * leader-marked characters to bodyguard-marked units using the dataset's
 * leader-eligibility links, pairing whenever a pairing is forced: a bodyguard
 * with exactly one eligible leader, or a leader with exactly one eligible
 * bodyguard. Repeats until nothing new is forced; genuine ambiguities stay
 * unmatched for the picker.
 */
function inferAttachments(
  roster: Roster,
  roleHints: RoleHints,
  seeds: Record<string, number>,
  data: Data40k,
): void {
  const claimedBodyguards = new Set(Object.values(seeds));
  const leaders = roster.units
    .map((u, index) => ({ u, index }))
    .filter(({ index }) => {
      const hint = roleHints[String(index)];
      return (hint === "leader" || hint === "support") && seeds[String(index)] === undefined;
    })
    .map(({ u, index }) => ({
      index,
      eligible: u.ref.id
        ? new Set(data.dataset.bodyguardsAttachableFrom(u.ref.id).map((v) => v.id))
        : new Set<string>(),
    }));
  const bodyguards = roster.units
    .map((u, index) => ({ u, index }))
    .filter(
      ({ index }) => roleHints[String(index)] === "bodyguard" && !claimedBodyguards.has(index),
    );

  const canLead = (l: (typeof leaders)[number], bIndex: number) => {
    const id = roster.units[bIndex].ref.id;
    return id != null && l.eligible.has(id);
  };

  let changed = true;
  while (changed) {
    changed = false;
    const openLeaders = leaders.filter((l) => seeds[String(l.index)] === undefined);
    const openBodyguards = bodyguards.filter(({ index }) => !claimedBodyguards.has(index));

    // Collect this round's forced proposals from both sides, then apply only
    // the conflict-free ones — two squads both needing the same character
    // means the input is ambiguous, not that the first one wins.
    const proposals: { leader: number; bodyguard: number }[] = [];
    for (const b of openBodyguards) {
      const options = openLeaders.filter((l) => canLead(l, b.index));
      if (options.length === 1) proposals.push({ leader: options[0].index, bodyguard: b.index });
    }
    for (const l of openLeaders) {
      const options = openBodyguards.filter((b) => canLead(l, b.index));
      if (options.length === 1) proposals.push({ leader: l.index, bodyguard: options[0].index });
    }

    const leaderUses = new Map<number, Set<number>>();
    const bodyguardUses = new Map<number, Set<number>>();
    for (const p of proposals) {
      (leaderUses.get(p.leader) ?? leaderUses.set(p.leader, new Set()).get(p.leader)!).add(
        p.bodyguard,
      );
      (
        bodyguardUses.get(p.bodyguard) ??
        bodyguardUses.set(p.bodyguard, new Set()).get(p.bodyguard)!
      ).add(p.leader);
    }
    for (const p of proposals) {
      if (leaderUses.get(p.leader)!.size !== 1 || bodyguardUses.get(p.bodyguard)!.size !== 1) {
        continue;
      }
      if (seeds[String(p.leader)] !== undefined || claimedBodyguards.has(p.bodyguard)) continue;
      seeds[String(p.leader)] = p.bodyguard;
      claimedBodyguards.add(p.bodyguard);
      changed = true;
    }
  }
}
