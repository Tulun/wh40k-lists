/**
 * Copy-friendly list export for Facebook/Discord: the WTC-compact tournament
 * format the package ships — header block (name, faction, detachments, points,
 * warlord, enhancements), then one line per unit with points and wargear.
 */
import type { Roster } from "@alpaca-software/40kdc-data";
import type { SavedList } from "../store/schema";
import type { Data40k } from "./data";
import { byId } from "./lookup";
import { organizeArmy } from "./organize";

export function shareText(data: Data40k, list: SavedList): string {
  const roster = structuredClone(list.roster);
  roster.name = list.name;
  // The serializer reports the roster's own totals; after in-app edits only
  // total_computed is current.
  roster.points = { ...roster.points, total_reported: roster.points.total_computed };
  // The editor's index-keyed attachments map is the in-app source of truth;
  // project it onto `leader_attachment` so the export carries the pairings.
  const attachments = list.attachments ?? {};
  roster.units.forEach((u, i) => {
    const body = roster.units[attachments[String(i)]];
    u.leader_attachment = body
      ? {
          bodyguard_ref: structuredClone(body.ref),
          role: u.leader_attachment?.role ?? "leader",
          // Deliberate editor state, not an import inference.
          provisional: false,
        }
      : null;
  });
  // The shared army layout: attached bricks first in their own section, then
  // loose units in role sections — and since CharN slots are assigned in
  // output order, the numbering follows this layout too.
  const sections = organizeArmy(data, list);
  const order = sections.flatMap((s) => s.blocks.flatMap((b) => b.indices));
  const labels = sections.flatMap((s) =>
    s.blocks.flatMap((b) => b.indices.map(() => s.label)),
  );
  roster.units = order.map((i) => roster.units[i]);
  const out = data.exportRoster(roster, "newrecruit-wtc-compact");
  return spaceUnitBlocks(remarkCharacters(out, data, roster), labels);
}

/**
 * The dataset-free serializer only tags `CharN:` on units it can infer are
 * characters (warlord, enhancement, attachment). We have the dataset, so
 * re-tag every unit whose datasheet role is character/epic-hero, renumbering
 * the header's WARLORD and ENHANCEMENT references to match.
 */
function remarkCharacters(text: string, data: Data40k, roster: Roster): string {
  const slots: (number | null)[] = [];
  let next = 1;
  for (const u of roster.units) {
    const role = u.ref.id
      ? byId(data.units, u.ref.id, roster.faction_id)?.raw.role
      : undefined;
    const isChar =
      role === "character" ||
      role === "epic-hero" ||
      u.is_warlord ||
      u.enhancement != null ||
      u.leader_attachment != null;
    slots.push(isChar ? next++ : null);
  }

  const lines = text.split("\n");
  let headerEnd = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].startsWith("+++")) {
      headerEnd = i;
      break;
    }
  }
  if (headerEnd === -1) return text;

  // Body: one line per unit in roster order (Enhancement lines ride along).
  let unitIdx = -1;
  for (let i = headerEnd + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "" || line.startsWith("Enhancement:")) continue;
    unitIdx += 1;
    const stripped = line.replace(/^Char\d+: /, "");
    const slot = slots[unitIdx];
    lines[i] = slot != null ? `Char${slot}: ${stripped}` : stripped;
  }

  const warlordIdx = roster.units.findIndex((u) => u.is_warlord);
  // Header ENHANCEMENT lines are emitted one per enhanced unit, in roster
  // order — pair them up positionally so each keeps its own bearer.
  const enhancedIdxs = roster.units
    .map((u, i) => (u.enhancement != null ? i : -1))
    .filter((i) => i >= 0);
  let enhLine = 0;
  for (let i = 0; i < headerEnd; i++) {
    if (lines[i].startsWith("+ WARLORD:") && warlordIdx >= 0) {
      lines[i] = `+ WARLORD: Char${slots[warlordIdx]}: ${roster.units[warlordIdx].ref.raw_name}`;
    }
    if (lines[i].startsWith("+ ENHANCEMENT:") && enhLine < enhancedIdxs.length) {
      const uIdx = enhancedIdxs[enhLine++];
      const u = roster.units[uIdx];
      lines[i] = `+ ENHANCEMENT: ${u.enhancement!.raw_name} (on Char${slots[uIdx]}: ${u.ref.raw_name})`;
    }
  }
  return lines.join("\n");
}

/**
 * The serializer emits units as contiguous lines; a blank line between blocks
 * reads better in chat. An "Enhancement:" line belongs to the unit above it.
 * `labels` (one per unit, aligned with output order) become "== Section =="
 * header lines wherever the section changes.
 */
function spaceUnitBlocks(text: string, labels: readonly string[]): string {
  const lines = text.split("\n");
  let headerEnd = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].startsWith("+++")) {
      headerEnd = i;
      break;
    }
  }
  if (headerEnd === -1) return text;
  const units = lines.slice(headerEnd + 1).filter((l) => l.trim() !== "");
  const blocks: string[][] = [];
  for (const line of units) {
    if (line.startsWith("Enhancement:") && blocks.length > 0) blocks[blocks.length - 1].push(line);
    else blocks.push([line]);
  }
  const rendered: string[] = [];
  blocks.forEach((b, i) => {
    const label = labels[i];
    if (label && label !== labels[i - 1]) rendered.push(`== ${label} ==`);
    rendered.push(b.join("\n"));
  });
  return (
    lines.slice(0, headerEnd + 1).join("\n") +
    "\n\n" +
    rendered.join("\n\n") +
    "\n"
  );
}
