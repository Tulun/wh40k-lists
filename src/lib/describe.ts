/**
 * Small display formatters over dataset records. Pure string helpers — no
 * dataset import, so they're safe in the eagerly-loaded shell.
 */

/**
 * Weapon-keyword chip label from the catalog name + reference-site parameters:
 * "Sustained Hits" + {value: 1} → "Sustained Hits 1"
 * "Anti" + {target_keyword: "Monster", threshold: 4} → "Anti-Monster 4+"
 */
export function weaponKeywordLabel(
  name: string,
  parameters?: Record<string, unknown>,
): string {
  if (!parameters) return name;
  const target = parameters["target_keyword"];
  const threshold = parameters["threshold"];
  const value = parameters["value"];
  if (typeof target === "string" && threshold != null) {
    return `${name}-${target} ${threshold}+`;
  }
  if (value != null) return `${name} ${value}`;
  if (threshold != null) return `${name} ${threshold}+`;
  return name;
}

/** "once-per-phase" → "Once per phase". */
export function dekebabLabel(s: string): string {
  const words = s.replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function formatRange(range: number | "Melee" | string): string {
  return typeof range === "number" ? `${range}"` : String(range);
}

/** Save like 5 → `5+`; invuln 4 → `4++`. */
export function formatSave(sv: number | null | undefined, invuln = false): string {
  if (sv == null) return "—";
  return `${sv}+${invuln ? "+" : ""}`;
}

/** 1 → "1st", 2 → "2nd", 11 → "11th"… */
function ordinal(n: number): string {
  const rem = n % 100;
  if (rem >= 11 && rem <= 13) return `${n}th`;
  return `${n}${{ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th"}`;
}

/** A cost tier in either the upstream or the editor shape, field names normalized. */
export interface PointsTier {
  models?: number | null;
  cost: number;
  /** 1-based first army copy this cost applies to (11e ordinal pricing). */
  from?: number | null;
  /** Inclusive last copy; null/absent = open-ended band. */
  to?: number | null;
}

/** "1st unit" / "1st–2nd unit" / "3rd+ unit" — null when the tier prices every copy. */
export function pointsBandLabel(t: PointsTier): string | null {
  const from = t.from ?? (t.to != null ? 1 : null);
  if (from == null) return null;
  if (t.to == null) return from === 1 ? null : `${ordinal(from)}+ unit`;
  if (t.to === from) return `${ordinal(from)} unit`;
  return `${ordinal(from)}–${ordinal(t.to)} unit`;
}

/**
 * Cost-tier labels with their conditions spelled out — the ordinal band
 * ("2nd+ unit") that steps the price, and a model-count prefix only when the
 * unit actually comes in more than one size.
 */
export function pointsTierLabels(tiers: readonly PointsTier[]): string[] {
  const showModels = tiers.some((t) => (t.models ?? 1) !== 1);
  return tiers.map((t) => {
    const models = showModels ? `${t.models ?? "?"}× ` : "";
    const band = pointsBandLabel(t);
    return `${models}${t.cost}pts${band ? ` (${band})` : ""}`;
  });
}

/**
 * Display text for an ability: overlay-authored `leak_text` prose wins over
 * the DSL renderer (overlay records carry only a placeholder effect).
 */
export function abilityText(ability: { describe(): string; raw: unknown }): string {
  const leak = (ability.raw as { leak_text?: unknown }).leak_text;
  return typeof leak === "string" && leak.length > 0 ? leak : ability.describe();
}

/** "Feel No Pain 5+" among ability names → "FNP 5+" for micro-statlines. */
export function fnpFromAbilityNames(names: readonly string[]): string | null {
  for (const name of names) {
    const m = /^feel no pain (\d\+)/i.exec(name);
    if (m) return `FNP ${m[1]}`;
  }
  return null;
}
