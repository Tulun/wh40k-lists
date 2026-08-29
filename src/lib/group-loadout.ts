/**
 * Spread-preferring per-model loadout grouping, an app-side port of the
 * dataset package's `groupLoadout` (dist/data/loadout.js) with one change:
 * candidate loadouts are ordered by how many wargear options they consume
 * (fewest first) before the canonical multiset key. The package orders by key
 * alone, so its exact-cover search happily stacks every special weapon onto a
 * single model when that assignment happens to sort first (Kommandos rendered
 * as one model carrying Breacha Ram + Burna + Kustom Shoota + Rokkit Launcha).
 * Preferring option-light candidates makes the search fill the bulk base
 * loadout first and hand each option to its own model — the grouping a GW
 * datasheet reader expects ("1 with Burna, 2 with Kustom Shoota, …").
 *
 * Legality is untouched: an exact partition exists under one ordering iff it
 * exists under the other, so `validateLoadout`/`checkUnitLegality` (which call
 * the package's own grouping) agree with this one about what's legal. Only the
 * *displayed* decomposition differs. If the preference lands upstream this
 * module can be deleted and call sites pointed back at `data.groupLoadout`.
 */
import type { LoadoutGroup, Unit, WargearOption } from "@alpaca-software/40kdc-data";
import { optionCap } from "@alpaca-software/40kdc-data";

type LoadoutModel = NonNullable<Parameters<typeof optionCap>[2]>[number];

function toMultiset(ids: readonly string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const id of ids) m.set(id, (m.get(id) ?? 0) + 1);
  return m;
}

/** Stable key for a weapon multiset: `count:id` parts in id order. */
function multisetKey(m: Map<string, number>): string {
  return [...m.entries()]
    .filter(([, c]) => c > 0)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([id, c]) => `${c}:${id}`)
    .join("|");
}

function sortedGroupWeapons(m: Map<string, number>): LoadoutGroup["weapons"] {
  return [...m.entries()]
    .filter(([, c]) => c > 0)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([id, count]) => ({ id, count }));
}

function hasRecordedDefaults(models: readonly LoadoutModel[] | undefined): boolean {
  return (
    !!models && models.length > 0 && models.every((m) => (m.default_weapon_ids?.length ?? 0) > 0)
  );
}

/** The bundles (added-id sets) an option offers: a fixed replacement, else each choice branch. */
function optionBundles(option: WargearOption): string[][] {
  if (option.replacement) return [[...option.replacement]];
  return (option.replacement_choice ?? []).map((b) => [...b]);
}

/**
 * Assign each composition row a model count, summing to `modelCount` — the
 * package's heuristic verbatim: rows seed at `min`, a row with a distinctive
 * default weapon grows toward that weapon's implied count, leftover pours into
 * the bulk row.
 */
function assignRowCounts(
  models: readonly LoadoutModel[],
  modelCount: number,
  counts: Map<string, number>,
): number[] {
  const rowDefaults = models.map((m) => toMultiset(m.default_weapon_ids ?? []));
  const rowsWith = new Map<string, number>();
  for (const def of rowDefaults)
    for (const id of def.keys()) rowsWith.set(id, (rowsWith.get(id) ?? 0) + 1);
  const minOf = (i: number) => Math.max(0, models[i].min ?? 0);
  const maxOf = (i: number) => Math.max(minOf(i), models[i].max ?? minOf(i));
  const out = models.map((_, i) => minOf(i));
  let budget = modelCount - out.reduce((a, b) => a + b, 0);
  if (budget < 0) {
    let over = -budget;
    for (let i = models.length - 1; i >= 0 && over > 0; i--) {
      const cut = Math.min(over, out[i]);
      out[i] -= cut;
      over -= cut;
    }
    budget = 0;
  }
  const distinctive = models.map(() => false);
  for (let i = 0; i < models.length && budget > 0; i++) {
    let cap = Infinity;
    let saw = false;
    for (const [id, mult] of rowDefaults[i]) {
      if ((rowsWith.get(id) ?? 0) === 1 && mult > 0 && (counts.get(id) ?? 0) > 0) {
        saw = true;
        cap = Math.min(cap, Math.floor((counts.get(id) ?? 0) / mult));
      }
    }
    if (!saw) continue;
    distinctive[i] = true;
    const add = Math.max(0, Math.min(Math.min(cap, maxOf(i)) - out[i], budget));
    out[i] += add;
    budget -= add;
  }
  const headroom = (i: number) => maxOf(i) - out[i];
  while (budget > 0) {
    let pick = -1;
    for (let i = 0; i < models.length; i++) {
      if (headroom(i) <= 0 || models[i].is_leader_model || distinctive[i]) continue;
      if (pick < 0 || headroom(i) > headroom(pick)) pick = i;
    }
    if (pick < 0)
      for (let i = 0; i < models.length; i++) {
        if (headroom(i) <= 0) continue;
        if (pick < 0 || headroom(i) > headroom(pick)) pick = i;
      }
    if (pick < 0) break;
    const add = Math.min(budget, headroom(pick));
    out[pick] += add;
    budget -= add;
  }
  return out;
}

/** Every feasible per-row model allocation, preferred heuristic first. */
function candidateRowCounts(
  models: readonly LoadoutModel[],
  modelCount: number,
  counts: Map<string, number>,
): number[][] {
  const preferred = assignRowCounts(models, modelCount, counts);
  const out: number[][] = [];
  const seen = new Set<string>();
  const add = (row: number[]) => {
    const key = row.join(",");
    if (!seen.has(key)) {
      seen.add(key);
      out.push(row);
    }
  };
  if (preferred.reduce((sum, count) => sum + count, 0) === modelCount) add(preferred);
  const mins = models.map((model) => Math.max(0, model.min ?? 0));
  const maxs = models.map((model, i) => Math.max(mins[i], model.max ?? mins[i]));
  const suffixMin = Array<number>(models.length + 1).fill(0);
  const suffixMax = Array<number>(models.length + 1).fill(0);
  for (let i = models.length - 1; i >= 0; i--) {
    suffixMin[i] = suffixMin[i + 1] + mins[i];
    suffixMax[i] = suffixMax[i + 1] + maxs[i];
  }
  const current = Array<number>(models.length).fill(0);
  const visit = (i: number, remaining: number) => {
    if (i === models.length) {
      if (remaining === 0) add([...current]);
      return;
    }
    const lo = Math.max(mins[i], remaining - suffixMax[i + 1]);
    const hi = Math.min(maxs[i], remaining - suffixMin[i + 1]);
    for (let count = hi; count >= lo; count--) {
      current[i] = count;
      visit(i + 1, remaining - count);
    }
  };
  visit(0, Math.max(0, Math.floor(modelCount) || 0));
  return out;
}

interface Candidate {
  weapons: Map<string, number>;
  usedOptions: number[];
  key: string;
}

/**
 * Every legal single-model loadout for one composition row: base defaults plus
 * any compatible subset of the row's options, each used at most once per model.
 * Caps are charged globally by the assignment search, not here.
 */
function enumerateRowCandidates(
  base: Map<string, number>,
  rowName: string | null,
  options: readonly WargearOption[],
): Candidate[] {
  const applicable: number[] = [];
  for (let i = 0; i < options.length; i++) {
    const name = options[i].model_constraint?.model_name ?? null;
    if (name == null || name === rowName) applicable.push(i);
  }
  const stateKey = (w: Map<string, number>, used: number[]) =>
    `${multisetKey(w)}#${[...used].sort((a, b) => a - b).join(",")}`;
  const result: Candidate[] = [];
  const seen = new Set<string>();
  const queue: { weapons: Map<string, number>; used: number[] }[] = [
    { weapons: new Map(base), used: [] },
  ];
  seen.add(stateKey(base, []));
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    result.push({ weapons: cur.weapons, usedOptions: cur.used, key: multisetKey(cur.weapons) });
    for (const oi of applicable) {
      if (cur.used.includes(oi)) continue;
      const replaces = options[oi].replaces ?? [];
      if (!replaces.every((id) => (cur.weapons.get(id) ?? 0) >= 1)) continue;
      for (const bundle of optionBundles(options[oi])) {
        if (bundle.length === 0) continue;
        const w = new Map(cur.weapons);
        for (const id of replaces) w.set(id, (w.get(id) ?? 0) - 1);
        for (const id of bundle) w.set(id, (w.get(id) ?? 0) + 1);
        for (const [id, c] of [...w]) if (c <= 0) w.delete(id);
        const used = [...cur.used, oi].sort((a, b) => a - b);
        const k = stateKey(w, used);
        if (seen.has(k)) continue;
        seen.add(k);
        queue.push({ weapons: w, used });
      }
    }
  }
  return result;
}

interface Row {
  name: string | null;
  count: number;
  candidates: Candidate[];
}

interface Pick {
  ri: number;
  name: string | null;
  weapons: Map<string, number>;
  count: number;
}

/**
 * Complete, deterministic exact-cover search: distribute each row's models
 * across its candidates so weapons sum to `bag` exactly within option caps.
 * Candidates arrive option-light-first, and largest feasible take is tried
 * first, so the first solution found is the maximally-spread one.
 */
function solveAssignment(
  rows: Row[],
  bag: Map<string, number>,
  optionCaps: number[],
): Pick[] | null {
  const residual = new Map(bag);
  const usage = optionCaps.map(() => 0);
  const picks: { ri: number; ci: number; count: number }[] = [];
  const assignRow = (ri: number): boolean => {
    if (ri === rows.length) {
      for (const c of residual.values()) if (c !== 0) return false;
      return true;
    }
    return distribute(ri, 0, rows[ri].count);
  };
  const distribute = (ri: number, ci: number, left: number): boolean => {
    const row = rows[ri];
    if (ci === row.candidates.length) return left === 0 && assignRow(ri + 1);
    const cand = row.candidates[ci];
    let hi = left;
    for (const [id, per] of cand.weapons) {
      if (per > 0) hi = Math.min(hi, Math.floor((residual.get(id) ?? 0) / per));
    }
    for (const oi of cand.usedOptions) hi = Math.min(hi, optionCaps[oi] - usage[oi]);
    hi = Math.max(0, hi);
    for (let take = hi; take >= 0; take--) {
      for (const [id, per] of cand.weapons) residual.set(id, (residual.get(id) ?? 0) - per * take);
      for (const oi of cand.usedOptions) usage[oi] += take;
      if (take > 0) picks.push({ ri, ci, count: take });
      if (distribute(ri, ci + 1, left - take)) return true;
      if (take > 0) picks.pop();
      for (const oi of cand.usedOptions) usage[oi] -= take;
      for (const [id, per] of cand.weapons) residual.set(id, (residual.get(id) ?? 0) + per * take);
    }
    return false;
  };
  if (!assignRow(0)) return null;
  return picks.map((p) => ({
    ri: p.ri,
    name: rows[p.ri].name,
    weapons: rows[p.ri].candidates[p.ci].weapons,
    count: p.count,
  }));
}

/**
 * Decompose a unit's flat loadout into per-model-type groups, preferring the
 * assignment that spreads wargear options across models. Same contract as the
 * package's `groupLoadout`: `null` when no exact partition exists (callers fall
 * back to unit-wide rendering).
 */
export function groupLoadoutSpread(
  _unit: Unit,
  modelCount: number,
  options: readonly WargearOption[],
  models: readonly LoadoutModel[] | undefined,
  counts: Map<string, number>,
): LoadoutGroup[] | null {
  const n = Math.max(0, Math.floor(modelCount) || 0);
  if (n <= 1 || !hasRecordedDefaults(models) || !models) return null;
  const bag = new Map<string, number>();
  for (const [id, c] of counts) if (c > 0) bag.set(id, c);
  // The divergence from upstream: a first pass allows each model at most ONE
  // wargear option, so every special lands on its own model — the grouping a
  // datasheet reader expects. Only when no such partition exists (a genuine
  // multi-swap model, e.g. a sergeant taking both a pistol and a melee swap)
  // does the second pass admit stacked candidates.
  for (const maxOptionsPerModel of [1, Infinity]) {
    for (const rowN of candidateRowCounts(models, n, bag)) {
      const fixedModels = models.map((model, i) => ({ ...model, min: rowN[i], max: rowN[i] }));
      const optionCaps = options.map((option) => optionCap(option, n, fixedModels));
      const rows: Row[] = [];
      for (let i = 0; i < models.length; i++) {
        const count = rowN[i];
        if (count <= 0) continue;
        const base = toMultiset(models[i].default_weapon_ids ?? []);
        const candidates = enumerateRowCandidates(base, models[i].name ?? null, options)
          .filter((c) => c.usedOptions.length <= maxOptionsPerModel)
          .sort(
            (a, b) =>
              a.usedOptions.length - b.usedOptions.length ||
              a.key.localeCompare(b.key) ||
              a.usedOptions.join(",").localeCompare(b.usedOptions.join(",")),
          );
        rows.push({ name: models[i].name ?? null, count, candidates });
      }
      const solution = solveAssignment(rows, bag, optionCaps);
      if (!solution) continue;
      const byGroup = new Map<
        string,
        {
          ri: number;
          name: string | null;
          weapons: Map<string, number>;
          count: number;
          key: string;
        }
      >();
      for (const s of solution) {
        const key = multisetKey(s.weapons);
        const gkey = `${s.name ?? ""}##${key}`;
        const cur = byGroup.get(gkey);
        if (cur) cur.count += s.count;
        else byGroup.set(gkey, { ri: s.ri, name: s.name, weapons: s.weapons, count: s.count, key });
      }
      const live = [...byGroup.values()]
        .filter((group) => group.count > 0)
        .sort((a, b) => a.ri - b.ri || b.count - a.count || a.key.localeCompare(b.key));
      if (live.length === 0) continue;
      return live.map((group) => ({
        model_name: group.name,
        count: group.count,
        weapons: sortedGroupWeapons(group.weapons),
      }));
    }
  }
  return null;
}
