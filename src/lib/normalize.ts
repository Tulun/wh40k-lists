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

/** Bounded Levenshtein — enough to catch one-or-two-character name drift. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Match a raw weapon name against the unit's own weapon list, tolerating
 * small spelling drift between the export and the dataset ("Macro-scalpel"
 * vs the dataset's "maco-scalpel"). Only a unique match resolves.
 */
function fuzzyResolveUnitWeapon(
  ref: ResolvedRef,
  weaponNames: { id: string; name: string }[],
  normalizeName: (s: string) => string,
): ResolvedRef {
  const target = normalizeName(ref.raw_name);
  const tolerance = target.length >= 8 ? 2 : 1;
  const matches = weaponNames.filter(
    (w) => editDistance(normalizeName(w.name), target, tolerance) <= tolerance,
  );
  if (matches.length !== 1) return ref;
  return { ...ref, id: matches[0].id, resolved: true, candidates: [] };
}

const UNIT_HEADER = /^(.+?)\s*\((\d+)\s*(?:pts?|points)\)\s*$/i;
const ALL_CAPS_SECTION = /^[A-Z][A-Z\s&'’!-]+$/;

/**
 * GW-app exports mark declared attachments by *grouping*: a header line
 * mentioning "attached", then the character's block, then the unit's block.
 * The 40kdc parser drops the header, so recover the pairing from the raw
 * pasted text. Returns groups of unit-header names in source order.
 */
export function extractAttachedGroups(rawText: string): string[][] {
  const lines = rawText.split(/\r?\n/).map((l) => l.trim());
  const groups: string[][] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isGroupHeader =
      /\battached\b/i.test(line) && !UNIT_HEADER.test(line) && !line.startsWith("•");
    if (!isGroupHeader) continue;
    const names: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j];
      if (!l) continue;
      // Wargear/marker bullets ("• Attached as: Leader (Character)") never
      // end a group — only a new group header or section does.
      if (l.startsWith("•") || l.startsWith("◦")) continue;
      if (/\battached\b/i.test(l) && !UNIT_HEADER.test(l)) break;
      if (ALL_CAPS_SECTION.test(l) && !UNIT_HEADER.test(l)) break;
      const m = UNIT_HEADER.exec(l);
      if (m) names.push(m[1].trim());
    }
    if (names.length >= 2) groups.push(names);
  }
  return groups;
}

const GROUP_BULLET = /^•\s*(\d+)x\s+(.+?)\s*$/i;
const CHILD_BULLET = /^◦\s*(\d+)x\s+(.+?)\s*$/i;

interface RawLoadoutGroup {
  model_name: string;
  count: number;
  wargear: { name: string; count: number }[];
}

/**
 * The GW app nests per-model loadouts under `◦` children, which the upstream
 * parser doesn't treat as model groups — so `loadout_groups` (and with it the
 * "carried by the Nob" tags) get lost. Rebuild them from the raw text:
 * `• Nx Model` followed by `◦ Mx gear` children. Returned per unit-header
 * occurrence, in source order.
 */
export function extractLoadoutGroups(rawText: string): Map<string, RawLoadoutGroup[][]> {
  const byName = new Map<string, RawLoadoutGroup[][]>();
  let current: RawLoadoutGroup[] | null = null;
  let group: RawLoadoutGroup | null = null;
  for (const raw of rawText.split(/\r?\n/)) {
    const line = raw.trim();
    const header = UNIT_HEADER.exec(line);
    if (header && !line.startsWith("•") && !line.startsWith("◦")) {
      current = [];
      group = null;
      const name = header[1].trim();
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name)!.push(current);
      continue;
    }
    if (!current) continue;
    const top = GROUP_BULLET.exec(line);
    if (top) {
      group = { model_name: top[2], count: Number(top[1]), wargear: [] };
      current.push(group);
      continue;
    }
    const child = CHILD_BULLET.exec(line);
    if (child && group) {
      group.wargear.push({ name: child[2], count: Number(child[1]) });
    } else if (line && !line.startsWith("•") && !line.startsWith("◦")) {
      group = null; // non-bullet line ends the unit block's bullets
    }
  }
  // Only keep model groups that actually had children; bare `• Nx Thing`
  // lines are plain wargear, not models.
  for (const [name, occurrences] of byName) {
    byName.set(
      name,
      occurrences.map((groups) => groups.filter((g) => g.wargear.length > 0)),
    );
  }
  return byName;
}

export interface NormalizedImport {
  roster: Roster;
  roleHints: RoleHints;
  /** leader roster index → bodyguard roster index, when the marker named its partner. */
  attachmentSeeds: Record<string, number>;
}

export function normalizeImportedRoster(
  roster: Roster,
  data: Data40k,
  rawText?: string,
): NormalizedImport {
  const roleHints: RoleHints = {};
  const attachmentSeeds: Record<string, number> = {};
  const partnerByIndex: { index: number; role: RoleHint; partner: string }[] = [];

  const nn = data.normalizeName;
  const loadoutsByName = rawText ? extractLoadoutGroups(rawText) : new Map<string, RawLoadoutGroup[][]>();
  const occurrenceByName = new Map<string, number>();
  const units = roster.units.map((unit, index) => {
    const view = unit.ref.resolved
      ? data.resolveRosterUnit(unit, data.dataset, roster.faction_id)
      : undefined;
    // Model-group headers ("Klaivex", "Kabalite Warrior") sometimes arrive as
    // wargear lines; the unit's profile names and its own name identify them.
    const modelNames = new Set<string>();
    if (view) {
      modelNames.add(nn(view.name));
      modelNames.add(nn(view.name).replace(/e?s$/, ""));
      for (const p of view.raw.profiles) if (p.name) modelNames.add(nn(p.name));
      for (const model of data.dataset.unitCompositionOf(view.raw)?.models ?? []) {
        modelNames.add(nn(model.name));
      }
    }
    modelNames.add(nn(unit.ref.raw_name));
    modelNames.add(nn(unit.ref.raw_name).replace(/e?s$/, ""));
    const unitWeapons = view ? view.weapons.map((w) => ({ id: w.id, name: w.name })) : [];

    // Since 40kdc-data 1.2.x the importer parses "Attached as:" lines itself
    // into unit.leader_attachment. Adopt its role, but keep our own raw-text
    // group pairing for the seeds — the upstream bodyguard guess is
    // provisional and loses to the export's explicit group nesting.
    if (unit.leader_attachment?.role) {
      roleHints[String(index)] = unit.leader_attachment.role;
    }

    let isWarlord = unit.is_warlord;
    const wargear: typeof unit.wargear = [];
    for (const item of unit.wargear) {
      if (!item.ref.resolved) {
        const marker = attachmentMarker(item.ref.raw_name);
        if (marker) {
          roleHints[String(index)] = marker.role;
          if (marker.partner)
            partnerByIndex.push({ index, role: marker.role, partner: marker.partner });
          continue;
        }
        const raw = nn(item.ref.raw_name);
        if (raw === "warlord") {
          isWarlord = true;
          continue;
        }
        if (modelNames.has(raw) || modelNames.has(raw.replace(/e?s$/, ""))) continue;
        let ref = resolveWargearRef(item.ref, data, roster.faction_id);
        if (!ref.resolved) ref = fuzzyResolveUnitWeapon(ref, unitWeapons, nn);
        wargear.push({ ...item, ref });
        continue;
      }
      wargear.push(item);
    }

    // A datasheet can carry two weapon records with the same display name (a
    // ranged and a melee profile printed as separate lines — Nazdreg's Kustom
    // Blasta X). The importer resolves every such line to the same record and
    // double-counts it; spill the excess into the unclaimed same-name siblings.
    for (const item of [...wargear]) {
      if (!item.ref.id || item.count < 2) continue;
      const name = nn(item.ref.raw_name);
      const siblings = unitWeapons.filter(
        (w) =>
          w.id !== item.ref.id &&
          nn(w.name) === name &&
          !wargear.some((o) => o.ref.id === w.id),
      );
      for (const sib of siblings) {
        if (item.count < 2) break;
        item.count -= 1;
        wargear.push({
          ref: { id: sib.id, raw_name: sib.name, resolved: true, candidates: [] },
          count: 1,
        });
      }
    }

    // Rebuild per-model loadout groups from the raw text's ◦ nesting when the
    // parser didn't provide them (keeps "carried by the Nob" tags working).
    const occurrence = occurrenceByName.get(unit.ref.raw_name) ?? 0;
    occurrenceByName.set(unit.ref.raw_name, occurrence + 1);
    let loadoutGroups = unit.loadout_groups;
    if (!loadoutGroups?.length) {
      const rawGroups = loadoutsByName.get(unit.ref.raw_name)?.[occurrence];
      if (rawGroups?.length) {
        loadoutGroups = rawGroups.map((g) => ({
          model_name: g.model_name,
          count: g.count,
          wargear: g.wargear.map((w) => {
            const match = wargear.find((item) => nn(item.ref.raw_name) === nn(w.name));
            // ◦ counts are group totals; RosterLoadoutGroup counts are per model.
            const perModel = g.count > 0 && w.count % g.count === 0 ? w.count / g.count : w.count;
            return {
              ref: match?.ref ?? { id: null, raw_name: w.name, resolved: false, candidates: [] },
              count: perModel,
            };
          }),
        }));
      }
    }
    return { ...unit, is_warlord: isWarlord, wargear, loadout_groups: loadoutGroups };
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

  if (rawText) {
    seedFromAttachedGroups(rawText, roster, roleHints, attachmentSeeds, data);
  }
  inferAttachments(roster, roleHints, attachmentSeeds, data);

  const detachments = roster.detachments.flatMap((d) =>
    splitDetachment(d, data, roster.faction_id),
  );

  return { roster: { ...roster, units, detachments }, roleHints, attachmentSeeds };
}

/**
 * Turn "Attached unit" groupings from the raw export into attachment seeds.
 * Within a group, every leading character attaches to the first non-character
 * unit that follows it — the grouping is explicit, so no eligibility check.
 */
function seedFromAttachedGroups(
  rawText: string,
  roster: Roster,
  roleHints: RoleHints,
  seeds: Record<string, number>,
  data: Data40k,
): void {
  const groups = extractAttachedGroups(rawText);
  if (groups.length === 0) return;
  const nn = data.normalizeName;
  const claimed = new Set(Object.values(seeds));

  const isCharacter = (index: number) => {
    const unit = roster.units[index];
    const view = unit.ref.resolved
      ? data.resolveRosterUnit(unit, data.dataset, roster.faction_id)
      : undefined;
    return view ? view.raw.role === "character" || view.raw.role === "epic-hero" : false;
  };
  // Match group names to roster indices, consuming each index once so two
  // identical groups ("Bannernob + Boyz" twice) pair with distinct squads.
  const used = new Set<number>();
  const findIndex = (name: string) =>
    roster.units.findIndex(
      (u, i) => !used.has(i) && nn(u.ref.raw_name) === nn(name),
    );

  for (const names of groups) {
    const indices = names
      .map(findIndex)
      .filter((i) => i !== -1)
      .map((i) => (used.add(i), i));
    const bodyguardIndex = indices.find((i) => !isCharacter(i));
    if (bodyguardIndex === undefined) continue;
    roleHints[String(bodyguardIndex)] ??= "bodyguard";
    for (const index of indices) {
      if (index === bodyguardIndex || !isCharacter(index)) continue;
      if (seeds[String(index)] !== undefined) continue;
      seeds[String(index)] = bodyguardIndex;
      claimed.add(bodyguardIndex);
      roleHints[String(index)] ??= "leader";
    }
  }
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
