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

/** "Feel No Pain 5+" among ability names → "FNP 5+" for micro-statlines. */
export function fnpFromAbilityNames(names: readonly string[]): string | null {
  for (const name of names) {
    const m = /^feel no pain (\d\+)/i.exec(name);
    if (m) return `FNP ${m[1]}`;
  }
  return null;
}
