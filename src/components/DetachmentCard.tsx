import type { EditableDetachment, EditableStratagem } from "../lib/codex-model";
import { DISPOSITIONS } from "../lib/codex-model";
import { dekebabLabel } from "../lib/describe";

const BAND_HEAD =
  "bg-band px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white";

const TURN_LABELS: Record<EditableStratagem["playerTurn"], string> = {
  "your-turn": "Your turn",
  "opponent-turn": "Opponent's turn",
  either: "Either player's turn",
};

function StratagemBox({ strat }: { strat: EditableStratagem }) {
  const meta = [
    TURN_LABELS[strat.playerTurn],
    strat.phases.length > 0 ? strat.phases.map(dekebabLabel).join(" / ") + " phase" : null,
    // Once per phase is the core rule for every stratagem — only exceptional
    // timings are worth a chip, matching the printed cards.
    strat.timing !== "once-per-phase" ? dekebabLabel(strat.timing) : null,
  ].filter(Boolean);
  return (
    <div className="overflow-hidden rounded-sm border border-edge border-l-4 border-l-band-hi bg-surface">
      <div className="flex items-center justify-between gap-2 bg-band-deep px-2.5 py-1.5">
        <span className="text-xs font-extrabold uppercase tracking-wide text-white">
          {strat.name || "Unnamed stratagem"}
        </span>
        <span className="shrink-0 rounded-sm bg-surface px-1.5 py-0.5 text-[11px] font-extrabold tabular-nums text-band-hi">
          {strat.cpCost}CP
        </span>
      </div>
      <div className="space-y-1 px-2.5 py-2 text-xs leading-snug">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
          {meta.join(" · ")}
        </p>
        {strat.requiredKeywords.length > 0 && (
          <p className="text-[10px] font-semibold uppercase tracking-wide text-band-hi">
            Target: {strat.requiredKeywords.join(", ")}
          </p>
        )}
        <p className="whitespace-pre-wrap">{strat.text}</p>
      </div>
    </div>
  );
}

/**
 * GW-style detachment rendering of an editable detachment: header band with
 * DP cost and dispositions, rule box, enhancements with costs, stratagem cards.
 */
export default function DetachmentCard({ det }: { det: EditableDetachment }) {
  const dispositions = det.dispositions
    .map((id) => DISPOSITIONS.find((d) => d.id === id)?.label ?? id)
    .join(", ");

  return (
    <div className="overflow-hidden rounded-lg border border-edge bg-surface">
      <header className="bg-gradient-to-r from-band-deep via-band to-band-deep px-3 py-2.5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-extrabold uppercase leading-tight tracking-wide text-white">
            {det.name || "Unnamed detachment"}
          </h2>
          <span className="shrink-0 rounded-sm border border-band-hi/40 bg-surface/60 px-2 py-1 text-[11px] font-semibold tabular-nums text-white">
            {det.points != null ? `${det.points} DP` : "? DP"}
          </span>
        </div>
        {dispositions && (
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-widest text-band-hi">
            {dispositions}
          </p>
        )}
      </header>

      {(det.ruleName || det.ruleText) && (
        <section>
          <div className={BAND_HEAD}>Detachment rule</div>
          <div className="px-3 py-2 text-[13px] leading-snug">
            {det.ruleName && (
              <p className="mb-1 font-bold uppercase tracking-wide text-band-hi">{det.ruleName}</p>
            )}
            <p className="whitespace-pre-wrap">{det.ruleText}</p>
          </div>
        </section>
      )}

      {det.enhancements.length > 0 && (
        <section>
          <div className={BAND_HEAD}>Enhancements</div>
          <div className="divide-y divide-edge px-3">
            {det.enhancements.map((enh, i) => (
              <div key={i} className="py-2 text-[13px] leading-snug">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 font-bold">
                    {enh.name || "Unnamed enhancement"}
                    {enh.upgrade && (
                      <span className="ml-1.5 rounded bg-band-hi/20 px-1.5 py-px align-middle text-[10px] font-semibold uppercase tracking-wide text-band-hi">
                        Upgrade
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-band-hi">
                    {enh.cost > 0 ? `${enh.cost} pts` : "? pts"}
                  </span>
                </div>
                {enh.restrictions.length > 0 && (
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                    {enh.restrictions.join(", ")} only
                  </p>
                )}
                <p className="mt-0.5 whitespace-pre-wrap">{enh.text}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {det.stratagems.length > 0 && (
        <section>
          <div className={BAND_HEAD}>Stratagems</div>
          <div className="grid gap-2 p-3 sm:grid-cols-2">
            {det.stratagems.map((strat, i) => (
              <StratagemBox key={i} strat={strat} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
