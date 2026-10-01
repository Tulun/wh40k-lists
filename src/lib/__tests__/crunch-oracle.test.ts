/**
 * Accuracy check for the damage maths: an independent, closed-form reference
 * calculator written straight from the core rules (hit → wound → save →
 * damage, with crits, re-rolls, Lethal/Sustained/Devastating, stat mods) —
 * deliberately NOT derived from the package's engine — compared against the
 * engine across a seeded sweep of synthetic weapons × targets × modifier
 * stacks. Any rules drift (or a bug either side) shows up as a mismatch with
 * the exact case printed.
 */
import { describe, expect, it } from "vitest";
import * as data40k from "@alpaca-software/40kdc-data";
import type { Buff, Unit, Weapon } from "@alpaca-software/40kdc-data";
import { emptyCodexDoc } from "../codex-model";
import { mergedData } from "../data";
import { MODIFIERS, lineKills, standardTargets, targetMatches } from "../crunch";

const data = mergedData(data40k as never, emptyCodexDoc());

interface Case {
  models: number;
  A: number;
  skill: number;
  S: number;
  AP: number;
  D: number;
  T: number;
  Sv: number;
  inv: number | null;
  W: number;
  mods: Record<string, number>;
}

// ——— the reference calculator ———

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
/** P(d6 ≥ need), need already clamped to 2..6 (1 always fails, 6 always passes). */
const pass = (need: number) => (7 - clamp(need, 2, 6)) / 6;

function woundNeed(S: number, T: number): number {
  if (S >= 2 * T) return 2;
  if (S > T) return 3;
  if (S === T) return 4;
  if (2 * S <= T) return 6;
  return 5;
}

/** Success and crit (unmodified 6) chances after an optional re-roll. */
function withReroll(p: number, reroll: "none" | "ones" | "all") {
  const c = 1 / 6;
  if (reroll === "ones") return { p: p + p / 6, c: c + c / 6 };
  if (reroll === "all") return { p: p + (1 - p) * p, c: c + (1 - p) * c };
  return { p, c };
}

function reference(k: Case): number {
  const m = k.mods;
  const attacks = k.models * (k.A + (m.attacks ?? 0));
  const hitMod = clamp(m.hit ?? 0, -1, 1);
  const woundMod = clamp(m.wound ?? 0, -1, 1);
  const hitRr = "rr-hit" in m ? "all" : "rr1-hit" in m ? "ones" : "none";
  const woundRr =
    "rr-wound" in m || "twin-linked" in m ? "all" : "rr1-wound" in m ? "ones" : "none";

  const hit = withReroll(pass(k.skill - hitMod), hitRr);
  const lethal = "lethal-hits" in m;
  const sustained = m["sustained-hits"] ?? 0;
  const autoWounds = lethal ? attacks * hit.c : 0;
  const rolledHits = attacks * (hit.p - (lethal ? hit.c : 0)) + attacks * hit.c * sustained;

  const S = k.S + (m.strength ?? 0);
  const T = Math.max(1, k.T - (m["target-toughness"] ?? 0));
  const wound = withReroll(pass(woundNeed(S, T) - woundMod), woundRr);
  const dev = "dev-wounds" in m;
  const critWounds = dev ? rolledHits * wound.c : 0;
  const savable = rolledHits * wound.p - critWounds + autoWounds;

  const ap = k.AP - (m.ap ?? 0); // AP stored ≤ 0; "ap" mod is the improvement
  let saveNeed = k.Sv - ap;
  if (k.inv != null) saveNeed = Math.min(saveNeed, k.inv);
  const fail = saveNeed >= 7 ? 1 : 1 - pass(saveNeed);

  // Raw damage inflicted (overkill on a single model is a kills concern —
  // see the kills checks below).
  const D = k.D + (m.damage ?? 0);
  return (savable * fail + critWounds) * D;
}

// ——— driving the engine ———

const template = data.weapons.all.find((w) => w.id.startsWith("storm-bolter"))!.raw;
const targetTemplate = standardTargets(data).find((t) => t.profileId === "geq-guardsmen")!
  .unitRaw;

function engineRun(k: Case & { Dstat?: string; fnp?: number }) {
  const weapon = {
    ...template,
    id: "oracle-weapon",
    profiles: [
      {
        ...template.profiles[0],
        keywords: [],
        stats: { A: k.A, BS: k.skill, S: k.S, AP: k.AP, D: k.Dstat ?? k.D },
      },
    ],
  } as Weapon;
  const unit = {
    ...targetTemplate,
    id: "oracle-target",
    abilities: [],
    profiles: [{ ...targetTemplate.profiles[0], T: k.T, Sv: k.Sv, invuln_sv: k.inv, W: k.W }],
  } as Unit;
  const buffs: Buff[] = MODIFIERS.filter((d) => d.id in k.mods).map((d) => ({
    source: { kind: "manual", label: d.label },
    contribution: d.contribution(k.mods[d.id]),
  }));
  if (k.fnp) buffs.push({ source: { kind: "manual", label: "fnp" }, contribution: { type: "feel-no-pain", threshold: k.fnp } });
  const out = data.crunch(
    {
      attacker: { weapon, profileIndex: 0 },
      target: { unit, profileIndex: 0, modelCount: MODELS },
      modelsFiring: k.models,
      buffs,
      context: { phase: "shooting" },
    },
    data.dataset,
  );
  return { out, weapon };
}

const MODELS = 20;

function engine(k: Case): number {
  return engineRun(k).out.stages.find((s) => s.name === "after-fnp")?.expected ?? NaN;
}

// ——— the sweep ———

/** mulberry32: deterministic, so a failing case reproduces every run. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomCase(r: () => number): Case {
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const mods: Record<string, number> = {};
  for (const def of MODIFIERS) {
    if (r() > 0.25) continue;
    if (!def.range) mods[def.id] = 0;
    else {
      const span = def.range.max - def.range.min;
      let v = def.range.min + Math.floor(r() * (span + 1));
      if (v === 0) v = 1;
      mods[def.id] = v;
    }
  }
  // Keep to what the reference models: no Melta/Ignores Cover here.
  delete mods.melta;
  delete mods["ignores-cover"];
  return {
    models: pick([1, 5, 10]),
    A: pick([1, 2, 4]),
    skill: pick([2, 3, 4, 5]),
    S: pick([3, 4, 5, 6, 8, 10, 12]),
    AP: pick([0, -1, -2, -3]),
    D: pick([1, 2, 3, 6]),
    T: pick([3, 4, 5, 6, 9, 11]),
    Sv: pick([2, 3, 4, 5, 6]),
    inv: pick([null, null, 4, 5]),
    W: pick([1, 2, 3, 12]),
    mods,
  };
}

describe("damage maths vs an independent reference", () => {
  it("no modifiers: every stat combination matches", () => {
    const r = rng(1);
    for (let i = 0; i < 300; i++) {
      const k = { ...randomCase(r), mods: {} };
      expect(engine(k), JSON.stringify(k)).toBeCloseTo(reference(k), 6);
    }
  });

  it("random modifier stacks match", () => {
    const r = rng(42);
    const misses: string[] = [];
    for (let i = 0; i < 1000; i++) {
      const k = randomCase(r);
      const want = reference(k);
      const got = engine(k);
      if (Math.abs(got - want) > 1e-6) {
        misses.push(`${JSON.stringify(k)} engine=${got.toFixed(4)} ref=${want.toFixed(4)}`);
      }
    }
    expect(misses.slice(0, 10), `${misses.length} mismatches`).toEqual([]);
  });

  it("hand-worked anchor: 10 storm bolters (2A BS3 S4 AP0 D1) vs 10 guardsmen", () => {
    // 20 attacks × 4/6 hit × 4/6 wound (S4 v T3 = 3+) × 4/6 fail (5+ save) = 5.93
    const k: Case = {
      models: 10, A: 2, skill: 3, S: 4, AP: 0, D: 1, T: 3, Sv: 5, inv: null, W: 1, mods: {},
    };
    expect(engine(k)).toBeCloseTo(20 * (4 / 6) * (4 / 6) * (4 / 6), 6);
  });
});

describe("target conditions", () => {
  const kw = (...k: string[]) => k.map((s) => s.toLowerCase());
  it("splits vehicles/monsters from everything else", () => {
    expect(targetMatches("vehicle-monster", kw("Vehicle", "Walker"))).toBe(true);
    expect(targetMatches("vehicle-monster", kw("Monster"))).toBe(true);
    expect(targetMatches("vehicle-monster", kw("Infantry"))).toBe(false);
    expect(targetMatches("not-vehicle-monster", kw("Infantry"))).toBe(true);
    expect(targetMatches("not-vehicle-monster", kw("Monster", "Character"))).toBe(false);
    expect(targetMatches("infantry", kw("Infantry", "Battleline"))).toBe(true);
    expect(targetMatches("all", [])).toBe(true);
  });
});

// ——— kills: a dice-rolling simulation ———

/**
 * Rolls every die: hits (re-rolls, crits, Sustained, Lethal), wounds (Dev
 * Wounds → mortals), saves, damage (rolled per wound), FNP per point, and
 * allocates wounds model by model with overkill wasted (mortals spill).
 */
function simulateKills(
  k: Case & { Dstat?: string; fnp?: number },
  trials: number,
  r: () => number,
): number {
  const d6 = () => 1 + Math.floor(r() * 6);
  const m = k.mods;
  const rollWithRr = (need: number, rr: "none" | "ones" | "all") => {
    let roll = d6();
    const ok = (x: number) => x !== 1 && (x === 6 || x >= need);
    if ((rr === "ones" && roll === 1) || (rr === "all" && !ok(roll))) roll = d6();
    return { ok: ok(roll), crit: roll === 6 };
  };
  const hitRr = "rr-hit" in m ? "all" : "rr1-hit" in m ? "ones" : "none";
  const woundRr =
    "rr-wound" in m || "twin-linked" in m ? "all" : "rr1-wound" in m ? "ones" : "none";
  const hitNeed = k.skill - clamp(m.hit ?? 0, -1, 1);
  const S = k.S + (m.strength ?? 0);
  const T = Math.max(1, k.T - (m["target-toughness"] ?? 0));
  const woundNeedMod = woundNeed(S, T) - clamp(m.wound ?? 0, -1, 1);
  let saveNeed = k.Sv - (k.AP - (m.ap ?? 0));
  if (k.inv != null) saveNeed = Math.min(saveNeed, k.inv);
  const rollD = () => {
    const base = k.Dstat === "D3" ? 1 + Math.floor(r() * 3) : k.Dstat === "D6" ? d6() : k.D;
    let d = base + (m.damage ?? 0);
    if (k.fnp) for (let i = d; i > 0; i--) if (d6() >= k.fnp) d--;
    return d;
  };

  let total = 0;
  for (let t = 0; t < trials; t++) {
    const savable: number[] = [];
    let mortals = 0;
    const attacks = k.models * (k.A + (m.attacks ?? 0));
    for (let a = 0; a < attacks; a++) {
      const hit = rollWithRr(hitNeed, hitRr);
      if (!hit.ok) continue;
      let toWound = 1;
      if (hit.crit) {
        toWound += m["sustained-hits"] ?? 0;
        if ("lethal-hits" in m) {
          toWound -= 1;
          savable.push(1);
        }
      }
      for (let w = 0; w < toWound; w++) {
        const wound = rollWithRr(woundNeedMod, woundRr);
        if (!wound.ok) continue;
        if (wound.crit && "dev-wounds" in m) mortals += 1;
        else savable.push(1);
      }
    }
    let kills = 0;
    let left = k.W;
    for (let i = 0; i < savable.length && kills < MODELS; i++) {
      const save = d6();
      if (saveNeed < 7 && save !== 1 && save >= saveNeed) continue;
      const d = rollD();
      if (d <= 0) continue;
      if (d >= left) {
        kills++;
        left = k.W;
      } else left -= d;
    }
    let pool = 0;
    for (let i = 0; i < mortals; i++) pool += rollD();
    while (pool > 0 && kills < MODELS) {
      const take = Math.min(pool, left);
      pool -= take;
      left -= take;
      if (left === 0) {
        kills++;
        left = k.W;
      }
    }
    total += kills;
  }
  return total / trials;
}

describe("kills vs a dice simulation", () => {
  const base: Case = {
    models: 5, A: 2, skill: 3, S: 5, AP: -1, D: 1, T: 4, Sv: 3, inv: null, W: 1, mods: {},
  };
  const cases: (Case & { Dstat?: string; fnp?: number; name: string })[] = [
    { ...base, name: "D1 vs W1" },
    { ...base, D: 6, name: "D6 flat vs W1 (overkill)" },
    { ...base, D: 2, W: 3, name: "D2 vs W3" },
    { ...base, D: 3, W: 2, name: "D3 vs W2" },
    { ...base, Dstat: "D3", W: 2, name: "rolled D3 vs W2" },
    { ...base, Dstat: "D6", W: 3, models: 10, name: "rolled D6 vs W3" },
    { ...base, D: 2, W: 3, fnp: 5, name: "D2 vs W3, 5+ FNP" },
    { ...base, D: 2, W: 2, mods: { "dev-wounds": 0, "sustained-hits": 1 }, name: "dev + sustained" },
    { ...base, models: 10, A: 3, D: 1, W: 1, mods: { "lethal-hits": 0 }, name: "near wipe W1 (cap)" },
    { ...base, D: 1, W: 12, models: 10, name: "D1 vs W12 vehicle" },
  ];
  const r = rng(7);
  for (const c of cases) {
    it(c.name, () => {
      const { out } = engineRun(c);
      const ctx = { phase: "shooting" as const };
      const got = lineKills(c.Dstat ?? c.D, out, ctx as never, c.W, MODELS);
      const sim = simulateKills(c, 20000, r);
      expect(Math.abs(got - sim)).toBeLessThan(Math.max(0.05, sim * 0.05));
    });
  }
});
