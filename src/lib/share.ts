/**
 * Copy-friendly list export for Facebook/Discord: the WTC-compact tournament
 * format the package ships — header block (name, faction, detachments, points,
 * warlord, enhancements), then one line per unit with points and wargear.
 */
import type { SavedList } from "../store/schema";
import type { Data40k } from "./data";

export function shareText(data: Data40k, list: SavedList): string {
  const roster = structuredClone(list.roster);
  roster.name = list.name;
  // The serializer reports the roster's own totals; after in-app edits only
  // total_computed is current.
  roster.points = { ...roster.points, total_reported: roster.points.total_computed };
  return spaceUnitBlocks(data.exportRoster(roster, "newrecruit-wtc-compact"));
}

/**
 * The serializer emits units as contiguous lines; a blank line between blocks
 * reads better in chat. An "Enhancement:" line belongs to the unit above it.
 */
function spaceUnitBlocks(text: string): string {
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
  return (
    lines.slice(0, headerEnd + 1).join("\n") +
    "\n\n" +
    blocks.map((b) => b.join("\n")).join("\n\n") +
    "\n"
  );
}
