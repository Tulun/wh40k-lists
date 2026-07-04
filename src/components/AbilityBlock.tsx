/** A named ability with its DSL-derived description; body preserves the translator's indentation. */
export default function AbilityBlock({ name, text }: { name: string; text: string | null }) {
  return (
    <div className="rounded-md border border-edge bg-panel/50 px-2.5 py-2">
      <div className="text-xs font-bold uppercase tracking-wide text-accent">{name}</div>
      {text ? (
        <p className="mt-1 whitespace-pre-wrap text-sm leading-snug text-ink">{text}</p>
      ) : (
        <p className="mt-1 text-xs italic text-ink-faint">No effect data yet.</p>
      )}
    </div>
  );
}
