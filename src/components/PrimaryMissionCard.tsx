import type { PrimaryRules, ScoringRow } from "../lib/mission-rules";
import MissionPhotos from "./MissionPhotos";

/**
 * One primary mission, laid out like the printed card: section bars
 * ("Any battle round"…), a WHEN line, the scoring rows with their VP, then the
 * mission's actions. Wording is ours, built from the dataset's structured data.
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
        <div className="space-y-3 px-3 pb-3">
          {rules.summary && <p className="text-xs leading-relaxed text-ink-dim">{rules.summary}</p>}

          <MissionPhotos missionId={rules.id} />

          {groupRows(rules.rows).map((g, i) => (
            <section key={i}>
              {g.showSection && (
                <h4 className="mb-1 inline-block rounded-sm bg-ink px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-surface uppercase">
                  {g.section}
                </h4>
              )}
              <div className="overflow-hidden rounded-md border border-edge">
                <div className="bg-panel px-2.5 py-1 text-[11px] text-ink-dim">
                  <span className="font-bold text-ink">When:</span> {g.when}
                </div>
                <ul className="divide-y divide-edge">
                  {g.rows.map((row, j) => (
                    <li
                      key={j}
                      className={`flex items-baseline gap-3 py-1.5 pr-2.5 ${
                        row.cumulative ? "border-l-4 border-l-accent pl-2" : "pl-2.5"
                      }`}
                    >
                      <span className="min-w-0 flex-1 text-xs">
                        {row.orWithPrev && <span className="mr-1 font-bold text-accent">OR</span>}
                        {row.cumulative && <span className="mr-1 font-bold text-accent">+</span>}
                        {row.condition}
                      </span>
                      <span className="shrink-0 text-right text-xs font-bold whitespace-nowrap text-accent">
                        {row.cumulative ? `+${row.vp}` : row.vp}
                        {row.cumulative && (
                          <span className="block text-[9px] font-semibold tracking-wide uppercase">
                            cumulative
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ))}
          {rules.rows.some((r) => r.exclusiveGroup) && (
            <p className="text-[11px] text-ink-faint">OR rows: only the best one scores.</p>
          )}

          {rules.actions.map((a) => (
            <section key={a.name} className="overflow-hidden rounded-md border border-edge">
              <div className="flex items-baseline gap-2 bg-ink px-2.5 py-1 text-surface">
                <span className="text-xs font-bold uppercase">{a.name}</span>
                <span className="text-[10px] tracking-wide uppercase opacity-70">Action</span>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 px-2.5 py-1.5 text-xs">
                <Field label="Starts" value={a.starts} />
                <Field label="Units" value={a.units} />
                <Field label="Use limit" value={a.useLimit} />
                <Field label="Effect" value={a.effect} />
              </dl>
            </section>
          ))}

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

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <>
      <dt className="font-bold">{label}:</dt>
      <dd className="text-ink-dim">{value}</dd>
    </>
  );
}

interface RowGroup {
  section: string;
  /** Repeated section headers collapse, like the card's single bar per window. */
  showSection: boolean;
  when: string;
  rows: (ScoringRow & { orWithPrev: boolean })[];
}

/** Consecutive rows sharing a section + WHEN render as one block. */
function groupRows(rows: ScoringRow[]): RowGroup[] {
  const groups: RowGroup[] = [];
  rows.forEach((row, i) => {
    const prev = rows[i - 1];
    const orWithPrev = row.exclusiveGroup != null && prev?.exclusiveGroup === row.exclusiveGroup;
    const last = groups.at(-1);
    if (last && last.section === row.section && last.when === row.when) {
      last.rows.push({ ...row, orWithPrev });
    } else {
      groups.push({
        section: row.section,
        showSection: last?.section !== row.section,
        when: row.when,
        rows: [{ ...row, orWithPrev }],
      });
    }
  });
  return groups;
}
