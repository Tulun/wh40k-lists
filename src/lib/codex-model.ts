/**
 * The human-shaped editable codex model: what the in-app editor reads and
 * writes, and the single document synced to the user's private gist.
 *
 * Deliberately denormalized — a datasheet owns its weapons and abilities
 * inline, a detachment owns its enhancements and stratagems — because that's
 * how a person transcribing a codex page thinks. `codex-compile.ts` turns it
 * into the package's normalized record shapes for the merge layer.
 *
 * Two faction modes:
 * - "replace": a whole new codex (the leaked Orks book) that supersedes the
 *   upstream faction entirely.
 * - "patch": sparse record-level overrides on an upstream faction (fix stale
 *   points on a Grey Knights sheet) — each edited record is a full editable
 *   copy seeded from upstream, keeping its original id so saved lists resolve.
 *
 * Only types come from the data package (erased at compile time), so this
 * module is safe in the eagerly-loaded shell.
 */
import type { Detachment, Enhancement, Stratagem, UnitView } from "@alpaca-software/40kdc-data";
import { abilityText, weaponKeywordLabel } from "./describe";

export interface EditableProfile {
  name?: string;
  M: number | string;
  T: number;
  W: number;
  Sv: number;
  invuln?: number | null;
  Ld: number;
  OC: number;
}

export interface EditableWeaponProfile {
  name?: string;
  range: number | "Melee";
  A: number | string;
  /** WS for melee, BS for ranged — the weapon's `type` decides which. */
  skill: number | null;
  S: number | string;
  AP: number;
  D: number | string;
  /** Display strings: "Sustained Hits 1", "Anti-Vehicle 4+", "Lethal Hits". */
  keywords: string[];
}

export interface EditableWeapon {
  name: string;
  type: "ranged" | "melee";
  /** MFM surcharge in points charged per copy taken ("each killsaw costs 5"). */
  cost?: number;
  profiles: EditableWeaponProfile[];
}

export interface EditableAbility {
  name: string;
  text: string;
  /** Core abilities (Deep Strike, Scouts…) render as tag chips, not text blocks. */
  core?: boolean;
}

/**
 * One "WARGEAR OPTIONS" bullet from the datasheet, by weapon NAME (resolved to
 * the sheet's own weapon ids at compile time): "This model's Dual Big Shoota
 * can be replaced with 1 Rokkit Launcha" → replaces ["Dual Big Shoota"],
 * choices [["Rokkit Launcha"]]. Two-plus choices = "one of the following".
 */
export interface EditableWargearOption {
  /** Weapon names removed from the model taking the option; empty = pure add-on. */
  replaces: string[];
  /** Alternatives — each branch lists the weapon name(s) added together. */
  choices: string[][];
  /** How often the option may be taken across the unit. */
  limit: { kind: "any" } | { kind: "count"; n: number } | { kind: "per-models"; n: number };
  /** Restrict to one model type by name ("Boss Nob"); undefined = any model. */
  modelName?: string;
}

export interface EditableDatasheet {
  /** Slug id. In patch mode this is the upstream unit id — never change it. */
  id: string;
  name: string;
  role: "" | "character" | "epic-hero" | "battleline" | "dedicated-transport" | "fortification";
  profiles: EditableProfile[];
  keywords: string[];
  factionKeywords: string[];
  points: { models: number; cost: number }[];
  weapons: EditableWeapon[];
  /** Wargear-option bullets; absent on docs saved before the field existed. */
  wargearOptions?: EditableWargearOption[];
  abilities: EditableAbility[];
  /** Datasheet ids this character can lead. */
  leads: string[];
}

export interface EditableEnhancement {
  id: string;
  name: string;
  cost: number;
  text: string;
  /** Keyword restrictions, e.g. ["Character"]. */
  restrictions: string[];
  /** Keywords that bar a unit from taking it, e.g. ["Aircraft"]. */
  exclusions?: string[];
  /** An upgrade taken by a non-character UNIT (11e upgrade_tag), not a character. */
  upgrade?: boolean;
}

export interface EditableStratagem {
  id: string;
  name: string;
  cpCost: number;
  phases: string[];
  playerTurn: "your-turn" | "opponent-turn" | "either";
  timing: "once-per-phase" | "once-per-turn" | "once-per-battle" | "unlimited";
  text: string;
  requiredKeywords: string[];
}

/** The five 11e Force Dispositions. */
export const DISPOSITIONS = [
  { id: "take-and-hold", label: "Take and Hold" },
  { id: "disruption", label: "Disruption" },
  { id: "purge-the-foe", label: "Purge the Foe" },
  { id: "priority-assets", label: "Priority Assets" },
  { id: "reconnaissance", label: "Reconnaissance" },
] as const;

export interface EditableDetachment {
  id: string;
  name: string;
  /** Detachment-point cost (1–3), or null when unknown. */
  points: number | null;
  /** Force Disposition ids this detachment grants (see DISPOSITIONS). */
  dispositions: string[];
  ruleName: string;
  ruleText: string;
  enhancements: EditableEnhancement[];
  stratagems: EditableStratagem[];
}

export interface ReplaceFaction {
  mode: "replace";
  name: string;
  armyRule: { name: string; text: string } | null;
  datasheets: EditableDatasheet[];
  detachments: EditableDetachment[];
}

export interface PatchFaction {
  mode: "patch";
  datasheets: Record<string, EditableDatasheet>;
  detachments: Record<string, EditableDetachment>;
}

export type FactionEntry = ReplaceFaction | PatchFaction;

export interface CodexDoc {
  version: 1;
  /** ISO timestamp of the last mutation — the gist conflict guard compares it. */
  updated: string;
  factions: Record<string, FactionEntry>;
}

export function emptyCodexDoc(): CodexDoc {
  return { version: 1, updated: new Date(0).toISOString(), factions: {} };
}

/** True when the doc has nothing that would change the dataset. */
export function docIsEmpty(doc: CodexDoc): boolean {
  return Object.values(doc.factions).every((f) =>
    f.mode === "replace"
      ? f.datasheets.length === 0 && f.detachments.length === 0 && !f.armyRule
      : Object.keys(f.datasheets).length === 0 && Object.keys(f.detachments).length === 0,
  );
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[''`]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "entry"
  );
}

/** `slugify`, uniquified against ids already in use. */
export function uniqueSlug(name: string, taken: Iterable<string>): string {
  const base = slugify(name);
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`;
    if (!used.has(candidate)) return candidate;
  }
}

/**
 * Editable copy of an upstream unit, for patch-mode "edit this record".
 * `leads` comes from the caller (`dataset.bodyguardsAttachableFrom(id)`) since
 * leader links live outside the unit record.
 */
export function seedDatasheetFromUpstream(view: UnitView, leads: string[] = []): EditableDatasheet {
  const raw = view.raw;
  return {
    id: raw.id,
    name: raw.name,
    role: (raw.role ?? "") as EditableDatasheet["role"],
    profiles: raw.profiles.map((p) => ({
      name: p.name ?? undefined,
      M: p.M,
      T: p.T,
      W: p.W,
      Sv: p.Sv,
      invuln: p.invuln_sv ?? null,
      Ld: p.Ld,
      OC: p.OC,
    })),
    keywords: [...(raw.keywords ?? [])],
    factionKeywords: [...(raw.faction_keywords ?? [])],
    points: (raw.points ?? []).map((p) => ({ models: p.models, cost: p.cost })),
    weapons: view.weapons.map((w) => ({
      name: w.name,
      type: w.raw.type,
      ...(costOf(raw, w.raw.id) != null ? { cost: costOf(raw, w.raw.id)! } : {}),
      profiles: w.raw.profiles.map((p, i) => ({
        name: p.name,
        range: (p.range ?? "Melee") as number | "Melee",
        A: p.stats.A,
        skill: (w.raw.type === "melee" ? p.stats.WS : p.stats.BS) ?? null,
        S: p.stats.S,
        AP: p.stats.AP,
        D: p.stats.D,
        keywords: w.keywordsAt(i).map((k) => weaponKeywordLabel(k.keyword.name, k.parameters)),
      })),
    })),
    wargearOptions: seedWargearOptions(view),
    abilities: view.abilities.map((a) => ({
      name: a.name,
      text: abilityText(a),
      core: a.raw.ability_type === "core" || undefined,
    })),
    leads,
  };
}

function costOf(raw: UnitView["raw"], weaponId: string): number | null {
  return raw.wargear_costs?.find((c) => c.item_id === weaponId)?.cost ?? null;
}

/**
 * Upstream wargear-option records → name-based editable options, so a patched
 * sheet's recompiled weapon ids resolve again. Options referencing weapons the
 * unit doesn't list (shared-chassis oddities) are dropped.
 */
function seedWargearOptions(view: UnitView): EditableWargearOption[] {
  const nameById = new Map(view.weapons.map((w) => [w.raw.id, w.name]));
  const named = (ids: readonly string[]): string[] | null => {
    const names = ids.map((id) => nameById.get(id));
    return names.every((n): n is string => !!n) ? names : null;
  };
  const out: EditableWargearOption[] = [];
  for (const o of view.wargearOptions) {
    const replaces = named(o.replaces ?? []);
    const branches = (o.replacement_choice ?? (o.replacement ? [o.replacement] : []))
      .map((b) => named(b));
    if (!replaces || branches.some((b) => !b) || branches.length === 0) continue;
    const mc = o.model_constraint;
    out.push({
      replaces,
      choices: branches as string[][],
      limit: mc?.any_number
        ? { kind: "any" }
        : mc?.per_n_models
          ? { kind: "per-models", n: mc.per_n_models }
          : { kind: "count", n: mc?.max_count ?? 1 },
      modelName: mc?.model_name || undefined,
    });
  }
  return out;
}

/** Editable copy of an upstream detachment (rule + its enhancements/stratagems). */
export function seedDetachmentFromUpstream(
  detachment: Detachment,
  ruleText: string | null,
  ruleName: string | null,
  enhancements: { record: Enhancement; text: string | null }[],
  stratagems: { record: Stratagem; text: string | null }[],
): EditableDetachment {
  return {
    id: detachment.id,
    name: detachment.name,
    points: detachment.detachment_points ?? null,
    dispositions: [...(detachment.force_dispositions ?? [])],
    ruleName: ruleName ?? "",
    ruleText: ruleText ?? "",
    enhancements: enhancements.map(({ record, text }) => ({
      id: record.id,
      name: record.name,
      cost: record.cost,
      text: text ?? "",
      restrictions: [...(record.keyword_restrictions ?? [])],
    })),
    stratagems: stratagems.map(({ record, text }) => ({
      id: record.id,
      name: record.name,
      cpCost: record.cp_cost,
      phases: [...record.phases],
      playerTurn: record.player_turn as EditableStratagem["playerTurn"],
      timing: record.timing,
      text: text ?? "",
      requiredKeywords: [...(record.target_restrictions?.required_keywords ?? [])],
    })),
  };
}
