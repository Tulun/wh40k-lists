/**
 * In-app list editing: pure mutations over a saved list's roster plus the two
 * index-keyed side tables (role hints, attachments) that must shift when unit
 * indexes do. Every operation returns fresh objects — callers hand the result
 * to the lists store, which stamps the sync token.
 *
 * Pricing and loadout maths come from the dataset package (`hostUnitPoints`,
 * `baseLoadout`, `weaponBounds`, …), reached through the lazily-loaded module
 * so this file imports types only.
 *
 * Repricing rule: only units whose datasheet id the edit touched are repriced
 * (an edit to one Boyz squad reprices every Boyz squad, because 11e ordinal
 * bands shift when copies come and go). Units the dataset cannot price
 * (`hostUnitPoints` → 0, e.g. provisional codex entries with unknown costs)
 * keep their stored points.
 */
import type {
  ResolvedRef,
  Roster,
  RosterUnit,
  RosterWargear,
  Unit,
  WargearOption,
} from "@alpaca-software/40kdc-data";
import type { Data40k } from "./data";
import type { RoleHints } from "./normalize";
import { byId } from "./lookup";

type LoadoutModels = Parameters<Data40k["baseLoadout"]>[3];
type RosterLoadoutGroups = RosterUnit["loadout_groups"];

/** The three co-edited pieces of a saved list. */
export interface ListContent {
  roster: Roster;
  roleHints: RoleHints;
  attachments: Record<string, number>;
}

function mkRef(id: string, name: string): ResolvedRef {
  return { id, raw_name: name, resolved: true, candidates: [] };
}

function unitEntity(data: Data40k, ref: ResolvedRef, factionId: string | null): Unit | undefined {
  return byId(data.units, ref.id, factionId)?.raw;
}

/** Wargear options + composition models for a unit, as the loadout maths wants them. */
function loadoutCtx(data: Data40k, unit: Unit): { options: WargearOption[]; models: LoadoutModels } {
  const options = data.dataset.wargearOptionsOf(unit);
  const models = data.dataset.unitCompositionOf(unit)?.models;
  return { options, models };
}

/**
 * True when the dataset has no loadout knowledge for this unit — no authored
 * wargear options AND no unit composition (typical of codex-overlay entries).
 * The loadout maths then degenerates to "every weapon is base, carried by every
 * model", which is nonsense; callers fall back to free-form wargear editing.
 */
export function loadoutDataMissing(data: Data40k, unit: Unit): boolean {
  return (
    data.dataset.wargearOptionsOf(unit).length === 0 &&
    data.dataset.unitCompositionOf(unit) === undefined
  );
}

/** Resolved weapon/wargear counts on a roster unit (unresolved entries excluded). */
export function wargearCounts(unit: RosterUnit): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of unit.wargear) {
    if (item.ref.id) counts.set(item.ref.id, (counts.get(item.ref.id) ?? 0) + item.count);
  }
  return counts;
}

function itemName(data: Data40k, id: string, factionId: string | null): string {
  return (
    byId(data.weapons, id, factionId)?.name ?? byId(data.wargear, id, factionId)?.name ?? id
  );
}

/**
 * Rebuild a unit's wargear list from an id→count map, preserving the unit's
 * unresolved (text-only) entries verbatim — the maths can't reason about them,
 * and dropping them would lose what the user's source said.
 */
function wargearFromCounts(
  data: Data40k,
  counts: Map<string, number>,
  factionId: string | null,
  prior: RosterWargear[],
): RosterWargear[] {
  const unresolved = prior.filter((w) => !w.ref.id);
  const rows: RosterWargear[] = [];
  for (const [id, count] of counts) {
    if (count <= 0) continue;
    const priorRef = prior.find((w) => w.ref.id === id)?.ref;
    rows.push({ ref: priorRef ?? mkRef(id, itemName(data, id, factionId)), count });
  }
  return [...rows, ...unresolved];
}

/** Recompute `loadout_groups` for display; undefined when the bag doesn't decompose. */
function regenGroups(
  data: Data40k,
  unit: Unit,
  modelCount: number,
  options: WargearOption[],
  models: LoadoutModels,
  counts: Map<string, number>,
  factionId: string | null,
): RosterLoadoutGroups {
  const groups = data.groupLoadout(unit, modelCount, options, models, counts);
  if (!groups) return undefined;
  return groups.map((g) => ({
    model_name: g.model_name,
    count: g.count,
    wargear: g.weapons.map((w) => ({
      ref: mkRef(w.id, itemName(data, w.id, factionId)),
      count: w.count,
    })),
  }));
}

function repriceUnits(data: Data40k, roster: Roster, touchedIds: ReadonlySet<string>): void {
  const faction = roster.faction_id ? byId(data.factions, roster.faction_id)?.raw : null;
  const ordinals = new Map<string, number>();
  roster.units = roster.units.map((u) => {
    const id = u.ref.id;
    if (!id) return u;
    const ordinal = (ordinals.get(id) ?? 0) + 1;
    ordinals.set(id, ordinal);
    if (!touchedIds.has(id)) return u;
    const unit = unitEntity(data, u.ref, roster.faction_id);
    if (!unit) return u;
    const computed =
      data.hostUnitPoints(unit, u.model_count, ordinal, faction ?? null) +
      data.wargearPoints(unit, wargearCounts(u));
    const next: RosterUnit = { ...u, points: computed > 0 ? computed : u.points };
    if (u.enhancement?.id) {
      const enh = byId(data.enhancements, u.enhancement.id, roster.faction_id);
      if (enh) next.enhancement_points = enh.cost;
    }
    return next;
  });
}

function recomputeTotal(roster: Roster): void {
  roster.points = {
    ...roster.points,
    total_computed: roster.units.reduce(
      (sum, u) => sum + (u.points ?? 0) + (u.enhancement_points ?? 0),
      0,
    ),
  };
}

function clone(content: ListContent): ListContent {
  return structuredClone(content);
}

function finalize(data: Data40k, content: ListContent, touchedIds: Iterable<string | null>): ListContent {
  const ids = new Set([...touchedIds].filter((id): id is string => id != null));
  if (ids.size > 0) repriceUnits(data, content.roster, ids);
  recomputeTotal(content.roster);
  return content;
}

/**
 * Remap both index-keyed tables through `mapIndex` (null = the entry's unit is
 * gone). An attachment survives only when both ends do.
 */
function remapIndexes(content: ListContent, mapIndex: (i: number) => number | null): void {
  const roleHints: RoleHints = {};
  for (const [k, v] of Object.entries(content.roleHints)) {
    const ni = mapIndex(Number(k));
    if (ni != null) roleHints[String(ni)] = v;
  }
  const attachments: Record<string, number> = {};
  for (const [k, v] of Object.entries(content.attachments)) {
    const nl = mapIndex(Number(k));
    const nb = mapIndex(v);
    if (nl != null && nb != null) attachments[String(nl)] = nb;
  }
  content.roleHints = roleHints;
  content.attachments = attachments;
}

export function removeUnit(data: Data40k, content: ListContent, index: number): ListContent {
  const next = clone(content);
  const [removed] = next.roster.units.splice(index, 1);
  remapIndexes(next, (i) => (i === index ? null : i > index ? i - 1 : i));
  return finalize(data, next, [removed?.ref.id ?? null]);
}

/** Insert a copy right after the original. Enhancements and warlord don't copy. */
export function duplicateUnit(data: Data40k, content: ListContent, index: number): ListContent {
  const next = clone(content);
  const copy = structuredClone(next.roster.units[index]);
  copy.enhancement = null;
  copy.enhancement_points = null;
  copy.is_warlord = false;
  next.roster.units.splice(index + 1, 0, copy);
  remapIndexes(next, (i) => (i > index ? i + 1 : i));
  return finalize(data, next, [copy.ref.id]);
}

/** The inclusive buildable size range from the unit's points tiers. */
export function sizeRange(unit: Unit): { min: number; max: number } | null {
  const tiers = unit.points ?? [];
  if (tiers.length === 0) return null;
  return {
    min: Math.min(...tiers.map((t) => t.models)),
    max: Math.max(...tiers.map((t) => t.models_max ?? t.models)),
  };
}

/** The next valid model count from `current` in direction `dir`, or null at the edge. */
export function nextSize(data: Data40k, unit: Unit, current: number, dir: 1 | -1): number | null {
  const range = sizeRange(unit);
  if (!range) return null;
  for (let n = current + dir; n >= range.min && n <= range.max; n += dir) {
    if (!data.pointsTierMissing(unit, n)) return n;
  }
  return null;
}

/**
 * Change a unit's model count. Existing weapon counts are clamped into the new
 * size's valid ranges — base weapons scale with the squad, optional swaps are
 * kept where the new size still allows them.
 */
export function setModelCount(
  data: Data40k,
  content: ListContent,
  index: number,
  count: number,
): ListContent {
  const next = clone(content);
  const u = next.roster.units[index];
  u.model_count = count;
  const unit = unitEntity(data, u.ref, next.roster.faction_id);
  if (unit && !loadoutDataMissing(data, unit)) {
    const { options, models } = loadoutCtx(data, unit);
    const bounds = data.weaponBounds(unit, count, options, models);
    const base = data.baseLoadout(unit, count, options, models).counts;
    const current = wargearCounts(u);
    const counts = new Map<string, number>();
    for (const id of new Set([...bounds.keys(), ...current.keys()])) {
      const wanted = current.get(id) ?? base.get(id) ?? 0;
      counts.set(id, bounds.has(id) ? data.clampWeaponCount(bounds, id, wanted) : wanted);
    }
    u.wargear = wargearFromCounts(data, counts, next.roster.faction_id, u.wargear);
    u.loadout_groups = regenGroups(
      data, unit, count, options, models, wargearCounts(u), next.roster.faction_id,
    );
  }
  return finalize(data, next, [u.ref.id]);
}

/** Set one weapon's count (clamped into its valid range) on a resolved unit. */
export function setWeaponCount(
  data: Data40k,
  content: ListContent,
  index: number,
  weaponId: string,
  requested: number,
): ListContent {
  const next = clone(content);
  const u = next.roster.units[index];
  const unit = unitEntity(data, u.ref, next.roster.faction_id);
  if (!unit) return content;
  const counts = wargearCounts(u);
  if (loadoutDataMissing(data, unit)) {
    // No authored options/composition — free-form editing, capped by squad size.
    counts.set(weaponId, Math.max(0, Math.min(u.model_count, requested)));
    u.wargear = wargearFromCounts(data, counts, next.roster.faction_id, u.wargear);
    u.loadout_groups = undefined;
    return finalize(data, next, [u.ref.id]);
  }
  const { options, models } = loadoutCtx(data, unit);
  const bounds = data.weaponBounds(unit, u.model_count, options, models);
  counts.set(weaponId, data.clampWeaponCount(bounds, weaponId, requested));
  u.wargear = wargearFromCounts(data, counts, next.roster.faction_id, u.wargear);
  u.loadout_groups = regenGroups(
    data, unit, u.model_count, options, models, wargearCounts(u), next.roster.faction_id,
  );
  return finalize(data, next, [u.ref.id]);
}

/** One wargear option with its current take-count per branch, for the editor UI. */
export interface WargearOptionState {
  option: WargearOption;
  /** Alternatives: the weapon ids each branch adds, and how many times it's taken. */
  branches: { ids: string[]; applied: number }[];
  /** Max total takes across branches at the unit's current size. */
  cap: number;
  totalApplied: number;
}

function optionBranches(option: WargearOption): string[][] {
  return (option.replacement_choice ?? (option.replacement ? [option.replacement] : [])).map(
    (b) => [...b],
  );
}

/**
 * The unit's authored wargear options with how often each is currently taken —
 * inferred from the loadout as the smallest count among a branch's added ids.
 */
export function wargearOptionStates(
  data: Data40k,
  rosterUnit: RosterUnit,
  unit: Unit,
): WargearOptionState[] {
  const { options, models } = loadoutCtx(data, unit);
  const counts = wargearCounts(rosterUnit);
  return options.map((option) => {
    const branches = optionBranches(option).map((ids) => ({
      ids,
      applied: ids.length > 0 ? Math.min(...ids.map((id) => counts.get(id) ?? 0)) : 0,
    }));
    return {
      option,
      branches,
      cap: data.optionCap(option, rosterUnit.model_count, models),
      totalApplied: branches.reduce((s, b) => s + b.applied, 0),
    };
  });
}

/**
 * Take (or give back) one wargear option: the swap moves counts BOTH ways —
 * taking it removes the replaced weapons and adds the branch's, un-taking
 * reverses that. Refused (returns `content` unchanged) when the swap has
 * nothing left to exchange.
 */
export function applyWargearOption(
  data: Data40k,
  content: ListContent,
  index: number,
  optionId: string,
  branchIndex: number,
  delta: 1 | -1,
): ListContent {
  const next = clone(content);
  const u = next.roster.units[index];
  const unit = unitEntity(data, u.ref, next.roster.faction_id);
  if (!unit) return content;
  const { options, models } = loadoutCtx(data, unit);
  const option = options.find((o) => o.id === optionId);
  const branch = option ? optionBranches(option)[branchIndex] : undefined;
  if (!option || !branch) return content;
  const counts = wargearCounts(u);
  const removed = delta === 1 ? (option.replaces ?? []) : branch;
  const added = delta === 1 ? branch : (option.replaces ?? []);
  for (const id of removed) {
    if ((counts.get(id) ?? 0) <= 0) return content;
  }
  for (const id of removed) counts.set(id, (counts.get(id) ?? 0) - 1);
  for (const id of added) counts.set(id, (counts.get(id) ?? 0) + 1);
  u.wargear = wargearFromCounts(data, counts, next.roster.faction_id, u.wargear);
  u.loadout_groups = regenGroups(
    data, unit, u.model_count, options, models, wargearCounts(u), next.roster.faction_id,
  );
  return finalize(data, next, [u.ref.id]);
}

export function setEnhancement(
  data: Data40k,
  content: ListContent,
  index: number,
  enhancementId: string | null,
): ListContent {
  const next = clone(content);
  const u = next.roster.units[index];
  if (!enhancementId) {
    u.enhancement = null;
    u.enhancement_points = null;
  } else {
    const enh = byId(data.enhancements, enhancementId, next.roster.faction_id);
    if (!enh) return content;
    u.enhancement = mkRef(enh.id, enh.name);
    u.enhancement_points = enh.cost;
  }
  // Reprice the base cost too: source lists sometimes roll an upgrade's cost
  // into the printed unit cost, and the dataset price is the ground truth here.
  return finalize(data, next, [u.ref.id]);
}

/** Make `index` the warlord (or clear it); a roster has at most one. */
export function setWarlord(content: ListContent, index: number, on: boolean): ListContent {
  const next = clone(content);
  next.roster.units = next.roster.units.map((u, i) => ({
    ...u,
    is_warlord: on && i === index,
  }));
  return next;
}

/** Manual points override for units the dataset can't price (unmatched or cost-unknown). */
export function setUnitPoints(content: ListContent, index: number, points: number | null): ListContent {
  const next = clone(content);
  next.roster.units[index].points = points;
  recomputeTotal(next.roster);
  return next;
}

/** Manual model count for unmatched units (no tiers to step through). */
export function setRawModelCount(content: ListContent, index: number, count: number): ListContent {
  const next = clone(content);
  next.roster.units[index].model_count = Math.max(1, count);
  return next;
}

/** Append a fresh unit at its minimum size with the out-of-the-box loadout. */
export function addUnit(data: Data40k, content: ListContent, unitId: string): ListContent {
  const next = clone(content);
  const view = byId(data.units, unitId, next.roster.faction_id);
  if (!view) return content;
  const unit = view.raw;
  const range = sizeRange(unit);
  const compMin = data.dataset
    .unitCompositionOf(unit)
    ?.models.reduce((sum, m) => sum + m.min, 0);
  const count = range?.min ?? compMin ?? unit.model_count?.min ?? 1;
  const { options, models } = loadoutCtx(data, unit);
  // Without loadout data the "base loadout" would be every weapon on every
  // model; seed one of each instead and let the user adjust freely.
  const counts = loadoutDataMissing(data, unit)
    ? new Map((unit.weapon_ids ?? []).map((id) => [id, 1]))
    : data.baseLoadout(unit, count, options, models).counts;
  const wargear = wargearFromCounts(data, counts, next.roster.faction_id, []);
  const entry: RosterUnit = {
    ref: mkRef(unit.id, unit.name),
    model_count: count,
    points: null,
    is_warlord: false,
    enhancement: null,
    enhancement_points: null,
    wargear,
    leader_attachment: null,
  };
  const groups = regenGroups(data, unit, count, options, models, counts, next.roster.faction_id);
  if (groups) entry.loadout_groups = groups;
  next.roster.units.push(entry);
  return finalize(data, next, [unit.id]);
}

export function addDetachment(data: Data40k, content: ListContent, id: string): ListContent {
  const next = clone(content);
  const det = byId(data.detachments, id, next.roster.faction_id);
  next.roster.detachments.push({
    ref: mkRef(id, det?.name ?? id),
    dp_cost: det?.detachment_points ?? null,
  });
  return next;
}

/**
 * Drop a detachment and strip every enhancement that belonged to it — an
 * enhancement from a detachment the list no longer runs isn't a choice at all.
 */
export function removeDetachment(data: Data40k, content: ListContent, index: number): ListContent {
  const next = clone(content);
  next.roster.detachments.splice(index, 1);
  const remaining = new Set(next.roster.detachments.map((d) => d.ref.id).filter(Boolean));
  const touched: (string | null)[] = [];
  for (const u of next.roster.units) {
    if (!u.enhancement?.id) continue;
    const enh = byId(data.enhancements, u.enhancement.id, next.roster.faction_id);
    if (enh && !remaining.has(enh.detachment_id)) {
      u.enhancement = null;
      u.enhancement_points = null;
      touched.push(u.ref.id);
    }
  }
  return finalize(data, next, touched);
}

export function setForceDisposition(content: ListContent, id: string | null): ListContent {
  const next = clone(content);
  next.roster.force_disposition = id;
  return next;
}

export interface EnhancementChoice {
  id: string;
  name: string;
  cost: number;
  /** Index of another roster unit already carrying it (an army takes each once). */
  takenBy: number | null;
  /** Restriction keywords the unit lacks — offered disabled, with the reason. */
  missing: string[];
}

/**
 * Enhancements available to the unit at `index` from the roster's detachments.
 * Regular enhancements go to characters (not epic heroes); `upgrade_tag`
 * enhancements go to non-character units instead. The unit's own NAME counts
 * as a keyword — restrictions routinely name the datasheet ("Deffkilla
 * Wartrike"). Near-misses are returned with `missing` set so the UI can say
 * which keyword the unit lacks instead of silently hiding the row.
 */
export function enhancementChoices(
  data: Data40k,
  roster: Roster,
  index: number,
): EnhancementChoice[] {
  const factionId = roster.faction_id;
  if (!factionId) return [];
  const unit = unitEntity(data, roster.units[index].ref, factionId);
  if (!unit) return [];
  const characterish = unit.role === "character" || unit.role === "epic-hero";
  const keywords = new Set(
    [unit.name, ...(unit.keywords ?? []), ...(unit.faction_keywords ?? [])].map((k) =>
      k.toLowerCase(),
    ),
  );
  const detIds = new Set(roster.detachments.map((d) => d.ref.id).filter(Boolean));
  // Enhancement records carry no faction_id, so byFaction() finds nothing —
  // walk the full collection by detachment_id (the detachment scopes the faction).
  return data.enhancements.all
    .filter((e) => detIds.has(e.detachment_id))
    .filter((e) => (e.upgrade_tag ? !characterish : unit.role === "character"))
    .filter((e) => !(e.exclusion_keywords ?? []).some((k) => keywords.has(k.toLowerCase())))
    .map((e) => {
      const takenBy = roster.units.findIndex(
        (u, i) => i !== index && u.enhancement?.id === e.id,
      );
      const missing = (e.keyword_restrictions ?? []).filter(
        (k) => !keywords.has(k.toLowerCase()),
      );
      return {
        id: e.id,
        name: e.name,
        cost: e.cost,
        takenBy: takenBy === -1 ? null : takenBy,
        missing,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
