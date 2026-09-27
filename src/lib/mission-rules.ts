/**
 * Plain-English scoring rows for 11e primary mission cards, built from the
 * dataset's structured `awards` (our own wording — no GW rules text). The
 * card's community-written `text` summary sits alongside these.
 */
import type { Data40k } from "./data";

interface Trigger {
  timing?: string;
  phase?: string;
  player_turn?: string;
  battle_round?: { min?: number; max?: number };
}

interface Condition {
  type?: string;
  parameters?: Record<string, unknown>;
  operator?: string;
  operands?: Condition[];
}

interface Award {
  trigger?: Trigger;
  when?: Condition;
  vp?: number;
  vp_per?: number;
  per?: string;
  cumulative?: boolean;
  exclusive_group?: string;
}

export interface ScoringRow {
  when: string;
  condition: string;
  vp: string;
  /** Stacks on top of the row before it. */
  cumulative: boolean;
  /** Tiered rows where only the best one scores share a group id. */
  exclusiveGroup?: string;
}

export interface PrimaryRules {
  id: string;
  name: string;
  /** Community summary with its "X against Y." matchup preamble dropped. */
  summary?: string;
  rows: ScoringRow[];
  vpPerRoundCap?: number;
  vpPerGameCap?: number;
}

const humanize = (s: string) => s.replace(/-/g, " ");
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

function describeRounds(r?: { min?: number; max?: number }): string {
  if (!r) return "";
  const { min, max } = r;
  if (min != null && max != null) return min === max ? `round ${min}` : `rounds ${min}–${max}`;
  if (min != null) return `round ${min}+`;
  if (max != null) return `rounds 1–${max}`;
  return "";
}

export function describeTrigger(t: Trigger = {}): string {
  const either = t.player_turn === "either";
  let base: string;
  if (t.timing === "end-of-battle") base = "End of the battle";
  else if (t.timing === "end-of-phase" && t.phase) {
    base = `End of ${either ? "either player's" : "your"} ${t.phase[0].toUpperCase()}${t.phase.slice(1)} phase`;
  } else if (t.timing === "start-of-turn")
    base = either ? "Start of either turn" : "Start of your turn";
  else base = either ? "End of either player's turn" : "End of your turn";
  const rounds = describeRounds(t.battle_round);
  return rounds ? `${base} · ${rounds}` : base;
}

const n = (v: unknown) => (typeof v === "number" ? v : undefined);

/** "1", "1–2", "3+" from count_min/count_max. */
function countRange(p: Record<string, unknown>): string {
  const min = n(p.count_min);
  const max = n(p.count_max);
  if (min != null && max != null) return min === max ? `${min}` : `${min}–${max}`;
  if (min != null) return min === 1 ? "1+" : `${min}+`;
  if (max != null) return `up to ${max}`;
  return "";
}

const plural = (count: string, word: string) => (count === "1" ? word : `${word}s`);

function objectiveNoun(p: Record<string, unknown>): string {
  if (p.objective === "your-home") return "your home objective";
  if (p.objective === "opponent-home") return "the opponent's home objective";
  if (p.objective_role === "central") return "a central objective";
  if (p.objective_role === "expansion") return "an expansion objective";
  return "";
}

export function describeCondition(c: Condition): string {
  if (c.operator && c.operands) {
    const parts = c.operands.map(describeCondition);
    if (c.operator === "not") return `Not: ${parts[0]}`;
    return parts
      .map((x, i) => (i === 0 ? x : lowerFirst(x)))
      .join(c.operator === "or" ? " or " : " and ");
  }
  const p = c.parameters ?? {};
  switch (c.type) {
    case "controls-objective": {
      const noun = objectiveNoun(p);
      if (noun) return `Control ${noun}`;
      const count = countRange(p);
      const nonHome = p.exclude === "home" ? "non-home " : "";
      return count === "1+"
        ? `Control a ${nonHome}objective`
        : `Control ${count} ${nonHome}objectives`;
    }
    case "objective-majority":
      return "Control more objectives than your opponent";
    case "new-objective-controlled":
      return "Take an objective you didn't control at the start of the turn";
    case "units-destroyed":
      return "Destroy an enemy unit this turn";
    case "units-destroyed-comparison":
      return "Destroy more enemy units this turn than you lost last turn";
    case "destroyed-while-on-objective":
      if (p.destroyer_on_objective)
        return "A unit within range of an objective destroys an enemy unit";
      return `Destroy an enemy unit that started the turn on ${
        p.objective_role === "central" ? "a central objective" : "an objective"
      }`;
    case "destroyed-in-tagged-terrain":
      return p.tag
        ? `Destroy an enemy unit that started the turn in ${p.tag} terrain`
        : "Destroy an enemy unit that started the turn in a terrain area";
    case "unit-has-tag":
      return p.window === "left-battlefield-this-turn"
        ? `A ${p.tag} enemy unit leaves the battlefield`
        : `An enemy unit is ${p.tag} this turn`;
    case "objective-has-tag": {
      if (p.objective === "opponent-home") return `The opponent's home objective is ${p.tag}`;
      const count = countRange(p);
      return `${count} ${p.tag} ${plural(count, "objective")}`;
    }
    case "action-completed":
      return `Complete ${humanize(String(p.action_id ?? "the action")).replace(/\b\w/g, (m) => m.toUpperCase())}`;
    case "operation-markers": {
      const whose = p.side === "opponent" ? "the opponent's" : "your";
      if (n(p.count_max) === 0) return `None of ${whose} operation markers remain`;
      if (p.within_range_of === "opponent-home-objective") {
        return `One of ${whose} operation markers is within range of the opponent's home objective`;
      }
      const count = countRange(p);
      const exactly = n(p.count_min) != null && p.count_min === p.count_max ? "Exactly " : "";
      const alone = p.friendly_unit_in_same_terrain_area
        ? ", with a friendly unit alone in its terrain area"
        : "";
      return `${exactly}${count} of ${whose} operation markers left${alone}`;
    }
    case "engagement-fronts":
      return `Units wholly within ${n(p.count_min)} different table quarters`;
    case "territory-control":
      return n(p.enemy_units_max) === 0
        ? "No enemy units wholly within your territory"
        : "Control your territory";
    default:
      return humanize(c.type ?? "condition");
  }
}

const PER: Record<string, string> = {
  "controlled-objective": "objective you control",
  "controlled-non-home-objective": "non-home objective you control",
  "objective-newly-controlled-this-turn": "objective taken this turn",
  "controlled-objective-in-enemy-territory": "objective you control in enemy territory",
  "enemy-unit-destroyed-this-turn": "enemy unit destroyed this turn",
  "friendly-unit-that-committed-sabotage-this-turn": "unit that committed sabotage this turn",
};

export function describePer(per: string): string {
  return PER[per] ?? humanize(per);
}

export function scoringRows(awards: unknown[]): ScoringRow[] {
  return (awards as Award[]).map((a) => ({
    when: describeTrigger(a.trigger),
    // A gated count reads "Control your home objective: each non-home objective you control".
    condition:
      a.when && a.per
        ? `${describeCondition(a.when)}: each ${describePer(a.per)}`
        : a.when
          ? describeCondition(a.when)
          : a.per
            ? `Each ${describePer(a.per)}`
            : "Always",
    vp: a.vp_per != null ? `${a.vp_per} VP each` : `${a.vp ?? 0} VP`,
    cumulative: a.cumulative === true,
    exclusiveGroup: a.exclusive_group,
  }));
}

/** Drop a leading "Take-and-Hold against Disruption." / "Sabotage mirror." sentence. */
export function stripMatchupPreamble(text: string): string {
  return text.replace(/^[A-Za-z-]+ (?:mirror|against [A-Za-z-]+)\.\s*/, "");
}

export function primaryRules(data: Data40k, missionId: string): PrimaryRules | undefined {
  const card = data.missionCards.all.find((c) => c.id === missionId && c.card_type === "primary");
  const mission = data.missions.all.find((m) => m.id === missionId);
  if (!card && !mission) return undefined;
  return {
    id: missionId,
    name: card?.name ?? mission?.name ?? missionId,
    summary: card?.text ? stripMatchupPreamble(card.text) : undefined,
    rows: scoringRows(card?.awards ?? []),
    vpPerRoundCap: mission?.vp_per_round_cap,
    vpPerGameCap: mission?.vp_per_game_cap,
  };
}

/** Mission id a player with `mine` plays against `theirs`. */
export function primaryIdFor(data: Data40k, mine: string, theirs: string): string | undefined {
  return data.missionMatchups.all.find(
    (m) => m.disposition === mine && m.opponent_disposition === theirs,
  )?.mission_id;
}
