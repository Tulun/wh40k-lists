import { Link } from "react-router-dom";
import DispositionMatchups from "../components/DispositionMatchups";
import { useDataset } from "../hooks/useDataset";
import { CODEX_LIST_FACTION_IDS } from "../lib/flags";
import { codexBadge, useCodex } from "../store/codex";
import { useActiveList } from "../store/lists";

const BADGE_LABEL = { replace: "Codex", patched: "Edited" } as const;

export default function ExploreScreen() {
  const data = useDataset();
  const doc = useCodex((s) => s.doc);
  const activeList = useActiveList();

  if (!data) {
    return <p className="py-16 text-center text-xs text-ink-faint">Loading dataset…</p>;
  }

  // Codexes only: the hand-transcribed 11e books plus the hand-synced
  // upstream factions. Others stay reachable by deep link (list editor,
  // datasheet links).
  const factions = data.factions.all
    .filter((f) => CODEX_LIST_FACTION_IDS.includes(f.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold">Codexes</h1>
        <Link
          to="/editor"
          className="rounded-md border border-accent/50 px-4 py-2 text-sm font-bold text-accent"
        >
          ✎ Editor
        </Link>
      </div>
      <p className="text-xs text-ink-dim">
        Datasheets for the 11th edition armies, list or no list. Handy for checking what a unit
        does.
      </p>
      <ul className="space-y-2">
        {factions.map((f) => (
          <li key={f.id} className="overflow-hidden rounded-lg border border-edge">
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
      <DispositionMatchups data={data} initial={activeList?.roster.force_disposition} />
    </div>
  );
}
