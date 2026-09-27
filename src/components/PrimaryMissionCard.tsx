import type { PrimaryRules } from "../lib/mission-rules";

/**
 * One primary mission: the community summary plus a scoring table (when ·
 * condition · VP) built from the dataset's structured awards.
 */
export default function PrimaryMissionCard({
  label,
  rules,
  defaultOpen,
}: {
  /** "You · Priority Assets" */
  label: string;
  rules: PrimaryRules | undefined;
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} className="group rounded-lg border border-edge bg-panel/50">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2">
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] text-ink-faint">{label}</span>
          <span className="block text-sm font-bold text-accent">{rules?.name ?? "—"}</span>
        </span>
        <span className="text-xs text-ink-faint transition-transform group-open:rotate-90">›</span>
      </summary>
      {rules && (
        <div className="space-y-2 px-3 pb-3">
          {rules.summary && <p className="text-xs leading-relaxed text-ink-dim">{rules.summary}</p>}
          {rules.rows.length > 0 && (
            <ul className="divide-y divide-edge rounded-md border border-edge">
              {rules.rows.map((row, i) => {
                const prev = rules.rows[i - 1];
                const orWithPrev =
                  row.exclusiveGroup != null && prev?.exclusiveGroup === row.exclusiveGroup;
                return (
                  <li key={i} className="flex items-baseline gap-3 px-2.5 py-1.5">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] text-ink-faint">
                        {row.cumulative && (
                          <span className="font-semibold text-accent">+ Stacks · </span>
                        )}
                        {orWithPrev && <span className="font-semibold text-accent">OR · </span>}
                        {row.when}
                      </span>
                      <span className="block text-xs">{row.condition}</span>
                    </span>
                    <span className="shrink-0 text-xs font-bold whitespace-nowrap text-accent">
                      {row.vp}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {rules.rows.some((r) => r.exclusiveGroup) && (
            <p className="text-[11px] text-ink-faint">OR rows: only the best one scores.</p>
          )}
          {(rules.vpPerRoundCap != null || rules.vpPerGameCap != null) && (
            <p className="text-[11px] text-ink-faint">
              Max {rules.vpPerRoundCap ?? "—"} VP per round · {rules.vpPerGameCap ?? "—"} per game
            </p>
          )}
        </div>
      )}
    </details>
  );
}
