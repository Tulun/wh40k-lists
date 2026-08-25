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

  const detachments = roster.detachments.flatMap((d) =>
    splitDetachment(d, data, roster.faction_id),
  );

  return { roster: { ...roster, units, detachments }, roleHints, attachmentSeeds };
}
