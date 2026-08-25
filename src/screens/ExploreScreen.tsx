import { Link } from "react-router-dom";
import { useDataset } from "../hooks/useDataset";

export default function ExploreScreen() {
  const data = useDataset();

  if (!data) {
    return <p className="py-16 text-center text-xs text-ink-faint">Loading dataset…</p>;
  }

  const factions = [...data.factions.all].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-bold">Explore factions</h1>
      <p className="text-xs text-ink-dim">
        Every datasheet in the dataset, list or no list. Handy for checking what a unit does —
        and for spotting data gaps worth reporting upstream.
      </p>
      <ul className="divide-y divide-edge overflow-hidden rounded-md border border-edge">
        {factions.map((f) => (
          <li key={f.id}>
            <Link
              to={`/explore/${f.id}`}
              className="flex min-h-11 items-center px-3 py-2 text-sm font-medium active:bg-panel"
            >
              <span className="flex-1">{f.name}</span>
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
