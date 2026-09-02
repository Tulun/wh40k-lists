import { useState } from "react";

/**
 * Rules-relevant keywords — unit types and the hooks stratagems/abilities key
 * off. These get full-strength chips; flavor keywords stay faint.
 */
const IMPORTANT_KEYWORDS = new Set([
  "infantry",
  "mounted",
  "vehicle",
  "monster",
  "beast",
  "swarm",
  "character",
  "epic hero",
  "battleline",
  "grenades",
  "fly",
  "psyker",
  "aircraft",
  "titanic",
  "walker",
  "transport",
  "dedicated transport",
  "fortification",
  "smoke",
]);

/** A core-ability chip; when `text` is present, tapping the chip reveals it. */
export interface CoreTag {
  name: string;
  text?: string;
}

/** Core-ability tags (accent) + important keywords (solid) + flavor keywords (faint). */
export default function KeywordChips({
  coreTags,
  keywords,
  children,
}: {
  coreTags: readonly (string | CoreTag)[];
  keywords: readonly string[];
  children?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const tags: CoreTag[] = coreTags.map((t) => (typeof t === "string" ? { name: t } : t));
  const important = keywords.filter((k) => IMPORTANT_KEYWORDS.has(k.toLowerCase()));
  const flavor = keywords.filter((k) => !IMPORTANT_KEYWORDS.has(k.toLowerCase()));
  if (tags.length === 0 && keywords.length === 0 && !children) return null;
  const open = tags.find((t) => t.name === expanded && t.text);
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((t) =>
          t.text ? (
            <button
              key={t.name}
              type="button"
              onClick={() => setExpanded(expanded === t.name ? null : t.name)}
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold text-accent ${
                expanded === t.name
                  ? "border-accent bg-accent/20"
                  : "border-accent/40 bg-accent/10"
              }`}
            >
              {t.name}
              <span aria-hidden className="ml-1 font-normal text-accent/70">
                {expanded === t.name ? "×" : "ⓘ"}
              </span>
            </button>
          ) : (
            <span
              key={t.name}
              className="rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent"
            >
              {t.name}
            </span>
          ),
        )}
        {children}
        {important.map((k) => (
          <span
            key={k}
            className="rounded-full border border-edge bg-panel px-2.5 py-1 text-xs font-medium uppercase tracking-wide text-ink"
          >
            {k}
          </span>
        ))}
        {flavor.map((k) => (
          <span key={k} className="rounded-full bg-panel px-2 py-0.5 text-[11px] text-ink-faint">
            {k}
          </span>
        ))}
      </div>
      {open && (
        <div className="rounded-md border border-accent/40 bg-accent/5 px-2.5 py-2">
          <div className="text-[11px] font-bold uppercase tracking-wide text-accent">
            {open.name}
          </div>
          <p className="mt-0.5 whitespace-pre-wrap text-sm leading-snug">{open.text}</p>
        </div>
      )}
    </div>
  );
}
