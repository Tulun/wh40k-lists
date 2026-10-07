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
  AlliedRule,
  ResolvedRef,
  Roster,
  RosterUnit,
  RosterWargear,
  Unit,
  WargearOption,
} from "@alpaca-software/40kdc-data";
import type { Data40k } from "./data";
import { BATTLELINE_GRANT_RE, LEADS_GRANT_RE } from "./codex-model";
import { abilityText } from "./describe";
import type { RoleHints } from "./normalize";
import { byId } from "./lookup";
import { hasSquadChoices, isSquadChoiceOption } from "./squad-weapons";
import { groupLoadoutSpread } from "./group-loadout";
import { completeRosterWargear } from "./wargear-modes";
import type { SavedList } from "../store/schema";

type LoadoutModels = Parameters<Data40k["baseLoadout"]>[3];
type RosterLoadoutGroups = RosterUnit["loadout_groups"];

/** The three co-edited pieces of a saved list. */
export interface ListContent {
  roster: Roster;
  roleHints: RoleHints;
  attachments: Record<string, number>;
}

/** An empty from-scratch list: the editor does the rest once a faction is picked. */
export function blankSavedList(pkgVersion: string): SavedList {
  return {
    id: crypto.randomUUID(),
    name: "New list",
    rawText: "",
    roster: {
      name: "New list",
      source: { format: "roster-json", generated_by: "40k-list-viewer" },
      faction_id: null,
      detachments: [],
      battle_size: "strike-force",
      force_disposition: null,
      units: [],
      points: {
        declared_limit: 2000,
        detachment_cap: 3,
        total_reported: null,
        total_computed: 0,
      },
      diagnostics: {
        resolved_units: 0,
        unresolved_units: 0,
        resolved_weapons: 0,
        unresolved_weapons: 0,
        warnings: [],
      },
      game_version: { edition: "11th", dataslate: "launch" },
    },
    overrides: {},
    notes: {},
    roleHints: {},
    attachments: {},
    importedAt: new Date().toISOString(),
    dataVersion: { edition: "11th", dataslate: "launch", pkg: pkgVersion },
  };
}

/**
 * Pick the army's faction — offered only while the roster is empty, so
 * switching also clears any detachments picked under the old faction.
 */
export function setFaction(content: ListContent, factionId: string): ListContent {
  const next = clone(content);
  next.roster.faction_id = factionId;
  next.roster.detachments = [];
  next.roster.force_disposition = null;
  return next;
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
  const groups = groupLoadoutSpread(unit, modelCount, options, models, counts);
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

/**
 * A roster unit's loadout groups for display: the stored decomposition when the
 * import (or a prior edit) recorded one, else recomputed from the flat wargear
 * bag. Undefined when the bag genuinely doesn't decompose — callers fall back
 * to unit-wide rendering.
 */
export function displayLoadoutGroups(
  data: Data40k,
  u: RosterUnit,
  factionId: string | null,
): RosterLoadoutGroups {
  if (u.loadout_groups && u.loadout_groups.length > 0) return u.loadout_groups;
  const unit = unitEntity(data, u.ref, factionId);
  if (!unit || loadoutDataMissing(data, unit)) return undefined;
  const { options, models } = loadoutCtx(data, unit);
  return regenGroups(data, unit, u.model_count, options, models, wargearCounts(u), factionId);
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
    // Only trust the computed price when a tier actually covers this size —
    // baseUnitPoints silently prices an uncovered count from the nearest tier.
    const covered = !data.pointsTierMissing(unit, u.model_count, ordinal);
    const next: RosterUnit = {
      ...u,
      points: covered && computed > 0 ? computed : u.points,
    };
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

/**
 * The next valid model count from `current` in direction `dir`, or null at the
 * edge. Steps between the tops of the points tiers (Paladins 4 → 5 → 8 → 10,
 * Strike Squads 5 → 10): a tier costs the same at every size it covers, so an
 * in-between size is just the bigger one with models missing.
 */
export function nextSize(data: Data40k, unit: Unit, current: number, dir: 1 | -1): number | null {
  const sizes = [...new Set((unit.points ?? []).map((t) => t.models_max ?? t.models))]
    .filter((n) => !data.pointsTierMissing(unit, n))
    .sort((a, b) => a - b);
  const next = dir > 0 ? sizes.find((n) => n > current) : [...sizes].reverse().find((n) => n < current);
  return next ?? null;
}

/**
 * Change a unit's model count. The wargear is rebuilt from the new size's base
 * loadout with the user's option choices re-applied (as often as before, capped
 * by the new size's limits and what's left to swap). Adjusting raw weapon
 * counts by the base-loadout delta instead is wrong when swapped models leave:
 * a swap consuming two base items (Meganobz' Power Klaw + Kustom Shoota → Twin
 * Killsaws) would keep its product while only part of its cost gets refunded,
 * leaving the bag unreachable by any sequence of swaps.
 */
export function setModelCount(
  data: Data40k,
  content: ListContent,
  index: number,
  count: number,
): ListContent {
  // Squad-wide weapon choices re-cover every model at the new size.
  return withSquadBase(data, content, index, (c) => setModelCountRaw(data, c, index, count));
}

function setModelCountRaw(
  data: Data40k,
  content: ListContent,
  index: number,
  count: number,
): ListContent {
  const next = clone(content);
  const u = next.roster.units[index];
  const oldCount = u.model_count;
  u.model_count = count;
  const unit = unitEntity(data, u.ref, next.roster.faction_id);
  if (unit && !loadoutDataMissing(data, unit)) {
    const { options, models } = loadoutCtx(data, unit);
    const applied = wargearOptionStates(data, { ...u, model_count: oldCount }, unit);
    const counts = new Map(data.baseLoadout(unit, count, options, models).counts);
    const optionItems = new Set(
      options.flatMap((o) => [...(o.replaces ?? []), ...optionBranches(o).flat()]),
    );
    for (const state of applied) {
      let room = data.optionCap(state.option, count, models);
      for (const branch of state.branches) {
        let take = Math.min(branch.applied, room);
        for (const id of state.option.replaces ?? []) {
          take = Math.min(take, counts.get(id) ?? 0);
        }
        if (take <= 0) continue;
        room -= take;
        for (const id of state.option.replaces ?? []) {
          counts.set(id, (counts.get(id) ?? 0) - take);
        }
        for (const id of branch.ids) counts.set(id, (counts.get(id) ?? 0) + take);
      }
    }
    // Items outside the option system (imported oddities) carry over verbatim.
    for (const [id, c] of wargearCounts(u)) {
      if (!counts.has(id) && !optionItems.has(id)) counts.set(id, c);
    }
    u.wargear = wargearFromCounts(data, counts, next.roster.faction_id, u.wargear);
    u.loadout_groups = regenGroups(
      data, unit, count, options, models, wargearCounts(u), next.roster.faction_id,
    );
  }
  return finalize(data, next, [u.ref.id]);
}

/**
 * Resolved gear on a roster unit that its datasheet can't carry at all — not
 * a listed weapon, not granted by any option, not a model default. Typically
 * a stale import match (a model-name line matched to a same-named weapon,
 * or gear the data has since dropped). Empty for free-form units.
 */
export function strayWargearIds(data: Data40k, rosterUnit: RosterUnit, unit: Unit): string[] {
  if (loadoutDataMissing(data, unit)) return [];
  const { options, models } = loadoutCtx(data, unit);
  const allowed = new Set<string>(unit.weapon_ids ?? []);
  for (const o of options) {
    for (const id of o.replaces ?? []) allowed.add(id);
    for (const b of optionBranches(o)) for (const id of b) allowed.add(id);
  }
  for (const m of models ?? []) for (const id of m.default_weapon_ids ?? []) allowed.add(id);
  return [...wargearCounts(rosterUnit).keys()].filter((id) => !allowed.has(id));
}

/** Drop one item from a unit's wargear outright (no bounds — for strays). */
export function removeWargear(
  data: Data40k,
  content: ListContent,
  index: number,
  itemId: string,
): ListContent {
  const next = clone(content);
  const u = next.roster.units[index];
  u.wargear = u.wargear.filter((w) => w.ref.id !== itemId);
  const unit = unitEntity(data, u.ref, next.roster.faction_id);
  if (unit && !loadoutDataMissing(data, unit)) {
    const { options, models } = loadoutCtx(data, unit);
    u.loadout_groups = regenGroups(
      data, unit, u.model_count, options, models, wargearCounts(u), next.roster.faction_id,
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
  const before = new Map(counts);
  counts.set(weaponId, data.clampWeaponCount(bounds, weaponId, requested));
  if (breaksBudget(unit, u.model_count, before, counts)) return content;
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
 * The unit's authored wargear options with how often each is currently taken,
 * inferred from the loadout's difference from the base loadout.
 *
 * Swaps are attributed ONCE: each branch's net change (adds minus replaces —
 * so "storm bolter → storm bolter + Ancient's banner" is just +1 banner) claims
 * from a shared pool of observed changes, most specific branch first. A model
 * with psycannon + banner therefore counts for the Ancient option only, not
 * also for the plain psycannon swap, and a psycannon in the bag while every
 * storm bolter is still carried counts for nothing (Deff Dread's double Extra
 * Klaw case). Identical option records merge into one state with their caps
 * summed — the schema's only way to say "up to 2 per 5 models".
 */
export function wargearOptionStates(
  data: Data40k,
  rosterUnit: RosterUnit,
  unit: Unit,
): WargearOptionState[] {
  const { options, models } = loadoutCtx(data, unit);
  const counts = wargearCounts(rosterUnit);
  const base = data.baseLoadout(unit, rosterUnit.model_count, options, models).counts;

  // Merge identical options (same swap, same constraint).
  const groups: { option: WargearOption; cap: number }[] = [];
  const byKey = new Map<string, number>();
  for (const option of options) {
    const mc = option.model_constraint ?? {};
    const key = JSON.stringify([
      [...(option.replaces ?? [])].sort(),
      optionBranches(option).map((b) => [...b].sort()),
      mc.model_name ?? null,
      mc.per_n_models ?? null,
      mc.max_count ?? null,
      !!mc.any_number,
    ]);
    const cap = data.optionCap(option, rosterUnit.model_count, models);
    const at = byKey.get(key);
    if (at != null) groups[at].cap += cap;
    else {
      byKey.set(key, groups.length);
      groups.push({ option, cap });
    }
  }

  // Observed change pools: net gains and net losses against the base loadout.
  const gained = new Map<string, number>();
  const lost = new Map<string, number>();
  for (const id of new Set([...counts.keys(), ...base.keys()])) {
    const d = (counts.get(id) ?? 0) - (base.get(id) ?? 0);
    if (d > 0) gained.set(id, d);
    if (d < 0) lost.set(id, -d);
  }

  const net = (option: WargearOption, ids: string[]) => {
    const change = new Map<string, number>();
    for (const id of ids) change.set(id, (change.get(id) ?? 0) + 1);
    for (const id of option.replaces ?? []) change.set(id, (change.get(id) ?? 0) - 1);
    return change;
  };
  const states: WargearOptionState[] = groups.map(({ option, cap }) => ({
    option,
    branches: optionBranches(option).map((ids) => ({ ids, applied: 0 })),
    cap,
    totalApplied: 0,
  }));
  const slots = states.flatMap((st) =>
    st.branches.map((b) => ({ st, b, change: net(st.option, b.ids) })),
  );
  // Most specific first: more distinct net-added items, then more removed.
  const size = (c: Map<string, number>, sign: 1 | -1) =>
    [...c.values()].filter((v) => v * sign > 0).length;
  slots.sort((x, y) => size(y.change, 1) - size(x.change, 1) || size(y.change, -1) - size(x.change, -1));

  const claimable = (change: Map<string, number>) => {
    let n = Infinity;
    for (const [id, v] of change) {
      if (v > 0) n = Math.min(n, Math.floor((gained.get(id) ?? 0) / v));
      if (v < 0) n = Math.min(n, Math.floor((lost.get(id) ?? 0) / -v));
    }
    // A branch with no net effect can't be observed in the loadout.
    return n === Infinity ? 0 : n;
  };
  const claim = (slot: (typeof slots)[number], n: number) => {
    if (n <= 0) return;
    for (const [id, v] of slot.change) {
      const pool = v > 0 ? gained : lost;
      pool.set(id, (pool.get(id) ?? 0) - Math.abs(v) * n);
    }
    slot.b.applied += n;
    slot.st.totalApplied += n;
  };
  // Pass 1 respects each option's cap so a merged/duplicate option's share
  // stays available to its siblings; pass 2 hands any remainder to the first
  // matching branch so an over-cap import still surfaces as a violation.
  for (const slot of slots) {
    claim(slot, Math.min(claimable(slot.change), Math.max(0, slot.st.cap - slot.st.totalApplied)));
  }
  for (const slot of slots) claim(slot, claimable(slot.change));

  // Shared allowances ("for every 5 models, 1 Interceptor can take one of …")
  // live in `wargear_budgets`, not in the options — every option record is
  // `any_number`, so without this each swap could be taken by every model.
  for (const budget of unit.wargear_budgets ?? []) {
    const items = new Set(budget.items ?? []);
    const room = budgetRoom(budget, rosterUnit.model_count, counts);
    for (const st of states) {
      const costs = st.branches
        .map((b) => budgetCost(items, b.ids, st.option.replaces))
        .filter((c) => c > 0);
      if (costs.length === 0) continue;
      st.cap = Math.min(st.cap, st.totalApplied + Math.floor(Math.max(0, room) / Math.min(...costs)));
    }
  }
  return states;
}

type WargearBudget = NonNullable<Unit["wargear_budgets"]>[number];

/** Allowance left in one shared budget (negative when already over). */
function budgetRoom(budget: WargearBudget, modelCount: number, counts: Map<string, number>): number {
  // `per_models === 0` is a flat per-unit cap; otherwise a ratio.
  const cap = budget.per_models
    ? Math.floor((modelCount * budget.count) / budget.per_models)
    : budget.count;
  const used = (budget.items ?? []).reduce((sum, id) => sum + (counts.get(id) ?? 0), 0);
  return cap - used;
}

/** Budget items one take of a swap branch spends, net of any it gives back. */
function budgetCost(items: Set<string>, added: string[], replaces: string[] | undefined): number {
  return (
    added.filter((id) => items.has(id)).length -
    (replaces ?? []).filter((id) => items.has(id)).length
  );
}

/** True when `after` pushes any shared budget further over its allowance than `before`. */
function breaksBudget(
  unit: Unit,
  modelCount: number,
  before: Map<string, number>,
  after: Map<string, number>,
): boolean {
  return (unit.wargear_budgets ?? []).some((b) => {
    const next = budgetRoom(b, modelCount, after);
    return next < 0 && next < budgetRoom(b, modelCount, before);
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
  const op = (c: ListContent) => applyOptionRaw(data, c, index, optionId, branchIndex, delta);
  const unit = unitEntity(data, content.roster.units[index].ref, content.roster.faction_id);
  const option = unit && loadoutCtx(data, unit).options.find((o) => o.id === optionId);
  if (unit && option && isSquadChoiceOption(unit, option)) return op(content);
  return withSquadBase(data, content, index, op);
}

function applyOptionRaw(
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
  const before = new Map(counts);
  for (const id of removed) counts.set(id, (counts.get(id) ?? 0) - 1);
  for (const id of added) counts.set(id, (counts.get(id) ?? 0) + 1);
  if (breaksBudget(unit, u.model_count, before, counts)) return content;
  u.wargear = wargearFromCounts(data, counts, next.roster.faction_id, u.wargear);
  u.loadout_groups = regenGroups(
    data, unit, u.model_count, options, models, wargearCounts(u), next.roster.faction_id,
  );
  return finalize(data, next, [u.ref.id]);
}

/** A squad-wide choice and the branch the squad is on (-1 = still the datasheet default). */
export interface SquadChoiceState {
  state: WargearOptionState;
  branch: number;
}

/** The unit's squad-wide weapon choices (squad-weapons.ts) and where each stands. */
export function squadChoiceStates(
  data: Data40k,
  rosterUnit: RosterUnit,
  unit: Unit,
): SquadChoiceState[] {
  if (!hasSquadChoices(unit)) return [];
  return wargearOptionStates(data, rosterUnit, unit)
    .filter((s) => isSquadChoiceOption(unit, s.option))
    .map((state) => {
      let branch = -1;
      let most = 0;
      state.branches.forEach((b, i) => {
        if (b.applied > most) {
          most = b.applied;
          branch = i;
        }
      });
      return { state, branch };
    });
}

/** Give back every take of one squad option — the squad returns to its default weapon. */
function clearSquad(data: Data40k, content: ListContent, index: number, optionId: string): ListContent {
  const unit = unitEntity(data, content.roster.units[index].ref, content.roster.faction_id);
  if (!unit) return content;
  const st = wargearOptionStates(data, content.roster.units[index], unit).find(
    (s) => s.option.id === optionId,
  );
  let cur = content;
  st?.branches.forEach((b, bi) => {
    for (let i = 0; i < b.applied; i++) cur = applyOptionRaw(data, cur, index, optionId, bi, -1);
  });
  return cur;
}

/**
 * Take one squad option's branch for every model it covers: its cap, less the
 * models whose default already went to another swap on the same model type
 * (the gauntlet Beserks, the APM Yaegir) — so a flat-count loadout never
 * reaches into a different model's copy (the Yaegir Theyn's shotgun).
 * Expects the squad to be on its default weapon.
 */
function fillSquad(
  data: Data40k,
  content: ListContent,
  index: number,
  optionId: string,
  branch: number,
): ListContent {
  const unit = unitEntity(data, content.roster.units[index].ref, content.roster.faction_id);
  if (!unit) return content;
  const states = wargearOptionStates(data, content.roster.units[index], unit);
  const me = states.find((s) => s.option.id === optionId);
  if (!me) return content;
  const model = me.option.model_constraint?.model_name;
  const mine = new Set(me.option.replaces ?? []);
  const elsewhere = states
    .filter(
      (s) =>
        s !== me &&
        s.option.model_constraint?.model_name === model &&
        (s.option.replaces ?? []).some((id) => mine.has(id)),
    )
    .reduce((n, s) => n + s.totalApplied, 0);
  let cur = content;
  for (let i = 0; i < me.cap - elsewhere; i++) {
    const next = applyOptionRaw(data, cur, index, optionId, branch, 1);
    if (next === cur) break;
    cur = next;
  }
  return cur;
}

/**
 * Run `op` with every squad-wide choice reset to the datasheet default, then
 * re-apply each choice across the squad — so other swaps and size changes see
 * the default weapon to trade, and the squad stays uniform afterwards.
 * Returns `content` unchanged when `op` refuses.
 */
function withSquadBase(
  data: Data40k,
  content: ListContent,
  index: number,
  op: (content: ListContent) => ListContent,
): ListContent {
  const u = content.roster.units[index];
  const unit = unitEntity(data, u.ref, content.roster.faction_id);
  if (!unit || !hasSquadChoices(unit)) return op(content);
  const picks = squadChoiceStates(data, u, unit).filter((p) => p.branch >= 0);
  if (picks.length === 0) return op(content);
  let based = content;
  for (const p of picks) based = clearSquad(data, based, index, p.state.option.id);
  const out = op(based);
  if (out === based) return content;
  let res = out;
  for (const p of picks) res = fillSquad(data, res, index, p.state.option.id, p.branch);
  return res;
}

/** Switch a squad-wide choice: `branch` of the option for the whole squad, or -1 for the default. */
export function setSquadWeapon(
  data: Data40k,
  content: ListContent,
  index: number,
  optionId: string,
  branch: number,
): ListContent {
  const cleared = clearSquad(data, content, index, optionId);
  return branch < 0 ? cleared : fillSquad(data, cleared, index, optionId, branch);
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

/**
 * Reprice every resolved unit from the dataset and recompute the total — run
 * when the editor opens, so stored costs from imports (which sometimes roll an
 * upgrade into the printed number) snap to the dataset's ground truth. Units
 * the dataset can't price keep their stored points, as everywhere else.
 */
export function repriceAll(data: Data40k, content: ListContent): ListContent {
  const next = clone(content);
  // Also heal wargear saved before a dual-mode weapon's second record existed
  // in the codex (Nazdreg's melee Kustom Blasta X).
  next.roster = completeRosterWargear(data, next.roster);
  return finalize(data, next, next.roster.units.map((u) => u.ref.id));
}

/**
 * `repriceAll`, or null when nothing would change — so callers only write
 * (and bump the sync stamp) for lists whose stored costs are actually stale,
 * e.g. a list scanned under last quarter's MFM.
 */
export function repriceIfStale(data: Data40k, content: ListContent): ListContent | null {
  const repriced = repriceAll(data, content);
  const before = content.roster;
  const changed =
    repriced.roster.points.total_computed !== before.points.total_computed ||
    repriced.roster.units.some((u, i) => {
      const old = before.units[i];
      return (
        u.points !== old.points ||
        u.enhancement_points !== old.enhancement_points ||
        u.wargear.length !== old.wargear.length ||
        u.wargear.some(
          (w, j) => w.ref.id !== old.wargear[j].ref.id || w.count !== old.wargear[j].count,
        )
      );
    });
  return changed ? repriced : null;
}

/**
 * The legality report as displayable lines, with three app-level filters over
 * the package's `checkRoster`:
 * - loadout complaints are dropped for units the dataset has no loadout data
 *   for (codex-overlay entries — the check would flag every weapon count);
 * - enhancement keyword mismatches are dropped when the "missing" keyword is
 *   the unit's own datasheet name ("DEFFKILLA WARTRIKE model only") — the
 *   package matches printed keywords only, the app treats the name as one;
 * - illegal-attachment complaints are dropped when the leader's enhancement
 *   grants leading that unit (Kaptin's Hat) — the package's eligibility list
 *   is datasheet-level and can't see the list-level grant.
 */
export function legalityIssues(
  data: Data40k,
  roster: Roster,
  attachments?: Record<string, number>,
): string[] {
  // The editor's index-keyed attachments map is the in-app source of truth;
  // the roster's own `leader_attachment` is only the import-time seed and goes
  // stale as pairs are changed in the editor. Project the map onto a copy so
  // the package's checker (which reads `leader_attachment`) sees reality —
  // otherwise an attached Support character still flags "must attach".
  const checked = attachments
    ? {
        ...roster,
        units: roster.units.map((u, i) => {
          const bodyRef = roster.units[attachments[String(i)]]?.ref;
          return {
            ...u,
            leader_attachment: bodyRef
              ? {
                  bodyguard_ref: structuredClone(bodyRef),
                  role: u.leader_attachment?.role ?? ("leader" as const),
                  // The user picked it in the editor — not an import inference.
                  provisional: false,
                }
              : null,
          };
        }),
      }
    : roster;
  const legality = data.checkRoster(checked, data.dataset);
  const factionId = roster.faction_id;
  const issues: string[] = [];

  const nameSatisfiesRestriction = (unitIndex: number): boolean => {
    const ru = roster.units[unitIndex];
    const unit = ru ? unitEntity(data, ru.ref, factionId) : undefined;
    const enh = ru?.enhancement?.id ? byId(data.enhancements, ru.enhancement.id, factionId) : undefined;
    if (!unit || !enh) return false;
    const kws = new Set(
      [unit.name, ...(unit.keywords ?? []), ...(unit.faction_keywords ?? [])].map((k) =>
        k.toLowerCase(),
      ),
    );
    return (
      (enh.keyword_restrictions ?? []).every((k) => kws.has(k.toLowerCase())) &&
      !(enh.exclusion_keywords ?? []).some((k) => kws.has(k.toLowerCase()))
    );
  };

  // Duplicate datasheets get the same #N ordinal the editor's dropdowns use —
  // "Mek: must attach" with two Meks reads as one stale error, not the other Mek.
  const unitLabel = (idx: number): string | null => {
    const ru = roster.units[idx];
    if (!ru) return null;
    const id = ru.ref.id;
    if (!id || roster.units.filter((u) => u.ref.id === id).length < 2) return ru.ref.raw_name;
    const ordinal = roster.units.slice(0, idx + 1).filter((u) => u.ref.id === id).length;
    return `${ru.ref.raw_name} #${ordinal}`;
  };

  const grantSatisfiesAttachment = (unitIndex: number): boolean => {
    const bodyId = checked.units[unitIndex]?.leader_attachment?.bodyguard_ref.id;
    return bodyId != null && enhancementLeadGrants(data, roster, unitIndex).has(bodyId);
  };

  for (const v of legality.army) {
    if (
      v.code === "enhancement-keyword-mismatch" &&
      v.unitIndex != null &&
      nameSatisfiesRestriction(v.unitIndex)
    )
      continue;
    if (
      v.code === "leader-attachment-illegal" &&
      v.unitIndex != null &&
      grantSatisfiesAttachment(v.unitIndex)
    )
      continue;
    const unitName = v.unitIndex != null ? unitLabel(v.unitIndex) : null;
    issues.push(unitName ? `${unitName}: ${v.message}` : v.message);
  }
  // Gear the datasheet can't carry gets a plain message; the package's
  // "cannot be assigned to whole-model loadouts" for that unit is its echo.
  const strayUnits = new Set<number>();
  roster.units.forEach((ru, i) => {
    const unit = unitEntity(data, ru.ref, factionId);
    const strays = unit ? strayWargearIds(data, ru, unit) : [];
    if (strays.length === 0) return;
    strayUnits.add(i);
    const names = strays.map((id) => itemName(data, id, factionId)).join(", ");
    issues.push(`${unitLabel(i)}: ${names} isn't on this datasheet — remove it in the wargear list`);
  });
  for (const ul of legality.units) {
    const ru = roster.units[ul.unitIndex];
    const unit = ru ? unitEntity(data, ru.ref, factionId) : undefined;
    if (unit && loadoutDataMissing(data, unit)) continue;
    for (const v of ul.violations) {
      if (v.code === "swap-conflict" && strayUnits.has(ul.unitIndex)) continue;
      issues.push(`${unitLabel(ul.unitIndex)}: ${v.message}`);
    }
  }
  issues.push(...alliedIssues(data, roster));
  return issues;
}

/** An allied-rule pool the army may draw from (Imperial Agents, Questoris Allies, …). */
export interface AllyPool {
  rule: AlliedRule;
  units: ReturnType<Data40k["dataset"]["allyUnitsFor"]>;
}

/**
 * The ally pools the roster's faction + detachments qualify for, each with
 * its unit pool — e.g. Grey Knights get Imperial Agents and Questoris Allies.
 * Units native to the army are left out (a pool may list a shared id).
 */
export function allyPools(data: Data40k, roster: Roster): AllyPool[] {
  const factionId = roster.faction_id;
  if (!factionId) return [];
  const detIds = roster.detachments.map((d) => d.ref.id).filter((id): id is string => !!id);
  return data.dataset
    .alliesFor(factionId, detIds)
    .map((rule) => ({
      rule,
      units: data.dataset
        .allyUnitsFor(rule.id)
        .filter((u) => u.raw.faction_id !== factionId),
    }))
    .filter((p) => p.units.length > 0);
}

/**
 * The allied rule the unit at `index` is fielded under, or null for a unit
 * native to the army (or one no offered pool covers).
 */
export function allyRuleOf(
  data: Data40k,
  roster: Roster,
  index: number,
  pools: AllyPool[] = allyPools(data, roster),
): AlliedRule | null {
  const ru = roster.units[index];
  const id = ru?.ref.id;
  if (!id || !roster.faction_id) return null;
  if (data.units.getInFaction(id, roster.faction_id)) return null;
  return pools.find((p) => p.units.some((u) => u.id === id))?.rule ?? null;
}

/** How many units of one capped keyword an ally pool has used, against its cap. */
export interface AllyCapUsage {
  keyword: string;
  used: number;
  max: number;
}

/** Roster indexes fielded under `rule`. */
function allyMembers(data: Data40k, roster: Roster, rule: AlliedRule, pools: AllyPool[]): number[] {
  return roster.units
    .map((_, i) => i)
    .filter((i) => allyRuleOf(data, roster, i, pools)?.id === rule.id);
}

/** Per-keyword cap usage for `rule` at the roster's battle size. */
export function allyCapUsage(
  data: Data40k,
  roster: Roster,
  rule: AlliedRule,
  pools: AllyPool[] = allyPools(data, roster),
): AllyCapUsage[] {
  const size = roster.battle_size ?? "strike-force";
  const kwSets = allyMembers(data, roster, rule, pools).map((i) => {
    const unit = unitEntity(data, roster.units[i].ref, roster.faction_id);
    return new Set(
      [...(unit?.keywords ?? []), ...(unit?.faction_keywords ?? [])].map((k) => k.toLowerCase()),
    );
  });
  return (rule.keyword_limits ?? [])
    .filter((l) => l.battle_size === size)
    .map((l) => ({
      keyword: l.keyword,
      used: kwSets.filter((k) => k.has(l.keyword.toLowerCase())).length,
      max: l.max_count,
    }));
}

/**
 * Allied-rule construction limits the package's checkRoster doesn't enforce:
 * per-keyword caps (Agents: 2 Characters / 1 Requisitioned / 2 Retinue at
 * Strike Force), points and unit-count caps, and the no-Warlord /
 * no-Enhancement riders.
 */
export function alliedIssues(data: Data40k, roster: Roster): string[] {
  const pools = allyPools(data, roster);
  if (pools.length === 0) return [];
  const size = roster.battle_size ?? "strike-force";
  const issues: string[] = [];
  for (const { rule } of pools) {
    const label = rule.label ?? rule.name;
    const members = allyMembers(data, roster, rule, pools).map((i) => roster.units[i]);
    if (members.length === 0) continue;
    for (const c of allyCapUsage(data, roster, rule, pools)) {
      if (c.used > c.max) issues.push(`${label}: ${c.used} ${c.keyword} units (max ${c.max})`);
    }
    const ptsCap = rule.points_limits?.find((l) => l.battle_size === size)?.max_points;
    const pts = members.reduce((s, u) => s + (u.points ?? 0) + (u.enhancement_points ?? 0), 0);
    if (ptsCap != null && pts > ptsCap) issues.push(`${label}: ${pts} pts (max ${ptsCap})`);
    if (rule.max_units != null && members.length > rule.max_units)
      issues.push(`${label}: ${members.length} units (max ${rule.max_units})`);
    for (const u of members) {
      if (rule.cannot_be_warlord && u.is_warlord)
        issues.push(`${u.ref.raw_name}: ${label} units can't be your Warlord`);
      if (rule.cannot_take_enhancements && u.enhancement)
        issues.push(`${u.ref.raw_name}: ${label} units can't take Enhancements`);
    }
  }
  return issues;
}

/**
 * Datasheet ids the roster's chosen detachments promote to Battleline —
 * parsed from the detachment rule's "Friendly X units gain the Battleline
 * keyword" sentence (Kult of Speed's Warbikers, Runt Swarm's Gretchin, …).
 * X matches a datasheet name or a keyword its datasheet carries.
 */
export function battlelineGrants(data: Data40k, roster: Roster): Set<string> {
  const ids = new Set<string>();
  if (!roster.faction_id) return ids;
  const pool = data.units.byFaction(roster.faction_id);
  for (const d of roster.detachments) {
    const det = d.ref.id ? byId(data.detachments, d.ref.id, roster.faction_id) : undefined;
    const ruleIds = det?.detachment_rule_ids?.length
      ? det.detachment_rule_ids
      : det?.detachment_rule_id
        ? [det.detachment_rule_id]
        : [];
    for (const rid of ruleIds) {
      const ability = byId(data.abilities, rid, roster.faction_id);
      const text = ability ? abilityText(ability) : "";
      for (const m of text.matchAll(BATTLELINE_GRANT_RE)) {
        const term = m[1].trim().toLowerCase();
        for (const u of pool) {
          if (
            u.name.toLowerCase() === term ||
            (u.raw.keywords ?? []).some((k) => k.toLowerCase() === term)
          ) {
            ids.add(u.id);
          }
        }
      }
    }
  }
  return ids;
}

/**
 * Extra bodyguard datasheet ids the character at `leaderIndex` may lead thanks
 * to its enhancement — parsed from the enhancement rule's "The bearer can be
 * attached to X units" sentence (Kaptin's Hat → Flash Gitz, Kill Kommanda →
 * Kommandos). X matches a datasheet name or a keyword its datasheet carries.
 */
export function enhancementLeadGrants(
  data: Data40k,
  roster: Roster,
  leaderIndex: number,
): Set<string> {
  const ids = new Set<string>();
  const factionId = roster.faction_id;
  const enhId = roster.units[leaderIndex]?.enhancement?.id;
  if (!factionId || !enhId) return ids;
  const enh = byId(data.enhancements, enhId, factionId);
  const ability = enh?.ability_id ? byId(data.abilities, enh.ability_id, factionId) : undefined;
  const text = ability ? abilityText(ability) : "";
  const pool = data.units.byFaction(factionId);
  for (const m of text.matchAll(LEADS_GRANT_RE)) {
    const term = m[1]
      .trim()
      .replace(/^(?:a|an|the)\s+/i, "")
      .toLowerCase();
    for (const u of pool) {
      if (
        u.name.toLowerCase() === term ||
        (u.raw.keywords ?? []).some((k) => k.toLowerCase() === term)
      ) {
        ids.add(u.id);
      }
    }
  }
  return ids;
}

/** Declare (or clear) which unit the character at `leaderIndex` is attached to. */
export function setLeaderAttachment(
  content: ListContent,
  leaderIndex: number,
  bodyguardIndex: number | null,
): ListContent {
  const next = clone(content);
  if (bodyguardIndex == null) delete next.attachments[String(leaderIndex)];
  else next.attachments[String(leaderIndex)] = bodyguardIndex;
  return next;
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
  /** Copies already on OTHER units — upgrades may be taken more than once. */
  taken: number;
  /** Army-wide take limit: 3 for `upgrade_tag` upgrades, 1 for everything else. */
  max: number;
}

/**
 * Army-wide enhancement slots by game-size bracket: 2 up to 1000 pts, 4 up to
 * 2000, 6 beyond — assuming a 2000-pt game when no limit is declared. A
 * repeatable upgrade spends ONE slot no matter how many copies the army runs;
 * everything else spends a slot per instance. `exceptIndex` leaves that unit's
 * enhancement out of the count (for "what if this unit picked X" checks).
 */
export function enhancementSlots(
  data: Data40k,
  roster: Roster,
  exceptIndex?: number,
): { used: number; limit: number } {
  const declared = roster.points.declared_limit ?? 2000;
  const limit = declared <= 1000 ? 2 : declared <= 2000 ? 4 : 6;
  const upgradeIds = new Set<string>();
  let used = 0;
  roster.units.forEach((u, i) => {
    if (i === exceptIndex || u.enhancement == null) return;
    const enh = u.enhancement.id
      ? byId(data.enhancements, u.enhancement.id, roster.faction_id)
      : undefined;
    if (enh?.upgrade_tag) upgradeIds.add(enh.id);
    else used++;
  });
  return { used: used + upgradeIds.size, limit };
}

/**
 * Enhancements the unit at `index` can actually take, from the roster's
 * detachments. Regular enhancements go to characters (not epic heroes);
 * `upgrade_tag` enhancements go to non-character units instead. The unit's own
 * NAME counts as a keyword — restrictions routinely name the datasheet
 * ("Deffkilla Wartrike"). Enhancements whose keyword restrictions the unit
 * fails are not offered at all; ones at their take limit elsewhere remain
 * listed (disabled) since the unit itself is eligible.
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
  if (allyRuleOf(data, roster, index)?.cannot_take_enhancements) return [];
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
    .filter((e) => (e.keyword_restrictions ?? []).every((k) => keywords.has(k.toLowerCase())))
    .map((e) => ({
      id: e.id,
      name: e.name,
      cost: e.cost,
      taken: roster.units.filter((u, i) => i !== index && u.enhancement?.id === e.id).length,
      max: e.upgrade_tag ? (e.max_targets ?? 3) : 1,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
