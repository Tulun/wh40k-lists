/**
 * Lenient fallback over the 40kdc importer's strict format adapters.
 *
 * `tryImportRoster` only accepts the exact export dialects it knows, so a
 * tournament submission that was mangled in transit — numbered lines from a
 * pairing portal ("11. Nazdreg + 3x Meganobz (300 pts)"), ad-hoc "Field: value"
 * headers, roll-up lines whose points are the sum of the units beneath them,
 * inline " - wargear, wargear" suffixes — fails every adapter even though a
 * human reads it fine.
 *
 * When the strict pass fails, this module infers the list's shape: it loosely
 * parses those conventions and re-emits the text as a WTC-compact document
 * (the package's most line-oriented dialect), then runs the strict importer
 * over the rewrite. The package's resolver — not this module — still does all
 * name resolution, so inference can only change how lines are read, never
 * what a name resolves to; anything it gets wrong lands in the same
 * unresolved-ref picker UI as a normal import.
 */
import type { ImportResult } from "@alpaca-software/40kdc-data";
import type { Data40k } from "./data";

export interface LenientImport {
  result: ImportResult;
  /** True when the roster came from an inferred rewrite, not the pasted text. */
  inferred: boolean;
  /** Human-readable descriptions of the inference steps taken. */
  notes: string[];
}

/** `12. ` / `12) ` line-number prefix a submission portal prepends. */
const LINE_NO = /^\s{0,3}\d{1,4}[.)](?:[ \t]|$)/;
/**
 * `[Nx ]Name (P pts)[ - wargear, wargear]`. The close paren is optional so a
 * paste truncated mid-line still yields its unit; the dash tail is only looked
 * for after the points, so dashes inside names stay untouched.
 */
const UNIT_LINE =
  /^(\s*)(?:(\d+)\s*x\s+)?(.+?)\s*\(\s*([\d,]+)\s*(?:pts?|points?)\s*\)?\s*(?:[-–—]\s*(.+?))?\s*$/i;
const FIELD_LINE = /^\s*(.{1,60}?)\s*:\s*(.+?)\s*$/;
const FENCE = /^\++\s*$/;
const BATTLE_SIZE_TAIL = /(combat patrol|incursion|strike force|onslaught)$/i;
const ENHANCEMENT_TOKEN = /^enhancements?\s*:\s*(.+)$/i;
/** Header enhancement hint: `Dreadherder (on Big Mek Dakkarig)`. */
const ENHANCEMENT_HINT = /^(.+?)\s*\(\s*(?:on|for)\s+(.+?)\s*\)$/i;

interface UnitEntry {
  count: number | null;
  name: string;
  pts: number;
  gear: string[];
  enhancement: string | null;
}

interface LooseList {
  faction: string | null;
  detachments: string | null;
  disposition: string | null;
  listName: string | null;
  points: number | null;
  units: UnitEntry[];
  notes: string[];
}

/**
 * Strict import first; on any failure, retry over inferred rewrites of the
 * text. Returns the strict failure untouched when inference can't help, so
 * the error the user sees still describes their actual paste.
 */
export function importRosterLenient(data: Data40k, text: string): LenientImport {
  const strict = data.tryImportRoster(text);
  if (strict.ok) return { result: strict, inferred: false, notes: [] };

  for (const rewrite of buildRewrites(data, text)) {
    const result = data.tryImportRoster(rewrite.text);
    if (result.ok && result.roster.units.length > 0) {
      return { result, inferred: true, notes: rewrite.notes };
    }
  }
  return { result: strict, inferred: false, notes: [] };
}

function buildRewrites(data: Data40k, text: string): { text: string; notes: string[] }[] {
  const rewrites: { text: string; notes: string[] }[] = [];

  // Line numbers alone may be all that's wrong — a numbered GW app export is
  // otherwise a dialect the strict adapters already know.
  const stripped = stripLineNumbers(text);
  if (stripped) rewrites.push({ text: stripped.text, notes: [stripped.note] });

  const base = stripped?.text ?? text;
  const loose = parseLoose(data, base);
  if (loose && loose.units.length > 0) {
    const notes = stripped ? [stripped.note, ...loose.notes] : loose.notes;
    rewrites.push({ text: emitWtcCompact(data, loose), notes });
  }
  return rewrites;
}

/** Strip `N.`/`N)` prefixes when at least half the non-blank lines carry one. */
function stripLineNumbers(text: string): { text: string; note: string } | null {
  const lines = text.split(/\r?\n/);
  const nonBlank = lines.filter((l) => l.trim().length > 0);
  const numbered = nonBlank.filter((l) => LINE_NO.test(l));
  if (numbered.length < 3 || numbered.length * 2 < nonBlank.length) return null;
  return {
    text: lines.map((l) => l.replace(LINE_NO, "")).join("\n"),
    note: `Removed line numbers from ${numbered.length} lines`,
  };
}

/** Split on commas outside parentheses ("Dreadherder (on Big Mek), Fing (…)"). */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of text) {
    if (ch === "(") depth += 1;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  parts.push(cur);
  return parts.map((s) => s.trim()).filter((s) => s.length > 0);
}

function parseLoose(data: Data40k, text: string): LooseList | null {
  const lines = text.split(/\r?\n/);
  const notes: string[] = [];

  // --- Pass 1: collect every `Name (N pts)` line. --------------------------
  interface RawEntry extends Omit<UnitEntry, "gear" | "enhancement"> {
    rest: string | null;
  }
  const raw: RawEntry[] = [];
  let firstUnitLine = -1;
  let battleSizePts: number | null = null;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim() || FENCE.test(line.trim())) continue;
    const m = UNIT_LINE.exec(line);
    if (!m) continue;
    const name = m[3].trim();
    // `Strike Force (2000 Points)` is army metadata, not a datasheet.
    if (BATTLE_SIZE_TAIL.test(name)) {
      battleSizePts ??= Number.parseInt(m[4].replace(/,/g, ""), 10);
      continue;
    }
    if (firstUnitLine < 0) firstUnitLine = i;
    raw.push({
      count: m[2] ? Number.parseInt(m[2], 10) : null,
      name,
      pts: Number.parseInt(m[4].replace(/,/g, ""), 10),
      rest: m[5]?.trim() ?? null,
    });
  }
  if (raw.length === 0) return null;

  // --- Pass 2: `Key: value` header fields above the first unit. ------------
  let faction: string | null = null;
  let detachments: string | null = null;
  let disposition: string | null = null;
  let listName: string | null = null;
  let points: number | null = null;
  const hints: { enhancement: string; unit: string }[] = [];
  const usedFields: string[] = [];
  for (const line of lines.slice(0, firstUnitLine)) {
    const f = FIELD_LINE.exec(line);
    if (!f) continue;
    const key = f[1]
      .toLowerCase()
      .replace(/\(.*?\)/g, " ")
      .replace(/[^a-z ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const value = f[2];
    if (key.includes("player") || key.includes("team")) continue;
    if (key.includes("enhancement")) {
      for (const part of splitTopLevel(value)) {
        const h = ENHANCEMENT_HINT.exec(part);
        if (h) hints.push({ enhancement: h[1].trim(), unit: h[2].trim() });
      }
      if (hints.length > 0) usedFields.push("enhancements");
    } else if (key.includes("faction")) {
      const values = splitTopLevel(value);
      faction ??= values[0] ?? null;
      if (values.length > 1) notes.push(`Multiple factions listed; scoped to “${values[0]}”`);
      usedFields.push("faction");
    } else if (key.includes("detachment")) {
      detachments ??= value;
      usedFields.push("detachment");
    } else if (key.includes("disposition")) {
      disposition ??= value;
      usedFields.push("disposition");
    } else if (/^(list |army |roster )?name$/.test(key)) {
      listName ??= value;
      usedFields.push("list name");
    } else if (key.includes("points") || key === "total") {
      const n = /\d+/.exec(value.replace(/,/g, ""));
      if (n) points ??= Number.parseInt(n[0], 10);
      usedFields.push("points");
    }
  }
  points ??= battleSizePts;
  if (usedFields.length > 0) notes.push(`Read header fields: ${usedFields.join(", ")}`);

  // A GW-style title line ("Krakow Teams (2000 pts)") reads as a unit; when
  // the first entry's points look like an army total, treat it as the title.
  const first = raw[0];
  if (
    raw.length > 1 &&
    first.count === null &&
    first.rest === null &&
    first.pts >= 750 &&
    first.pts >= 2 * Math.max(...raw.slice(1).map((e) => e.pts))
  ) {
    listName ??= first.name;
    points ??= first.pts;
    raw.shift();
    notes.push(`Read “${first.name}” as the list title`);
  }

  // --- Pass 3: drop roll-up lines ("A + Nx B (300 pts)" followed by A and B
  // with their own costs summing to 300) so members import once, not twice. --
  const units: UnitEntry[] = [];
  let dropped = 0;
  for (let i = 0; i < raw.length; i += 1) {
    const e = raw[i];
    const parts = e.name.split(/\s+\+\s+/);
    if (parts.length >= 2) {
      const members = raw.slice(i + 1, i + 1 + parts.length);
      const sum = members.reduce((s, m) => s + m.pts, 0);
      if (members.length === parts.length && sum === e.pts) {
        dropped += 1;
        continue;
      }
    }
    let enhancement: string | null = null;
    const gear: string[] = [];
    for (const token of splitTopLevel(e.rest ?? "")) {
      const t = ENHANCEMENT_TOKEN.exec(token);
      if (t) enhancement ??= t[1].trim();
      else gear.push(token);
    }
    units.push({ count: e.count, name: e.name, pts: e.pts, gear, enhancement });
  }
  if (dropped > 0) {
    notes.push(`Skipped ${dropped} roll-up line(s) whose points were the sum of the units beneath`);
  }

  // Header enhancement hints fill units the body left bare — but only when the
  // hint points at exactly one unit and no unit already carries that
  // enhancement inline (the inline copy is the more specific source).
  for (const hint of hints) {
    const key = data.normalizeName(hint.enhancement);
    if (units.some((u) => u.enhancement && data.normalizeName(u.enhancement) === key)) continue;
    const matches = units.filter(
      (u) => u.enhancement === null && data.normalizeName(u.name) === data.normalizeName(hint.unit),
    );
    if (matches.length === 1) {
      matches[0].enhancement = hint.enhancement;
      notes.push(`Attached “${hint.enhancement}” to ${hint.unit} from the header`);
    }
  }

  if (faction === null) {
    faction = inferFactionName(data, units.map((u) => u.name));
    if (faction) notes.push(`Inferred faction “${faction}” from the unit names`);
  }

  notes.push(`Rebuilt ${units.length} unit entries into a standard layout`);
  return { faction, detachments, disposition, listName, points, units, notes };
}

/**
 * Majority vote over exact unit-name matches. Shared names (e.g. a chassis
 * fielded by several factions) split their vote; a tie or an empty tally
 * returns null and the rewrite proceeds unscoped.
 */
function inferFactionName(data: Data40k, names: string[]): string | null {
  const votes = new Map<string, number>();
  for (const name of new Set(names)) {
    const key = data.normalizeName(name);
    const exact = data.units.findAll(name).filter((u) => data.normalizeName(u.name) === key);
    const factionIds = new Set(exact.map((u) => u.raw.faction_id));
    for (const id of factionIds) votes.set(id, (votes.get(id) ?? 0) + 1 / factionIds.size);
  }
  const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) return null;
  if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) return null;
  return data.factions.getAny(ranked[0][0])?.name ?? null;
}

/**
 * Re-emit the loose parse as a WTC-compact document — one `Nx Name (P pts):
 * gear` line per unit, an `Enhancement: X (+N pts)` line after its unit, and
 * the `+ FIELD:` summary header the adapter keys on. The enhancement's cost is
 * priced from the dataset because this dialect requires one and loose sources
 * never state it; an unknown enhancement gets +0 and resolves (or not) by name
 * as usual.
 */
function emitWtcCompact(data: Data40k, loose: LooseList): string {
  const out: string[] = [];
  out.push("+".repeat(20));
  out.push(`+ FACTION KEYWORD: ${loose.faction ?? "Unknown"}`);
  if (loose.detachments) out.push(`+ DETACHMENT: ${loose.detachments}`);
  if (loose.disposition) out.push(`+ FORCE DISPOSITION: ${loose.disposition}`);
  if (loose.points !== null) out.push(`+ TOTAL ARMY POINTS: ${loose.points} pts`);
  if (loose.listName) out.push(`+ LIST NAME: ${loose.listName}`);
  out.push("+".repeat(20));
  for (const u of loose.units) {
    out.push(`${u.count ?? 1}x ${u.name} (${u.pts} pts): ${u.gear.join(", ")}`);
    if (u.enhancement) {
      const cost = data.enhancements.find(u.enhancement)?.cost ?? 0;
      out.push(`Enhancement: ${u.enhancement} (+${cost} pts)`);
    }
  }
  return out.join("\n");
}
