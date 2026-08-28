import { Link } from "react-router-dom";
import { useDataset } from "../hooks/useDataset";
import { EXPLORE_FACTION_IDS } from "../lib/flags";
import { codexBadge, useCodex } from "../store/codex";

const BADGE_LABEL = { replace: "Codex", patched: "Edited" } as const;

export default function ExploreScreen() {
  const data = useDataset();
  const doc = useCodex((s) => s.doc);

  if (!data) {
    return <p className="py-16 text-center text-xs text-ink-faint">Loading dataset…</p>;
  }

  const factions = data.factions.all
    .filter((f) => EXPLORE_FACTION_IDS?.includes(f.id) ?? true)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-bold">Explore factions</h1>
      <p className="text-xs text-ink-dim">
        Datasheets for the armies in play, list or no list. Handy for checking what a unit does —
        and for spotting data gaps worth reporting upstream.
      </p>
      <ul className="divide-y divide-edge overflow-hidden rounded-md border border-edge">
        {factions.map((f) => (
          <li key={f.id}>
            <Link
              to={`/explore/${f.id}`}
              className="flex min-h-11 items-center px-3 py-2 text-sm font-medium hover:bg-panel active:bg-panel"
            >
              <span className="flex-1">{f.name}</span>
              {codexBadge(doc, f.id) && (
                <span className="mr-2 rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent">
                  {BADGE_LABEL[codexBadge(doc, f.id)!]}
                </span>
              )}
              <span className="text-xs text-ink-faint">
                {data.units.byFaction(f.id).length} units ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
