/**
 * Structured renderer for long rule text (army rules, detachment rules).
 * Blank lines split the text into paragraph blocks; a block that opens with a
 * short "Name: effect…" lead-in gets its name styled as a subheader, so named
 * sub-rules (War Cry, Da Boss, Special Move Types) stop reading as one wall
 * of prose. Intra-paragraph newlines (bullet lists) are preserved.
 */

/** Index of the first top-level colon (outside parentheses), or -1. */
function headerColon(text: string): number {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "(") depth += 1;
    else if (c === ")") depth = Math.max(0, depth - 1);
    else if (c === ":" && depth === 0) return i;
    else if (c === "\n") return -1; // header must sit on the first line
  }
  return -1;
}

export default function RuleText({ text }: { text: string }) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <div className="space-y-2.5">
      {paragraphs.map((p, i) => (
        <p key={i} className="whitespace-pre-wrap text-sm leading-snug">
          {p.split("\n").map((line, li) => {
            // A real lead-in is short, has its effect on the same line, and
            // isn't a bullet — "Friendly units can:" followed by bullets and
            // "- it has a 5+ save;" both stay prose.
            const colon = headerColon(line);
            const rest = colon >= 0 ? line.slice(colon + 1) : "";
            const isHeader =
              colon > 0 && colon <= 80 && rest.trim().length > 0 && !/^\s*[-•◦]/.test(line);
            return (
              <span key={li}>
                {li > 0 && "\n"}
                {isHeader ? (
                  <>
                    <span className="font-semibold text-accent">{line.slice(0, colon)}:</span>
                    {rest}
                  </>
                ) : (
                  line
                )}
              </span>
            );
          })}
        </p>
      ))}
    </div>
  );
}
