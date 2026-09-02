import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import BackBar from "../components/BackBar";
import CrunchPanel from "../components/CrunchPanel";
import { useDataset } from "../hooks/useDataset";
import { dedupeRoster, narrowEntry } from "../lib/dedupe";
import { useActiveList } from "../store/lists";

/**
 * Standalone damage-output view for one roster entry. Reached from the unit's
 * page; the back bar names wherever the visitor came from (navigation state),
 * falling back to the unit's own page for deep links.
 */
export default function CrunchScreen() {
  const { entryKey } = useParams();
  const [searchParams] = useSearchParams();
  const list = useActiveList();
  const data = useDataset();
  const instParam = searchParams.get("i");

  const entry = useMemo(() => {
    if (!list || !entryKey) return null;
    const full = dedupeRoster(list.roster).find((e) => e.key === entryKey) ?? null;
    if (!full || instParam == null) return full;
    return narrowEntry(full, Number(instParam));
  }, [list, entryKey, instParam]);

  if (!list || !entry) {
    return (
      <p className="py-16 text-center text-sm text-ink-dim">
        Unit not found in the active list. <Link to="/" className="underline">Back to army</Link>
      </p>
    );
  }

  const unitUrl = `/unit/${encodeURIComponent(entry.key)}${instParam != null ? `?i=${instParam}` : ""}`;
  const unit = data
    ? data.resolveRosterUnit(
        list.roster.units[entry.instances[0].rosterIndex],
        data.dataset,
        list.roster.faction_id,
      )
    : undefined;
  const name = unit?.name ?? entry.name;

  return (
    <div className="space-y-3">
      <div className="sticky top-12 z-10 -mx-3 border-b border-edge bg-surface/95 px-3 py-1.5 backdrop-blur">
        <BackBar fallback={{ to: unitUrl, label: name }} />
        <h1 className="truncate text-base font-bold leading-tight">
          💥 Damage output <span className="font-normal text-ink-dim">· {name}</span>
        </h1>
      </div>

      {!data && <p className="py-8 text-center text-xs text-ink-faint">Loading datasheet data…</p>}
      {data && !unit && (
        <p className="rounded-md border border-opponent/40 bg-opponent/10 p-2 text-xs text-opponent">
          This unit couldn't be matched to the dataset, so there's nothing to compute. Re-import
          and pick a match to see damage output.
        </p>
      )}
      {data && unit && <CrunchPanel data={data} list={list} entry={entry} />}
    </div>
  );
}
