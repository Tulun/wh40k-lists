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

/** The slice of a wargear-option record the prose renderer reads. */
export interface WargearOptionLike {
  model_constraint?: {
    model_name?: string;
    per_n_models?: number;
    max_count?: number;
    any_number?: boolean;
  } | null;
  replaces?: readonly string[];
  replacement?: readonly string[];
  replacement_choice?: readonly (readonly string[])[];
  additional_cost?: number | null;
}

export interface WargearOptionText {
  /** The sentence; ends with a colon when `choices` follow. */
  text: string;
  /** Branch lines of a pick-one choice, in option order. */
  choices?: string[];
}

/**
 * A wargear option as datasheet prose — "For every 5 models, 1 Nob can
 * replace its Kustom Shoota with one of the following: …". `nameOf` resolves
 * weapon/wargear ids; duplicates within a side compress to "2× Killsaw".
 */
export function wargearOptionText(
  option: WargearOptionLike,
  nameOf: (id: string) => string,
): WargearOptionText {
  // countOne: additions spell out "1 Kombi-rokkit"; the replaced side reads as
  // a possessive ("their Kustom Shoota"), so a lone copy goes uncounted there.
  const itemList = (ids: readonly string[], countOne: boolean): string => {
    const counts = new Map<string, number>();
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    return [...counts]
      .map(([id, n]) => (n > 1 ? `${n}× ${nameOf(id)}` : countOne ? `1 ${nameOf(id)}` : nameOf(id)))
      .join(" and ");
  };

  const mc = option.model_constraint;
  const who = mc?.model_name ?? "model";
  let subject: string;
  let suffix = "";
  if (!mc || (mc.any_number && !mc.max_count)) {
    subject =
      who === "model" ? "Any number of models can each" : `Any number of ${who} models can each`;
  } else if (mc.any_number && mc.max_count) {
    // Multi-take mount: "up to 2 seeker missiles" per model.
    subject = who === "model" ? "Each model can" : `Each ${who} can`;
    suffix = `, up to ${mc.max_count} times per model`;
  } else if (mc.per_n_models) {
    subject = `For every ${mc.per_n_models} models, 1 ${who} can`;
    if (mc.max_count) suffix = ` (max ${mc.max_count})`;
  } else if ((mc.max_count ?? 1) > 1) {
    subject = `Up to ${mc.max_count} ${who === "model" ? "models" : `${who} models`} can each`;
  } else {
    subject = `1 ${who} can`;
  }
  if (option.additional_cost) suffix += ` for +${option.additional_cost} pts`;

  const branches = option.replacement_choice ?? (option.replacement ? [option.replacement] : []);
  const verb = option.replaces
    ? `replace their ${itemList(option.replaces, false)} with`
    : "be equipped with";
  if (branches.length > 1) {
    return {
      text: `${subject} ${verb} one of the following${suffix}:`,
      choices: branches.map((b) => itemList(b, true)),
    };
  }
  return { text: `${subject} ${verb} ${itemList(branches[0] ?? [], true)}${suffix}.` };
}

/** "Feel No Pain 5+" among ability names → "5+++" (the x+++ convention). */
export function fnpFromAbilityNames(names: readonly string[]): string | null {
  for (const name of names) {
    const m = /^feel no pain (\d)\+/i.exec(name);
    if (m) return `${m[1]}+++`;
  }
  return null;
}
