import { useState } from "react";
import type { Data40k } from "../lib/data";
import type { UnresolvedRef } from "../lib/overrides";

interface Props {
  data: Data40k;
  unresolved: UnresolvedRef;
  pickedId: string | null;
  onPick: (rawName: string, id: string | null) => void;
}

function searchCollection(data: Data40k, kind: UnresolvedRef["kind"], query: string) {
  const collection =
    kind === "unit"
      ? data.units
      : kind === "weapon"
        ? data.weapons
        : kind === "enhancement"
          ? data.enhancements
          : data.detachments;
  return collection.findAll(query).slice(0, 5);
}

export default function CandidatePicker({ data, unresolved, pickedId, onPick }: Props) {
  const { kind, ref } = unresolved;
  const [query, setQuery] = useState("");
  const searched = query.length >= 2 ? searchCollection(data, kind, query) : [];

  const options = [
    ...ref.candidates,
    ...searched
      .filter((v) => !ref.candidates.some((c) => c.id === v.id))
      .map((v) => ({ id: v.id, name: v.name })),
  ];

  return (
    <div className="rounded-md border border-amber-900/60 bg-amber-950/20 px-2.5 py-2">
      <div className="text-sm">
        <span className="rounded bg-panel px-1 py-px text-[10px] uppercase text-ink-faint">
          {kind}
        </span>{" "}
        <span className="font-medium">“{ref.raw_name}”</span>{" "}
        <span className="text-xs text-ink-faint">not recognized</span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {options.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onPick(ref.raw_name, pickedId === c.id ? null : c.id)}
            className={`rounded-full border px-2.5 py-1 text-xs ${
              pickedId === c.id
                ? "border-accent bg-accent/20 text-accent"
                : "border-edge bg-panel text-ink-dim"
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search the dataset…"
        className="mt-1.5 w-full rounded border border-edge bg-surface px-2 py-1 text-sm"
      />
      <p className="mt-1 text-[11px] text-ink-faint">
        Leave unpicked to keep it as text-only.
      </p>
    </div>
  );
}
