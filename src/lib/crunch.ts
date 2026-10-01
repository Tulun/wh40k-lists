/**
 * Unit damage summary ("what does this block do?"): expected damage and kills
 * for a unit — combined with its attached characters — against the dataset's
 * standard target profiles.
 *
 * Thin wiring over the package's cruncher. Ability buffs come from
 * `Dataset.stackableBuffsFor`, which returns every lever with its default
 * state: always-on abilities arrive `enabled`, player decisions (stratagems,
 * activations) arrive off — the UI just flips them. Damage sums across weapon
 * lines and converts to kills ONCE per target (mirroring the package's
 * `loadoutOutput`; per-weapon kills each cap independently and over-count).
 */
import type {
  Buff,
  EngineContext,
  ResolvedTarget,
  RosterUnit,
  StackableBuff,
  StackableBuffGroup,
  UnitView,
} from "@alpaca-software/40kdc-data";
import type { Data40k } from "./data";
import { expectedKills, landedDamage, mean, statDistribution } from "./kills";
import { byId } from "./lookup";

export type CrunchPhase = "shooting" | "fight";

/** One member of the (possibly combined) unit: a datasheet + its weapon copies. */
export interface CrunchMember {
  unitId: string;
  label: string;
  lines: { weaponId: string; count: number }[];
}

/** Board-state toggles the engine's keyword math reads. */
export interface CrunchSituation {
  phase: CrunchPhase;
  withinHalfRange: boolean;
  stationary: boolean;
  charged: boolean;
  targetInCover: boolean;
}

export const DEFAULT_SITUATION: CrunchSituation = {
  phase: "shooting",
  withinHalfRange: false,
  stationary: false,
  charged: false,
  targetInCover: false,
};

/** Board-state chips: label + which situation field they flip. */
export const SITUATION_TOGGLES: { key: keyof Omit<CrunchSituation, "phase">; label: string }[] = [
  { key: "withinHalfRange", label: "Half range" },
  { key: "stationary", label: "Stationary" },
  { key: "targetInCover", label: "Target in cover" },
  { key: "charged", label: "Charged" },
];

/**
 * Build a member from a roster unit: every wargear line that resolves to a
 * weapon record, with its squad-wide copy count. Returns null for unresolved
 * units (no datasheet id — nothing to crunch).
 */
export function memberFromRosterUnit(
  data: Data40k,
  unit: RosterUnit,
  factionId: string | null,
): CrunchMember | null {
  if (!unit.ref.id) return null;
  const lines: CrunchMember["lines"] = [];
  for (const item of unit.wargear) {
    if (!item.ref.id || item.count <= 0) continue;
    const weapon = byId(data.weapons, item.ref.id, factionId);
    if (!weapon) continue; // non-weapon wargear (grots, force fields…)
    lines.push({ weaponId: weapon.id, count: item.count });
  }
  return { unitId: unit.ref.id, label: unit.ref.raw_name, lines };
}

/**
 * Any dataset unit as a crunch target — the crunch lab's "pick a datasheet"
 * defender. Same shape the standard profiles resolve to, so `unitOutput`
 * (and its defensive-buff wiring) treats both identically.
 */
export function targetFromUnit(unit: UnitView, modelCount: number): ResolvedTarget {
  return {
    profileId: unit.raw.id,
    profileName: unit.name,
    unitRaw: unit.raw,
    modelCount,
  };
}

/**
 * A member from an explicit weapon-count map (the crunch lab's editable
 * loadout). Non-weapon ids (grots, force fields…) are dropped, mirroring
 * `memberFromRosterUnit`.
 */
export function memberFromCounts(
  data: Data40k,
  unitId: string,
  label: string,
  counts: ReadonlyMap<string, number>,
  factionId: string | null,
): CrunchMember {
  const lines: CrunchMember["lines"] = [];
  for (const [id, count] of counts) {
    if (count <= 0) continue;
    const weapon = byId(data.weapons, id, factionId);
    if (!weapon) continue;
    lines.push({ weaponId: weapon.id, count });
  }
  return { unitId, label, lines };
}

/** All standard target profiles the dataset ships, resolved to live units. */
export function standardTargets(data: Data40k): ResolvedTarget[] {
  return data.dataset.targetProfiles.all
    .map((p) => data.resolveTarget(data.dataset, p))
    .filter((t): t is ResolvedTarget => t !== null);
}

/**
 * The classic benchmark five (GEQ/MEQ/TEQ/VEQ/KEQ) — the collapsed default;
 * the full standard-target list sits behind a "show all" toggle.
 */
export const CORE_TARGET_IDS = new Set([
  "geq-guardsmen",
  "meq-intercessors",
  "teq-terminators",
  "rhino",
  "questoris-knight",
]);

function unitKeywordsLower(data: Data40k, unitId: string, factionId: string | null): string[] {
  const raw = byId(data.units, unitId, factionId)?.raw;
  if (!raw) return [];
  return [...(raw.keywords ?? []), ...(raw.faction_keywords ?? [])].map((k) =>
    String(k).toLowerCase(),
  );
}

export function engineContext(
  data: Data40k,
  members: CrunchMember[],
  factionId: string | null,
  sit: CrunchSituation,
): EngineContext {
  return {
    phase: sit.phase,
    attackerStationary: sit.stationary,
    attackerCharged: sit.charged,
    withinHalfRange: sit.withinHalfRange,
    targetInCover: sit.targetInCover,
    attackerAttached: members.length > 1 ? true : undefined,
    attackerKeywords: [
      ...new Set(members.flatMap((m) => unitKeywordsLower(data, m.unitId, factionId))),
    ],
  };
}

/**
 * Every buff lever for the combined unit: always-on abilities (enabled) plus
 * opt-in stratagems/activations (off). The first member is the unit whose page
 * we're on; the rest are pooled in as attached-unit members.
 */
export function crunchLevers(
  data: Data40k,
  members: CrunchMember[],
  factionId: string | null,
  detachmentId: string | undefined,
  ctx: EngineContext,
): { buffs: StackableBuff[]; groups: StackableBuffGroup[] } {
  if (members.length === 0) return { buffs: [], groups: [] };
  const weaponProfiles = members.flatMap((m) =>
    m.lines.flatMap((line) => {
      const weapon = byId(data.weapons, line.weaponId, factionId);
      return (weapon?.raw.profiles ?? []).map((_, profileIndex) => ({
        weaponId: line.weaponId,
        profileIndex,
      }));
    }),
  );
  const { buffs, groups } = data.dataset.stackableBuffsFor(
    {
      unitId: members[0].unitId,
      factionId: factionId ?? undefined,
      detachmentId,
      attachedUnitIds: members.slice(1).map((m) => m.unitId),
      weaponProfiles,
    },
    ctx,
  );
  // Intrinsic weapon-keyword levers ("Twin Killsaws keywords") are dropped:
  // `crunch` auto-injects each profile's own keywords, so they'd render as
  // noise chips and double-feed the resolver.
  return { buffs: buffs.filter((b) => b.source.kind !== "weapon-keyword"), groups };
}

export interface WeaponOutput {
  weaponId: string;
  weaponName: string;
  /** Profile that scored best for this target, when the weapon has several. */
  profileName: string | null;
  count: number;
  damage: number;
  /** Expected models slain by this line alone (overkill-aware). */
  kills: number;
  /** This weapon line's own stage flow (its share of the unit totals). */
  flow: StageFlow;
}

/** Expected totals per attack-sequence stage, summed across weapon lines. */
export interface StageFlow {
  attacks: number;
  hits: number;
  wounds: number;
  unsaved: number;
  /** Damage dealt before Feel No Pain. */
  damage: number;
  /** Damage that sticks after FNP — equals `damage` when the target has none. */
  afterFnp: number;
}

function flowFromStages(stages: { name: string; expected: number }[]): StageFlow {
  const flow: StageFlow = { attacks: 0, hits: 0, wounds: 0, unsaved: 0, damage: 0, afterFnp: 0 };
  for (const stage of stages) {
    if (stage.name === "attacks") flow.attacks = stage.expected;
    else if (stage.name === "hits") flow.hits = stage.expected;
    else if (stage.name === "wounds") flow.wounds = stage.expected;
    else if (stage.name === "unsaved") flow.unsaved = stage.expected;
    else if (stage.name === "damage") flow.damage = stage.expected;
    else if (stage.name === "after-fnp") flow.afterFnp = stage.expected;
  }
  return flow;
}

export interface TargetOutput {
  target: ResolvedTarget;
  damage: number;
  kills: number;
  weapons: WeaponOutput[];
  flow: StageFlow;
}

/**
 * Expected output of the combined unit against one target. For each weapon
 * line, phase-matching profiles are crunched with the chosen buff stack (a
 * dual-mode weapon fires its best profile per target — the choice a player
 * makes — the one that kills most); damage sums across lines, and kills sum
 * the lines' overkill-aware kills (see kills.ts), capped at the model count.
 */
export function unitOutput(
  data: Data40k,
  members: CrunchMember[],
  factionId: string | null,
  chosen: ConditionalBuff[],
  ctx: EngineContext,
  target: ResolvedTarget,
): TargetOutput {
  const wantMelee = ctx.phase === "fight";
  const targetKeywords = (target.unitRaw.keywords ?? []).map((k) => String(k).toLowerCase());
  const vsTarget = chosen
    .filter((b) => targetMatches(b.vs ?? "all", targetKeywords))
    .map(({ vs: _vs, ...buff }) => buff as Buff);
  const defensive = data.dataset.defensiveBuffsFor(
    { unitId: target.unitRaw.id, factionId: target.unitRaw.faction_id },
    ctx,
  );
  const weapons: WeaponOutput[] = [];
  const flow: StageFlow = { attacks: 0, hits: 0, wounds: 0, unsaved: 0, damage: 0, afterFnp: 0 };
  let damage = 0;
  let kills = 0;
  const W = Number(target.unitRaw.profiles[0]?.W) || 1;

  for (const member of members) {
    for (const line of member.lines) {
      const weapon = byId(data.weapons, line.weaponId, factionId);
      if (!weapon) continue;
      // Weapon-keyword buffs ride with their own weapon — filter out levers
      // sourced from a different weapon so e.g. one gun's Sustained Hits grant
      // doesn't buff the whole loadout.
      const stack = [
        ...vsTarget.filter(
          (b) => b.source.kind !== "weapon-keyword" || b.source.weaponId === weapon.id,
        ),
        ...defensive,
      ];
      type Best = {
        damage: number;
        kills: number;
        profileName: string | null;
        stages: { name: string; expected: number }[];
      };
      let best: Best | null = null;
      weapon.raw.profiles.forEach((profile, profileIndex) => {
        if (data.isMeleeProfile(profile) !== wantMelee) return;
        const out = data.crunch(
          {
            attacker: { weapon: weapon.raw, profileIndex },
            target: {
              unit: target.unitRaw,
              profileIndex: 0,
              modelCount: target.modelCount,
            },
            modelsFiring: line.count,
            buffs: stack,
            context: ctx,
          },
          data.dataset,
        );
        const dmg = out.stages.find((s) => s.name === "after-fnp")?.expected ?? 0;
        const k = lineKills(profile.stats.D, out, ctx, W, target.modelCount);
        if (!best || k > best.kills || (k === best.kills && dmg > best.damage)) {
          best = {
            damage: dmg,
            kills: k,
            profileName: weapon.raw.profiles.length > 1 ? profile.name : null,
            stages: out.stages,
          };
        }
      });
      if (!best) continue; // no profile for this phase
      const picked: Best = best;
      damage += picked.damage;
      kills += picked.kills;
      const weaponFlow = flowFromStages(picked.stages);
      flow.attacks += weaponFlow.attacks;
      flow.hits += weaponFlow.hits;
      flow.wounds += weaponFlow.wounds;
      flow.unsaved += weaponFlow.unsaved;
      flow.damage += weaponFlow.damage;
      flow.afterFnp += weaponFlow.afterFnp;
      weapons.push({
        weaponId: weapon.id,
        weaponName: weapon.name,
        profileName: picked.profileName,
        count: line.count,
        damage: picked.damage,
        kills: picked.kills,
        flow: weaponFlow,
      });
    }
  }

  weapons.sort((a, b) => b.damage - a.damage);
  return { target, damage, kills: Math.min(target.modelCount, kills), weapons, flow };
}

/**
 * Overkill-aware kills for one crunched profile. Rebuilds the per-wound
 * damage distribution from the engine's resolved modifiers (the engine itself
 * only carries the mean), then splits its damage into the savable stream and
 * the spilling mortal stream.
 */
export function lineKills(
  dStat: unknown,
  out: ReturnType<Data40k["crunch"]>,
  ctx: EngineContext,
  W: number,
  models: number,
): number {
  const stage = (name: string) => out.stages.find((s) => s.name === name)?.expected ?? 0;
  const r = out.resolved;
  const melta = r.extraKeywords.find((k) => k.keywordRef.keyword_id === "melta");
  const bonus =
    r.damageMod.value +
    (melta && ctx.withinHalfRange ? Number(melta.keywordRef.parameters?.value) || 0 : 0);
  const reduction = r.damageReduction.value;
  const fnp = (t: { threshold: number } | null) =>
    t ? 1 - Math.max(0, Math.min(1, (7 - t.threshold) / 6)) : 1;
  const pSurvive = fnp(r.feelNoPain);
  const base = statDistribution(dStat);

  // The engine's own mean damage per wound, to back out the mortal stream.
  const before = Math.max(0, mean(base) + bonus);
  const perWound = reduction > 0 ? Math.max(1, before - reduction) : before;
  const unsaved = stage("unsaved");
  const mortalDamage = Math.max(0, stage("after-fnp") - unsaved * perWound * pSurvive);

  return expectedKills({
    unsaved,
    mortalDamage,
    damage: landedDamage(base, { bonus, reduction, pSurvive }),
    W,
    models,
  });
}

/**
 * Manual modifiers for effects the data can't express yet (or the player just
 * wants to try). Each is on/off, or carries an adjustable value — "+2 S",
 * "Sustained Hits 2" — since plenty of abilities move a stat by more than 1.
 */
export interface ModifierDef {
  id: string;
  label: string;
  group: "Stats" | "Rolls" | "Re-rolls" | "Keywords" | "Target";
  /** Adjustable value range; absent = a plain on/off modifier. */
  range?: { min: number; max: number; initial: number };
  /** Chip text at a value; defaults to the label. */
  format?: (value: number) => string;
  /** Extra search terms ("AP", "pierce"). */
  aliases?: string;
  contribution: (value: number) => Buff["contribution"];
}

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const keyword = (keyword_id: string, parameters?: Record<string, unknown>) => ({
  type: "extra-keyword" as const,
  keywordRef: parameters ? { keyword_id, parameters } : { keyword_id },
});

export const MODIFIERS: ModifierDef[] = [
  {
    id: "strength",
    label: "Strength",
    group: "Stats",
    range: { min: 1, max: 10, initial: 1 },
    format: (v) => `${signed(v)} S`,
    contribution: (value) => ({ type: "strength-mod", value }),
  },
  {
    id: "attacks",
    label: "Attacks",
    group: "Stats",
    range: { min: 1, max: 10, initial: 1 },
    format: (v) => `${signed(v)} A`,
    contribution: (value) => ({ type: "attacks-mod", value }),
  },
  {
    id: "ap",
    label: "Armour Penetration",
    group: "Stats",
    aliases: "ap improve pierce",
    range: { min: 1, max: 4, initial: 1 },
    format: (v) => `AP improved by ${v}`,
    // AP is signed against the save: −1 is one step more piercing.
    contribution: (value) => ({ type: "ap-mod", value: -value }),
  },
  {
    id: "damage",
    label: "Damage",
    group: "Stats",
    range: { min: 1, max: 6, initial: 1 },
    format: (v) => `${signed(v)} D`,
    contribution: (value) => ({ type: "damage-mod", value }),
  },
  {
    id: "hit",
    label: "Hit roll",
    group: "Rolls",
    range: { min: -1, max: 1, initial: 1 },
    format: (v) => `${signed(v)} to Hit`,
    contribution: (value) => ({ type: "hit-mod", value }),
  },
  {
    id: "wound",
    label: "Wound roll",
    group: "Rolls",
    aliases: "lance",
    range: { min: -1, max: 1, initial: 1 },
    format: (v) => `${signed(v)} to Wound`,
    contribution: (value) => ({ type: "wound-mod", value }),
  },
  {
    id: "rr1-hit",
    label: "Re-roll Hit rolls of 1",
    group: "Re-rolls",
    aliases: "rr1",
    contribution: () => ({ type: "reroll", roll: "hit", subset: "ones" }),
  },
  {
    id: "rr-hit",
    label: "Re-roll Hit rolls",
    group: "Re-rolls",
    aliases: "rr full",
    contribution: () => ({ type: "reroll", roll: "hit", subset: "all-failures" }),
  },
  {
    id: "rr1-wound",
    label: "Re-roll Wound rolls of 1",
    group: "Re-rolls",
    aliases: "rr1",
    contribution: () => ({ type: "reroll", roll: "wound", subset: "ones" }),
  },
  {
    id: "rr-wound",
    label: "Re-roll Wound rolls",
    group: "Re-rolls",
    aliases: "rr full",
    contribution: () => ({ type: "reroll", roll: "wound", subset: "all-failures" }),
  },
  {
    id: "lethal-hits",
    label: "Lethal Hits",
    group: "Keywords",
    contribution: () => keyword("lethal-hits"),
  },
  {
    id: "sustained-hits",
    label: "Sustained Hits",
    group: "Keywords",
    range: { min: 1, max: 3, initial: 1 },
    format: (v) => `Sustained Hits ${v}`,
    contribution: (value) => keyword("sustained-hits", { value }),
  },
  {
    id: "dev-wounds",
    label: "Devastating Wounds",
    group: "Keywords",
    aliases: "dev",
    contribution: () => keyword("devastating-wounds"),
  },
  {
    id: "twin-linked",
    label: "Twin-linked",
    group: "Keywords",
    // Spelled out as its effect: the engine only expands catalog keywords
    // printed on the profile, so an extra-keyword Twin-linked would be inert.
    contribution: () => ({ type: "reroll", roll: "wound", subset: "all-failures" }),
  },
  {
    id: "melta",
    label: "Melta",
    group: "Keywords",
    range: { min: 1, max: 6, initial: 2 },
    format: (v) => `Melta ${v}`,
    contribution: (value) => keyword("melta", { value }),
  },
  {
    id: "ignores-cover",
    label: "Ignores Cover",
    group: "Keywords",
    contribution: () => keyword("ignores-cover"),
  },
  {
    id: "target-toughness",
    label: "Target Toughness",
    group: "Target",
    aliases: "t minus",
    range: { min: 1, max: 4, initial: 1 },
    format: (v) => `Target −${v} T`,
    contribution: (value) => ({ type: "toughness-mod", value: -value }),
  },
];

/**
 * Which targets a modifier applies against — 11e abilities often grant e.g.
 * Lethal Hits only vs non-VEHICLE/MONSTER targets. The package's gate can only
 * REQUIRE a keyword, so `unitOutput` filters these per target itself.
 */
export type TargetCondition = "all" | "vehicle-monster" | "not-vehicle-monster" | "infantry";

export const TARGET_CONDITIONS: { id: TargetCondition; label: string }[] = [
  { id: "all", label: "vs all" },
  { id: "vehicle-monster", label: "vs VEH/MON" },
  { id: "not-vehicle-monster", label: "vs non-VEH/MON" },
  { id: "infantry", label: "vs INFANTRY" },
];

export function targetMatches(cond: TargetCondition, targetKeywords: string[]): boolean {
  const has = (k: string) => targetKeywords.includes(k);
  switch (cond) {
    case "all":
      return true;
    case "vehicle-monster":
      return has("vehicle") || has("monster");
    case "not-vehicle-monster":
      return !has("vehicle") && !has("monster");
    case "infantry":
      return has("infantry");
  }
}

/** A buff that only applies against some targets (manual modifiers). */
export type ConditionalBuff = Buff & { vs?: TargetCondition };

/** One picked modifier: its value (0 for on/off ones) and target condition. */
export interface PickedModifier {
  value: number;
  vs: TargetCondition;
}
export type ModifierState = Record<string, PickedModifier>;

export function modifierLabel(def: ModifierDef, value: number): string {
  return def.range && def.format ? def.format(value) : def.label;
}

export function modifierBuffs(state: ModifierState): ConditionalBuff[] {
  return MODIFIERS.filter((m) => m.id in state).map((m) => {
    const { value, vs } = state[m.id];
    const label = modifierLabel(m, value);
    return { source: { kind: "manual", label }, contribution: m.contribution(value), vs };
  });
}
