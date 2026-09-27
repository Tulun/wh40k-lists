import { useState } from "react";
import { Link } from "react-router-dom";
import type { Data40k } from "../lib/data";
import { DISPOSITION_SHORT, DISPOSITIONS } from "../lib/codex-model";

/**
 * The 11e Force Disposition matrix: pick your disposition, see the primary
 * mission you play against each opposing disposition (and the one they play
 * back at you). Defaults to the active list's disposition when it has one.
 */
export default function DispositionMatchups({
  data,
  initial,
}: {
  data: Data40k;
  initial?: string | null;
}) {
  const [mine, setMine] = useState<string>(initial ?? DISPOSITIONS[0].id);

  const matchups = data.missionMatchups.all;
  const missionName = (id: string | undefined) =>
    (id && data.missions.all.find((m) => m.id === id)?.name) ?? "—";
  const primary = (me: string, opp: string) =>
    missionName(
      matchups.find((m) => m.disposition === me && m.opponent_disposition === opp)?.mission_id,
    );

  if (matchups.length === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-bold uppercase tracking-wide text-accent">Primary missions</h2>
      <p className="text-xs text-ink-dim">
        Your primary depends on your Force Disposition and your opponent's.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {DISPOSITIONS.map((d) => (
          <button
            key={d.id}
            type="button"
            aria-pressed={mine === d.id}
            onClick={() => setMine(d.id)}
            className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
              mine === d.id
                ? "border-accent bg-accent/15 text-accent"
                : "border-edge text-ink-dim hover:text-ink"
            }`}
          >
            {DISPOSITION_SHORT[d.id] ?? d.label}
            {d.id === initial && " ★"}
          </button>
        ))}
      </div>
      <ul className="overflow-hidden rounded-lg border border-edge">
        {DISPOSITIONS.map((opp) => (
          <li key={opp.id} className="border-b border-edge last:border-b-0">
            <Link
              to={`/missions?me=${mine}&opp=${opp.id}`}
              className="flex items-baseline gap-3 px-3 py-2 hover:bg-panel active:bg-panel"
            >
              <span className="w-24 shrink-0 text-xs text-ink-faint">
                vs {DISPOSITION_SHORT[opp.id] ?? opp.label}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{primary(mine, opp.id)}</span>
                <span className="block text-[11px] text-ink-faint">
                  They play {primary(opp.id, mine)}
                </span>
              </span>
              <span className="self-center text-xs text-ink-faint">Map ›</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
