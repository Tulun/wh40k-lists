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

/** Core-ability tags (accent) + important keywords (solid) + flavor keywords (faint). */
export default function KeywordChips({
  coreTags,
  keywords,
  children,
}: {
  coreTags: readonly string[];
  keywords: readonly string[];
  children?: React.ReactNode;
}) {
  const important = keywords.filter((k) => IMPORTANT_KEYWORDS.has(k.toLowerCase()));
  const flavor = keywords.filter((k) => !IMPORTANT_KEYWORDS.has(k.toLowerCase()));
  if (coreTags.length === 0 && keywords.length === 0 && !children) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {coreTags.map((t) => (
        <span
          key={t}
          className="rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent"
        >
          {t}
        </span>
      ))}
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
  );
}
