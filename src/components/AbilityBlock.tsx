interface Props {
  name: string;
  text: string | null;
  /** Data not yet re-verified for 11e (carried over from 10e sources). */
  provisional?: boolean;
}

/**
 * A named ability with its DSL-derived description. Provisional entries get a
 * badge and a look-up link — the generated text is an approximation of
 * structured data, so un-reverified entries deserve a double-check.
 */
export default function AbilityBlock({ name, text, provisional }: Props) {
  const lookupUrl = `https://www.google.com/search?q=${encodeURIComponent(
    `40k ability "${name}"`,
  )}`;
  return (
    <div className="rounded-md border border-edge bg-panel/50 px-2.5 py-2">
      <div className="flex items-baseline gap-2">
        <span className="flex-1 text-xs font-bold uppercase tracking-wide text-accent">
          {name}
        </span>
        {provisional && (
          <a
            href={lookupUrl}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 rounded border border-amber-700/60 px-1.5 py-px text-[10px] uppercase text-amber-600"
            title="Community data not yet re-verified for 11th edition — tap to look up the card wording"
          >
            10e? verify ↗
          </a>
        )}
      </div>
      {text ? (
        <p className="mt-1 whitespace-pre-wrap text-sm leading-snug text-ink">{text}</p>
      ) : (
        <p className="mt-1 text-xs italic text-ink-faint">No effect data yet.</p>
      )}
    </div>
  );
}
