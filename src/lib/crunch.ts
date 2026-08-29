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
} from "@alpaca-software/40kdc-data";
import type { Data40k } from "./data";
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

/** All standard target profiles the dataset ships, resolved to live units. */
export function standardTargets(data: Data40k): ResolvedTarget[] {
  return data.dataset.targetProfiles.all
    .map((p) => data.resolveTarget(data.dataset, p))
    .filter((t): t is ResolvedTarget => t !== null);
}

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
}

export interface TargetOutput {
  target: ResolvedTarget;
  damage: number;
  kills: number;
  weapons: WeaponOutput[];
}

/**
 * Expected output of the combined unit against one target. For each weapon
 * line, phase-matching profiles are crunched with the chosen buff stack (a
 * dual-mode weapon fires its best profile per target — the choice a player
 * makes); damage sums across lines, kills = min(models, damage / W).
 */
export function unitOutput(
  data: Data40k,
  members: CrunchMember[],
  factionId: string | null,
  chosen: Buff[],
  ctx: EngineContext,
  target: ResolvedTarget,
): TargetOutput {
  const wantMelee = ctx.phase === "fight";
  const defensive = data.dataset.defensiveBuffsFor(
    { unitId: target.unitRaw.id, factionId: target.unitRaw.faction_id },
    ctx,
  );
  const weapons: WeaponOutput[] = [];
  let damage = 0;

  for (const member of members) {
    for (const line of member.lines) {
      const weapon = byId(data.weapons, line.weaponId, factionId);
      if (!weapon) continue;
      // Weapon-keyword buffs ride with their own weapon — filter out levers
      // sourced from a different weapon so e.g. one gun's Sustained Hits grant
      // doesn't buff the whole loadout.
      const stack = [
        ...chosen.filter(
          (b) => b.source.kind !== "weapon-keyword" || b.source.weaponId === weapon.id,
        ),
        ...defensive,
      ];
      let best: { damage: number; profileName: string | null } | null = null;
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
        if (!best || dmg > best.damage) {
          best = {
            damage: dmg,
            profileName: weapon.raw.profiles.length > 1 ? profile.name : null,
          };
        }
      });
      if (!best) continue; // no profile for this phase
      const picked: { damage: number; profileName: string | null } = best;
      damage += picked.damage;
      weapons.push({
        weaponId: weapon.id,
        weaponName: weapon.name,
        profileName: picked.profileName,
        count: line.count,
        damage: picked.damage,
      });
    }
  }

  weapons.sort((a, b) => b.damage - a.damage);
  const wounds = Number(target.unitRaw.profiles[0]?.W) || 1;
  const kills = Math.min(target.modelCount, damage / wounds);
  return { target, damage, kills, weapons };
}

/** Quick manual levers for effects the data can't express yet. */
export interface ManualToggle {
  id: string;
  label: string;
  buff: Buff;
}

function manual(id: string, label: string, contribution: Buff["contribution"]): ManualToggle {
  return { id, label, buff: { source: { kind: "manual", label }, contribution } };
}

export const MANUAL_TOGGLES: ManualToggle[] = [
  manual("hit-plus-1", "+1 to Hit", { type: "hit-mod", value: 1 }),
  manual("wound-plus-1", "+1 to Wound", { type: "wound-mod", value: 1 }),
  manual("rr1-hit", "RR1s Hit", { type: "reroll", roll: "hit", subset: "ones" }),
  manual("rr-hit", "RR Hits", { type: "reroll", roll: "hit", subset: "all-failures" }),
  manual("rr1-wound", "RR1s Wound", { type: "reroll", roll: "wound", subset: "ones" }),
  manual("rr-wound", "RR Wounds", { type: "reroll", roll: "wound", subset: "all-failures" }),
  manual("attacks-plus-1", "+1 A", { type: "attacks-mod", value: 1 }),
  manual("strength-plus-1", "+1 S", { type: "strength-mod", value: 1 }),
  manual("lethal-hits", "Lethal Hits", {
    type: "extra-keyword",
    keywordRef: { keyword_id: "lethal-hits" },
  }),
  manual("sustained-1", "Sustained 1", {
    type: "extra-keyword",
    keywordRef: { keyword_id: "sustained-hits", parameters: { value: 1 } },
  }),
  manual("dev-wounds", "Dev Wounds", {
    type: "extra-keyword",
    keywordRef: { keyword_id: "devastating-wounds" },
  }),
];
