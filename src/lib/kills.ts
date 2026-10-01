/**
 * Expected models slain, done properly. The package engine reports kills as
 * `damage / W`, which ignores that damage doesn't spill between models: a
 * lascannon wound on a 1-wound guardsman is 1 kill, not 6, and D2 into W3
 * models needs two wounds per kill (0.5 kills/wound, not 0.67).
 *
 * Here the unsaved wounds are allocated one at a time against fresh W-wound
 * models with the real per-wound damage distribution (D3/D6 rolled, damage
 * modifiers, damage reduction floored at 1, Feel No Pain per damage point),
 * overkill on a model wasted. The wound COUNT is treated as Poisson around
 * the engine's expected unsaved total — exact for W1 targets and for
 * damage ≥ W, a close approximation in between. Mortal wounds spill over.
 */

export type Dist = Map<number, number>;

function addTo(dist: Dist, value: number, p: number) {
  if (p > 0) dist.set(value, (dist.get(value) ?? 0) + p);
}

/** Distribution of a D/A stat: 3, "D3", "D6+1", "2D6". Unparseable → its numeric value. */
export function statDistribution(stat: unknown): Dist {
  if (typeof stat === "number") return new Map([[stat, 1]]);
  const m = /^(\d*)D(\d+)([+-]\d+)?$/i.exec(String(stat ?? "").trim());
  if (!m) return new Map([[Number(stat) || 0, 1]]);
  const count = m[1] === "" ? 1 : Number(m[1]);
  const die = Number(m[2]);
  const offset = m[3] ? Number(m[3]) : 0;
  let dist: Dist = new Map([[offset, 1]]);
  for (let i = 0; i < count; i++) {
    const next: Dist = new Map();
    for (const [v, p] of dist) for (let f = 1; f <= die; f++) addTo(next, v + f, p / die);
    dist = next;
  }
  return dist;
}

export function mean(dist: Dist): number {
  let m = 0;
  for (const [v, p] of dist) m += v * p;
  return m;
}

/**
 * Per-unsaved-wound damage that actually lands: rolled D + flat modifiers,
 * then the defender's reduction (min 1 when a reduction applies), then each
 * point independently survives Feel No Pain with `pSurvive`.
 */
export function landedDamage(
  base: Dist,
  { bonus, reduction, pSurvive }: { bonus: number; reduction: number; pSurvive: number },
): Dist {
  const out: Dist = new Map();
  for (const [roll, p] of base) {
    const before = Math.max(0, roll + bonus);
    const d = reduction > 0 ? Math.max(1, before - reduction) : before;
    // Binomial thinning: k of d points get through FNP.
    for (let k = 0; k <= d; k++) {
      addTo(out, k, p * binom(d, k) * pSurvive ** k * (1 - pSurvive) ** (d - k));
    }
  }
  return out;
}

function binom(n: number, k: number): number {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/**
 * Expected kills from `n` sequential wounds, n = 0..maxN, against an unending
 * line of W-wound models: a forward pass over "wounds left on the model
 * currently taking damage".
 */
function killsByWoundCount(dmg: Dist, W: number, maxN: number): number[] {
  // state[h] = P(current model has h wounds left), h = 1..W
  let state = new Array<number>(W + 1).fill(0);
  state[W] = 1;
  const out = [0];
  let kills = 0;
  for (let n = 1; n <= maxN; n++) {
    const next = new Array<number>(W + 1).fill(0);
    for (let h = 1; h <= W; h++) {
      if (state[h] === 0) continue;
      for (const [d, p] of dmg) {
        const q = state[h] * p;
        if (d >= h) {
          kills += q;
          next[W] += q;
        } else next[h - d] += q;
      }
    }
    state = next;
    out.push(kills);
  }
  return out;
}

/**
 * Expected models slain by one weapon line. `unsaved` is the expected count of
 * savable wounds that got through; `mortalDamage` the expected (post-FNP)
 * mortal damage, which spills from model to model.
 */
export function expectedKills({
  unsaved,
  mortalDamage,
  damage,
  W,
  models,
}: {
  unsaved: number;
  mortalDamage: number;
  damage: Dist;
  W: number;
  models: number;
}): number {
  let kills = 0;
  if (unsaved > 200) {
    // e^-n underflows; at this volume the spread is negligible anyway.
    const n = Math.round(unsaved);
    kills = Math.min(models, killsByWoundCount(damage, Math.max(1, W), n)[n]);
  } else if (unsaved > 0) {
    // Poisson tail: cover the mean plus ~8 standard deviations.
    const maxN = Math.ceil(unsaved + 8 * Math.sqrt(unsaved) + 8);
    const byN = killsByWoundCount(damage, Math.max(1, W), maxN);
    let pn = Math.exp(-unsaved);
    for (let n = 0; n <= maxN; n++) {
      if (n > 0) pn *= unsaved / n;
      kills += pn * Math.min(models, byN[n]);
    }
  }
  return Math.min(models, kills + mortalDamage / Math.max(1, W));
}
