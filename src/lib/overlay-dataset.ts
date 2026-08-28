/**
 * Builds the replacement Dataset from the editable codex doc:
 *
 * - "replace" factions go through `buildMergedRaw` — strip every record
 *   belonging to the replaced faction, append the compiled ones.
 * - "patch" factions go through `applyRecordPatches` — swap individual
 *   records in place by id, leaving everything else untouched.
 *
 * All functions are pure over their inputs — the base arrays come from the
 * live embedded dataset and must never be mutated. The runtime `Dataset`
 * class arrives via the loaded module argument (only types are imported), so
 * this file stays out of the lazy 40kdc chunk.
 */
import type { Dataset, RawData } from "@alpaca-software/40kdc-data";
import type { CodexDoc, ReplaceFaction } from "./codex-model";
import type { CompiledRecords } from "./codex-compile";
import { compileFaction, compilePatches, dedupeWeaponKeywords } from "./codex-compile";
import type { Data40k } from "./data";
import { REPLACE_FACTION_IDS } from "./flags";

/** Collections whose `.all` returns wrapper views carrying `.raw`. */
const rawOf = <T>(entry: T | { raw: T }): T =>
  entry && typeof entry === "object" && "raw" in entry ? (entry as { raw: T }).raw : (entry as T);

/** Reassemble a plain RawData from a built Dataset. */
export function rawFromDataset(ds: Dataset): RawData {
  const all = <T>(collection: { all: (T | { raw: T })[] }): T[] => collection.all.map(rawOf);
  return {
    units: all(ds.units),
    targetProfiles: all(ds.targetProfiles),
    weapons: all(ds.weapons),
    weaponKeywords: all(ds.weaponKeywords),
    unitKeywords: all(ds.unitKeywords),
    factions: all(ds.factions),
    abilities: all(ds.abilities),
    phaseMappings: [...ds.phaseMappings],
    detachments: all(ds.detachments),
    alliedRules: all(ds.alliedRules),
    stratagems: all(ds.stratagems),
    enhancements: all(ds.enhancements),
    leaderAttachments: [...ds.leaderAttachments],
    unitCompositions: [...ds.unitCompositions],
    wargearOptions: all(ds.wargearOptions),
    wargear: all(ds.wargear),
    gameVersions: [...ds.gameVersions],
    missions: all(ds.missions),
    missionMatchups: all(ds.missionMatchups),
    missionCards: all(ds.missionCards),
    deploymentPatterns: all(ds.deploymentPatterns),
    forceDispositions: all(ds.forceDispositions),
    terrainTemplates: all(ds.terrainTemplates),
    terrainLayouts: all(ds.terrainLayouts),
    hullShapes: all(ds.hullShapes),
    resourcePools: all(ds.resourcePools),
    interactionFlags: [...ds.interactionFlags],
  };
}

const detachmentRuleIds = (d: RawData["detachments"][number]): string[] =>
  d.detachment_rule_ids?.length ? d.detachment_rule_ids : d.detachment_rule_id ? [d.detachment_rule_id] : [];

/**
 * Replace-mode merge: strip the compiled faction's upstream records from
 * `base` and append the compiled ones.
 *
 * Shared records need care: weapons and abilities have no faction column, so
 * removal is by orphaned reference — a record leaves only when nothing
 * surviving still points at it. `alliedRules` may keep dangling refs into the
 * removed faction; harmless for a viewer, so left untouched.
 */
export function buildMergedRaw(base: RawData, compiled: CompiledRecords): RawData {
  const factionId = compiled.factionId;

  const removedUnits = base.units.filter((u) => u.faction_id === factionId);
  const removedUnitIds = new Set(removedUnits.map((u) => u.id));
  const survivingUnits = base.units.filter((u) => u.faction_id !== factionId);
  const survivingUnitIds = new Set(survivingUnits.map((u) => u.id));

  const removedDetachments = base.detachments.filter((d) => d.faction_id === factionId);
  const removedDetachmentIds = new Set(removedDetachments.map((d) => d.id));

  // Stratagems/enhancements carry only detachment_id; core ones have none.
  const stratagemGone = (s: RawData["stratagems"][number]) =>
    s.detachment_id != null && removedDetachmentIds.has(s.detachment_id);
  const enhancementGone = (e: RawData["enhancements"][number]) =>
    e.detachment_id != null && removedDetachmentIds.has(e.detachment_id);
  const removedStratagems = base.stratagems.filter(stratagemGone);
  const removedEnhancements = base.enhancements.filter(enhancementGone);

  // Abilities: seed with everything the removed faction reaches, then keep any
  // id a survivor still references (protects core/shared abilities).
  const removedFactions = base.factions.filter((f) => f.id === factionId);

  const abilityIdsGone = new Set<string>();
  for (const a of base.abilities) {
    if (a.faction_id === factionId) abilityIdsGone.add(a.ability_id);
    if (a.detachment_id != null && removedDetachmentIds.has(a.detachment_id)) abilityIdsGone.add(a.ability_id);
  }
  for (const u of removedUnits) for (const id of u.ability_ids ?? []) abilityIdsGone.add(id);
  for (const s of removedStratagems) if (s.ability_id) abilityIdsGone.add(s.ability_id);
  for (const e of removedEnhancements) if (e.ability_id) abilityIdsGone.add(e.ability_id);
  for (const f of removedFactions) if (f.faction_rule_id) abilityIdsGone.add(f.faction_rule_id);
  for (const d of removedDetachments) for (const id of detachmentRuleIds(d)) abilityIdsGone.add(id);

  for (const u of survivingUnits) for (const id of u.ability_ids ?? []) abilityIdsGone.delete(id);
  for (const s of base.stratagems) if (!stratagemGone(s) && s.ability_id) abilityIdsGone.delete(s.ability_id);
  for (const e of base.enhancements) if (!enhancementGone(e) && e.ability_id) abilityIdsGone.delete(e.ability_id);
  for (const d of base.detachments) {
    if (removedDetachmentIds.has(d.id)) continue;
    for (const id of detachmentRuleIds(d)) abilityIdsGone.delete(id);
  }
  for (const f of base.factions) {
    if (f.id !== factionId && f.faction_rule_id) abilityIdsGone.delete(f.faction_rule_id);
  }

  // Weapons: no faction column — remove those only the removed units carried.
  const weaponIdsGone = new Set<string>();
  for (const u of removedUnits) for (const id of u.weapon_ids ?? []) weaponIdsGone.add(id);
  for (const u of survivingUnits) for (const id of u.weapon_ids ?? []) weaponIdsGone.delete(id);

  const removedStratagemIds = new Set(removedStratagems.map((s) => s.id));

  return {
    ...base,
    factions: [
      ...base.factions.filter((f) => f.id !== factionId),
      ...(compiled.faction ? [compiled.faction] : []),
    ],
    units: [...survivingUnits, ...compiled.units],
    weapons: [...base.weapons.filter((w) => !weaponIdsGone.has(w.id)), ...compiled.weapons],
    weaponKeywords: [...base.weaponKeywords, ...compiled.weaponKeywords],
    abilities: [
      ...base.abilities.filter((a) => !abilityIdsGone.has(a.ability_id)),
      ...(compiled.abilities as RawData["abilities"]),
    ],
    detachments: [
      ...base.detachments.filter((d) => !removedDetachmentIds.has(d.id)),
      ...compiled.detachments,
    ],
    stratagems: [...base.stratagems.filter((s) => !stratagemGone(s)), ...compiled.stratagems],
    enhancements: [...base.enhancements.filter((e) => !enhancementGone(e)), ...compiled.enhancements],
    leaderAttachments: [
      ...base.leaderAttachments.filter(
        (l) => !removedUnitIds.has(l.leader_id) || survivingUnitIds.has(l.leader_id),
      ),
      ...compiled.leaderAttachments,
    ],
    unitCompositions: [
      ...base.unitCompositions.filter((c) => c.faction_id !== factionId),
      ...compiled.unitCompositions,
    ],
    wargearOptions: [
      ...base.wargearOptions.filter((w) => w.faction_id !== factionId),
      ...compiled.wargearOptions,
    ],
    // Wargear items carry no faction_id; ours use `${unitId}--` ids so they
    // can't collide with upstream — plain append.
    wargear: [...base.wargear, ...compiled.wargear],
    targetProfiles: base.targetProfiles.filter((t) => t.faction_id !== factionId),
    phaseMappings: base.phaseMappings.filter(
      (p) => !abilityIdsGone.has(p.source_id) && !removedStratagemIds.has(p.source_id),
    ),
  };
}

/**
 * Patch-mode merge: swap individual records in place.
 *
 * - Units: the record with the same (faction_id, id) is replaced; its new
 *   weapons/abilities are appended as fresh unit-scoped records. The old
 *   shared weapon/ability records stay (other units still reference them);
 *   any now-unreferenced ones linger harmlessly.
 * - Detachments: the record is replaced and its old enhancements, stratagems,
 *   and detachment-linked abilities are swapped for the compiled ones.
 * - Leader links: replaced only for leaders the patch explicitly declares.
 */
export function applyRecordPatches(base: RawData, compiled: CompiledRecords): RawData {
  const patchedUnitIds = new Set(compiled.units.map((u) => u.id));
  const patchedDetachmentIds = new Set(compiled.detachments.map((d) => d.id));
  const patchedLeaderIds = new Set(compiled.leaderAttachments.map((l) => l.leader_id));
  const factionId = compiled.factionId;

  const stratagemGone = (s: RawData["stratagems"][number]) =>
    s.detachment_id != null && patchedDetachmentIds.has(s.detachment_id);
  const enhancementGone = (e: RawData["enhancements"][number]) =>
    e.detachment_id != null && patchedDetachmentIds.has(e.detachment_id);
  const removedStratagemIds = new Set(base.stratagems.filter(stratagemGone).map((s) => s.id));

  // Abilities owned by patched detachments (rule/enhancement/stratagem prose)
  // are detachment-scoped by construction — safe to swap wholesale.
  const abilityGone = (a: RawData["abilities"][number]) =>
    a.detachment_id != null && patchedDetachmentIds.has(a.detachment_id);

  return {
    ...base,
    units: [
      ...base.units.filter((u) => !(u.faction_id === factionId && patchedUnitIds.has(u.id))),
      ...compiled.units,
    ],
    weapons: [...base.weapons, ...compiled.weapons],
    weaponKeywords: [...base.weaponKeywords, ...compiled.weaponKeywords],
    abilities: [
      ...base.abilities.filter((a) => !abilityGone(a)),
      ...(compiled.abilities as RawData["abilities"]),
    ],
    detachments: [
      ...base.detachments.filter((d) => !patchedDetachmentIds.has(d.id)),
      ...compiled.detachments,
    ],
    stratagems: [...base.stratagems.filter((s) => !stratagemGone(s)), ...compiled.stratagems],
    enhancements: [...base.enhancements.filter((e) => !enhancementGone(e)), ...compiled.enhancements],
    leaderAttachments: [
      ...base.leaderAttachments.filter((l) => !patchedLeaderIds.has(l.leader_id)),
      ...compiled.leaderAttachments,
    ],
    // A patched unit's weapons get fresh `${unitId}--` ids, so its upstream
    // options/composition would dangle — swap them for the recompiled ones.
    wargearOptions: [
      ...base.wargearOptions.filter(
        (w) => !(w.faction_id === factionId && patchedUnitIds.has(w.unit_id)),
      ),
      ...compiled.wargearOptions,
    ],
    unitCompositions: [
      ...base.unitCompositions.filter(
        (c) => !(c.faction_id === factionId && patchedUnitIds.has(c.unit_id)),
      ),
      ...compiled.unitCompositions,
    ],
    wargear: [...base.wargear, ...compiled.wargear],
    phaseMappings: base.phaseMappings.filter((p) => !removedStratagemIds.has(p.source_id)),
  };
}

/**
 * The whole doc → one linked Dataset, or null when nothing changes.
 *
 * REPLACE_FACTION_IDS factions are stripped from the upstream data
 * unconditionally — their superseded (old-edition) records must never show,
 * even on a device where the codex doc hasn't synced yet. Until the doc
 * arrives, such a faction is simply empty.
 */
export function applyCodex(mod: Data40k, doc: CodexDoc): Dataset | null {
  let raw = rawFromDataset(mod.dataset);
  const knownKeywordIds = new Set(mod.weaponKeywords.all.map((k) => k.id));
  let changed = false;
  const replaceIds = new Set([
    ...REPLACE_FACTION_IDS,
    ...Object.keys(doc.factions).filter((id) => doc.factions[id].mode === "replace"),
  ]);
  for (const factionId of replaceIds) {
    const docEntry = doc.factions[factionId];
    const entry: ReplaceFaction =
      docEntry?.mode === "replace"
        ? docEntry
        : { mode: "replace", name: "", armyRule: null, datasheets: [], detachments: [] };
    const compiled = compileFaction(factionId, entry, mod.factions.getAny(factionId)?.name);
    dedupeWeaponKeywords(compiled, knownKeywordIds);
    for (const k of compiled.weaponKeywords) knownKeywordIds.add(k.id);
    raw = buildMergedRaw(raw, compiled);
    changed = true;
  }
  for (const [factionId, entry] of Object.entries(doc.factions)) {
    if (entry.mode === "replace") {
      continue; // handled above
    } else {
      const compiled = compilePatches(factionId, entry);
      if (
        compiled.units.length === 0 &&
        compiled.detachments.length === 0 &&
        compiled.leaderAttachments.length === 0
      ) {
        continue;
      }
      dedupeWeaponKeywords(compiled, knownKeywordIds);
      for (const k of compiled.weaponKeywords) knownKeywordIds.add(k.id);
      raw = applyRecordPatches(raw, compiled);
      changed = true;
    }
  }
  return changed ? new mod.Dataset(raw) : null;
}
