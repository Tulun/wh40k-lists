/**
 * Compiles the human-shaped editable model (codex-model.ts) into the data
 * package's normalized record shapes, ready for the merge layer.
 *
 * Ability prose: the package's ability DSL has no free-text node, so every
 * compiled ability carries a placeholder structured effect plus the real
 * (paraphrased) text in the non-schema `leak_text` field, which `abilityText`
 * in describe.ts prefers at render time. The `leak-provisional` dataslate
 * makes the existing ⚠ provisional badge fire on everything hand-authored.
 *
 * Only types are imported from the package; the caller supplies whatever
 * runtime values are needed (the known weapon-keyword catalog ids).
 */
import type {
  AbilityDSLEntry,
  Detachment,
  Enhancement,
  Faction,
  LeaderAttachment,
  Stratagem,
  Unit,
  UnitComposition,
  WargearOption,
  Weapon,
  WeaponKeyword,
} from "@alpaca-software/40kdc-data";
import type {
  EditableDatasheet,
  EditableDetachment,
  EditableWeapon,
  PatchFaction,
  ReplaceFaction,
} from "./codex-model";
import { slugify } from "./codex-model";

export const CODEX_GAME_VERSION = { edition: "11th", dataslate: "leak-provisional" } as const;
type GV = Unit["game_version"];
const GV_REF = CODEX_GAME_VERSION as unknown as GV;

export type CompiledAbility = AbilityDSLEntry & { leak_text: string };

/** Everything one compiled faction (or patch set) contributes to the dataset. */
export interface CompiledRecords {
  factionId: string;
  faction: Faction | null;
  units: Unit[];
  weapons: Weapon[];
  abilities: CompiledAbility[];
  detachments: Detachment[];
  enhancements: Enhancement[];
  stratagems: Stratagem[];
  leaderAttachments: LeaderAttachment[];
  wargearOptions: WargearOption[];
  unitCompositions: UnitComposition[];
  /** Ad-hoc catalog entries for hand-typed weapon keywords unknown upstream. */
  weaponKeywords: WeaponKeyword[];
}

/**
 * Parse a display keyword string back into a catalog reference.
 * "Sustained Hits 1" → sustained-hits {value: 1}
 * "Anti-Vehicle 4+"  → anti {target_keyword: "Vehicle", threshold: 4}
 * "Hazardous"        → hazardous
 * "Melta 2"          → melta {value: 2}
 */
export function parseWeaponKeyword(display: string): {
  keyword_id: string;
  name: string;
  parameters?: { value?: number | string; target_keyword?: string; threshold?: number };
} {
  const trimmed = display.trim();
  const anti = /^anti[- ](.+?)\s+(\d)\+$/i.exec(trimmed);
  if (anti) {
    return {
      keyword_id: "anti",
      name: "Anti",
      parameters: { target_keyword: anti[1], threshold: Number(anti[2]) },
    };
  }
  const threshold = /^(.*\S)\s+(\d)\+$/.exec(trimmed);
  if (threshold) {
    return {
      keyword_id: slugify(threshold[1]),
      name: threshold[1],
      parameters: { threshold: Number(threshold[2]) },
    };
  }
  const value = /^(.*\S)\s+(\d+|D\d+(?:\+\d+)?)$/i.exec(trimmed);
  if (value) {
    const n = /^\d+$/.test(value[2]) ? Number(value[2]) : value[2];
    return { keyword_id: slugify(value[1]), name: value[1], parameters: { value: n } };
  }
  return { keyword_id: slugify(trimmed), name: trimmed };
}

function abilityRecord(
  abilityId: string,
  name: string,
  text: string,
  abilityType: NonNullable<AbilityDSLEntry["ability_type"]>,
  linkage: Partial<Pick<AbilityDSLEntry, "faction_id" | "detachment_id" | "unit_ids">> = {},
): CompiledAbility {
  return {
    ability_id: abilityId,
    name,
    authored_by: "codex-editor",
    ability_type: abilityType,
    effect: { type: "rule-state", target: "self" } as AbilityDSLEntry["effect"],
    scope: { range: "self", duration: "permanent" },
    game_version: GV_REF,
    leak_text: text,
    ...linkage,
  };
}

function compileWeapon(unitId: string, weapon: EditableWeapon, out: CompiledRecords): string {
  // Dual-mode weapons are transcribed as two same-named entries (Snagga Klaw
  // 12" + Snagga Klaw melee). Slug collisions would give both the same id and
  // the id lookup silently drops one — suffix by type, then ordinal.
  let id = `${unitId}--${slugify(weapon.name)}`;
  if (out.weapons.some((w) => w.id === id)) id = `${id}--${weapon.type}`;
  for (let n = 2; out.weapons.some((w) => w.id === id); n++) {
    id = `${unitId}--${slugify(weapon.name)}--${weapon.type}-${n}`;
  }
  const knownNames = new Map<string, string>();
  const profiles = weapon.profiles.map((p) => {
    const stats: Record<string, number | string | null> = {
      A: p.A,
      S: p.S,
      AP: p.AP,
      D: p.D,
    };
    if (weapon.type === "melee") stats.WS = p.skill;
    else stats.BS = p.skill;
    return {
      name: p.name ?? weapon.name,
      range: weapon.type === "melee" ? ("Melee" as const) : p.range,
      stats,
      keywords: p.keywords
        .filter((k) => k.trim())
        .map((display) => {
          const parsed = parseWeaponKeyword(display);
          knownNames.set(parsed.keyword_id, parsed.name);
          return { keyword_id: parsed.keyword_id, parameters: parsed.parameters };
        }),
    };
  });
  out.weapons.push({
    id,
    name: weapon.name,
    type: weapon.type,
    profiles: profiles as Weapon["profiles"],
    game_version: GV_REF,
  });
  for (const [keywordId, name] of knownNames) {
    out.weaponKeywords.push({ id: keywordId, name, game_version: GV_REF } as WeaponKeyword);
  }
  return id;
}

/**
 * Weapon name (lowercased) → the id(s) compileWeapon mints for it. Dual-mode
 * weapons are two same-named entries with distinct ids; a name reference in
 * composition or a wargear option means the physical weapon, i.e. every mode.
 */
function weaponIdsByName(sheet: EditableDatasheet): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const minted = new Set<string>();
  for (const w of sheet.weapons) {
    let id = `${sheet.id}--${slugify(w.name)}`;
    if (minted.has(id)) id = `${id}--${w.type}`;
    for (let n = 2; minted.has(id); n++) id = `${sheet.id}--${slugify(w.name)}--${w.type}-${n}`;
    minted.add(id);
    const key = w.name.trim().toLowerCase();
    map.set(key, [...(map.get(key) ?? []), id]);
  }
  return map;
}

/**
 * Name-based wargear options → normalized WargearOption records. Names resolve
 * against the sheet's own weapons (same ids compileWeapon mints, all modes of a
 * dual-mode weapon); an option naming an unknown weapon is skipped rather than
 * emitting a dangling ref.
 */
function compileWargearOptions(sheet: EditableDatasheet, out: CompiledRecords): void {
  const idsByName = weaponIdsByName(sheet);
  const resolve = (names: string[]): string[] | null => {
    const ids = names.map((n) => idsByName.get(n.trim().toLowerCase()));
    return ids.every((id): id is string[] => !!id) ? ids.flat() : null;
  };
  (sheet.wargearOptions ?? []).forEach((opt, i) => {
    const replaces = resolve(opt.replaces);
    const branches = opt.choices.map(resolve);
    if (!replaces || branches.length === 0 || branches.some((b) => !b || b.length === 0)) return;
    const constraint: NonNullable<WargearOption["model_constraint"]> = {};
    if (opt.modelName?.trim()) constraint.model_name = opt.modelName.trim();
    if (opt.limit.kind === "any") constraint.any_number = true;
    else if (opt.limit.kind === "per-models") constraint.per_n_models = opt.limit.n;
    else constraint.max_count = opt.limit.n;
    const record = {
      id: `${sheet.id}--wargear-option-${i + 1}`,
      unit_id: sheet.id,
      faction_id: out.factionId,
      model_constraint: constraint,
      ...(replaces.length > 0 ? { replaces } : {}),
      ...(branches.length === 1
        ? { replacement: branches[0] }
        : { replacement_choice: branches }),
      game_version: GV_REF,
    } as unknown as WargearOption;
    out.wargearOptions.push(record);
  });
}

function compileComposition(factionId: string, sheet: EditableDatasheet, out: CompiledRecords): void {
  const rows = sheet.composition ?? [];
  if (rows.length === 0) return;
  const idsByName = weaponIdsByName(sheet);
  const models = rows.map((r) => ({
    name: r.name,
    min: r.min,
    max: r.max,
    default_weapon_ids: r.weapons.flatMap((n) => idsByName.get(n.trim().toLowerCase()) ?? []),
  }));
  out.unitCompositions.push({
    unit_id: sheet.id,
    faction_id: factionId,
    models: models as UnitComposition["models"],
    game_version: GV_REF,
  });
}

function compileDatasheet(factionId: string, sheet: EditableDatasheet, out: CompiledRecords): void {
  const weaponIds = sheet.weapons.map((w) => compileWeapon(sheet.id, w, out));
  compileWargearOptions(sheet, out);
  compileComposition(factionId, sheet, out);
  const wargearCosts = sheet.weapons
    .filter((w) => (w.cost ?? 0) > 0)
    .map((w) => ({ item_id: `${sheet.id}--${slugify(w.name)}`, cost: w.cost! }));
  const abilityIds = sheet.abilities.map((a) => {
    const id = `${sheet.id}--${slugify(a.name)}`;
    out.abilities.push(
      abilityRecord(id, a.name, a.text, a.core ? "core" : "unit", { unit_ids: [sheet.id] }),
    );
    return id;
  });
  const models = sheet.points.map((p) => p.models);
  out.units.push({
    id: sheet.id,
    name: sheet.name,
    faction_id: factionId,
    ...(sheet.role ? { role: sheet.role as Unit["role"] } : {}),
    profiles: sheet.profiles.map((p) => ({
      ...(p.name ? { name: p.name } : {}),
      M: p.M,
      T: p.T,
      W: p.W,
      Sv: p.Sv,
      invuln_sv: p.invuln ?? null,
      Ld: p.Ld,
      OC: p.OC,
    })) as Unit["profiles"],
    points: sheet.points.map((p) => ({
      models: p.models,
      cost: p.cost,
      ...(p.fromUnit != null ? { unit_count_min: p.fromUnit } : {}),
      ...(p.toUnit != null ? { unit_count_max: p.toUnit } : {}),
    })),
    ...(wargearCosts.length > 0 ? { wargear_costs: wargearCosts } : {}),
    keywords: sheet.keywords,
    faction_keywords: sheet.factionKeywords,
    ...(models.length > 0
      ? { model_count: { min: Math.min(...models), max: Math.max(...models) } }
      : {}),
    weapon_ids: weaponIds,
    ability_ids: abilityIds,
    ...(sheet.support
      ? { attachment_role: "support" as const }
      : sheet.leads.length > 0
        ? { attachment_role: "leader" as const }
        : {}),
    game_version: GV_REF,
  });
  if (sheet.leads.length > 0) {
    out.leaderAttachments.push({
      leader_id: sheet.id,
      eligible_bodyguard_ids: sheet.leads as LeaderAttachment["eligible_bodyguard_ids"],
      game_version: GV_REF,
    });
  }
}

function compileDetachment(factionId: string, det: EditableDetachment, out: CompiledRecords): void {
  const ruleIds: string[] = [];
  if (det.ruleName.trim() || det.ruleText.trim()) {
    const ruleId = `${det.id}--rule`;
    out.abilities.push(
      abilityRecord(ruleId, det.ruleName.trim() || det.name, det.ruleText, "detachment", {
        detachment_id: det.id,
      }),
    );
    ruleIds.push(ruleId);
  }
  for (const enh of det.enhancements) {
    const abilityId = `${enh.id}--rule`;
    out.abilities.push(
      abilityRecord(abilityId, enh.name, enh.text, "enhancement", { detachment_id: det.id }),
    );
    out.enhancements.push({
      id: enh.id,
      name: enh.name,
      detachment_id: det.id,
      cost: enh.cost,
      ability_id: abilityId,
      ...(enh.restrictions.length > 0 ? { keyword_restrictions: enh.restrictions } : {}),
      ...(enh.exclusions?.length ? { exclusion_keywords: enh.exclusions } : {}),
      ...(enh.upgrade ? { upgrade_tag: true } : {}),
      game_version: GV_REF,
    });
  }
  for (const strat of det.stratagems) {
    const abilityId = `${strat.id}--rule`;
    out.abilities.push(
      abilityRecord(abilityId, strat.name, strat.text, "stratagem", { detachment_id: det.id }),
    );
    out.stratagems.push({
      id: strat.id,
      name: strat.name,
      category: "detachment",
      detachment_id: det.id,
      cp_cost: strat.cpCost,
      phases: strat.phases as Stratagem["phases"],
      player_turn: strat.playerTurn,
      timing: strat.timing,
      ability_id: abilityId,
      ...(strat.requiredKeywords.length > 0
        ? { target_restrictions: { required_keywords: strat.requiredKeywords } }
        : {}),
      game_version: GV_REF,
    });
  }
  out.detachments.push({
    id: det.id,
    name: det.name,
    faction_id: factionId,
    ...(ruleIds.length > 0 ? { detachment_rule_ids: ruleIds } : {}),
    // Older docs predate these fields — tolerate their absence.
    detachment_points: det.points ?? null,
    ...(det.dispositions?.length
      ? { force_dispositions: det.dispositions as Detachment["force_dispositions"] }
      : {}),
    enhancement_ids: det.enhancements.map((e) => e.id),
    stratagem_ids: det.stratagems.map((s) => s.id),
    game_version: GV_REF,
  });
}

function emptyCompiled(factionId: string): CompiledRecords {
  return {
    factionId,
    faction: null,
    units: [],
    weapons: [],
    abilities: [],
    detachments: [],
    enhancements: [],
    stratagems: [],
    leaderAttachments: [],
    wargearOptions: [],
    unitCompositions: [],
    weaponKeywords: [],
  };
}

/**
 * A "replace"-mode faction: the whole hand-authored codex. `fallbackName`
 * (the upstream faction's display name) is used when the entry carries no
 * real name of its own — entries created lazily by the store get the faction
 * id as a placeholder.
 */
export function compileFaction(
  factionId: string,
  entry: ReplaceFaction,
  fallbackName?: string,
): CompiledRecords {
  const out = emptyCompiled(factionId);
  const name = entry.name && entry.name !== factionId ? entry.name : (fallbackName ?? entry.name);
  const factionRuleId = entry.armyRule ? `${factionId}--army-rule` : null;
  if (entry.armyRule && factionRuleId) {
    out.abilities.push(
      abilityRecord(factionRuleId, entry.armyRule.name, entry.armyRule.text, "faction", {
        faction_id: factionId,
      }),
    );
  }
  out.faction = {
    id: factionId,
    name,
    keywords: [name],
    ...(factionRuleId ? { faction_rule_id: factionRuleId } : {}),
    game_version: GV_REF,
  };
  for (const sheet of entry.datasheets) compileDatasheet(factionId, sheet, out);
  for (const det of entry.detachments) compileDetachment(factionId, det, out);
  return out;
}

/**
 * A "patch"-mode faction: full replacement records for just the edited ids.
 * Compiled exactly like replace-mode entities (weapons/abilities become new
 * unit-scoped records) but keeping the upstream ids, so the merge can swap
 * records in place and saved lists keep resolving.
 */
export function compilePatches(factionId: string, entry: PatchFaction): CompiledRecords {
  const out = emptyCompiled(factionId);
  for (const sheet of Object.values(entry.datasheets)) compileDatasheet(factionId, sheet, out);
  for (const det of Object.values(entry.detachments)) compileDetachment(factionId, det, out);
  return out;
}

/** Drop ad-hoc weapon-keyword records whose id already exists upstream. */
export function dedupeWeaponKeywords(
  compiled: CompiledRecords,
  knownIds: ReadonlySet<string>,
): void {
  const seen = new Set<string>(knownIds);
  compiled.weaponKeywords = compiled.weaponKeywords.filter((k) => {
    if (seen.has(k.id)) return false;
    seen.add(k.id);
    return true;
  });
}
