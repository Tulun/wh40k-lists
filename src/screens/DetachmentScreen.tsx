import { Link, useParams } from "react-router-dom";
import DetachmentCard from "../components/DetachmentCard";
import { useDataset } from "../hooks/useDataset";
import { detachmentView } from "../lib/detachment-view";

/** Explore-side detachment detail: rule, enhancements, and stratagems. */
export default function DetachmentScreen() {
  const { factionId, detId } = useParams();
  const data = useDataset();

  if (!data) {
    return <p className="py-16 text-center text-xs text-ink-faint">Loading dataset…</p>;
  }
  const det = factionId && detId ? detachmentView(data, factionId, detId) : null;
  if (!det || !factionId) {
    return (
      <p className="py-16 text-center text-sm text-ink-dim">
        Detachment not found.{" "}
        <Link to={`/explore/${factionId ?? ""}`} className="underline">
          Back to faction
        </Link>
      </p>
    );
  }
  const factionName = data.factions.getAny(factionId)?.name ?? factionId;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2">
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold">{det.name}</h1>
        <Link to={`/explore/${factionId}`} className="shrink-0 text-xs text-ink-faint underline">
          {factionName}
        </Link>
      </div>
      <DetachmentCard det={det} />
    </div>
  );
}
