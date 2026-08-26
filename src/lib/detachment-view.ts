/**
 * Assemble a detachment with its rule, enhancements, and stratagems from the
 * (merged) dataset into the EditableDetachment shape that DetachmentCard
 * renders. Works for upstream factions and codex-doc factions alike — the
 * merged dataset already carries the compiled codex records.
 */
import type { EditableDetachment } from "./codex-model";
import { seedDetachmentFromUpstream } from "./codex-model";
import type { Data40k } from "./data";
import { abilityText } from "./describe";
import { byId } from "./lookup";

export function detachmentView(
  data: Data40k,
  factionId: string,
  detId: string,
): EditableDetachment | null {
  const det = data.detachments.getInFaction(detId, factionId) ?? data.detachments.getAny(detId);
  if (!det) return null;
  const ruleIds = det.detachment_rule_ids?.length
    ? det.detachment_rule_ids
    : det.detachment_rule_id
      ? [det.detachment_rule_id]
      : [];
  const rule = ruleIds[0] ? byId(data.abilities, ruleIds[0], factionId) : undefined;
  const enhancements = data.enhancements.all
    .filter((e) => e.detachment_id === det.id)
    .map((record) => {
      const view = record.ability_id ? byId(data.abilities, record.ability_id, factionId) : undefined;
      return { record, text: view ? abilityText(view) : null };
    });
  const stratagems = data.stratagems.all
    .filter((s) => s.detachment_id === det.id)
    .map((record) => {
      const view = record.ability_id ? byId(data.abilities, record.ability_id, factionId) : undefined;
      return { record, text: view ? abilityText(view) : null };
    });
  return seedDetachmentFromUpstream(
    det,
    rule ? abilityText(rule) : null,
    rule?.name ?? null,
    enhancements,
    stratagems,
  );
}
