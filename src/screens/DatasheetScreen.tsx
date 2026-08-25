import { Link, useParams } from "react-router-dom";
import type { ResolvedRef } from "@alpaca-software/40kdc-data";
import AbilityBlock from "../components/AbilityBlock";
import KeywordChips from "../components/KeywordChips";
import { isProvisional } from "./UnitDetailScreen";
import StatLine from "../components/StatLine";
import WeaponTable from "../components/WeaponTable";
import { useDataset } from "../hooks/useDataset";
import type { MergedWeapon } from "../lib/dedupe";
import { abilityText } from "../lib/describe";

const ref = (id: string, name: string): ResolvedRef => ({
  id,
  raw_name: name,
  resolved: true,
  candidates: [],
});

/** Full datasheet straight from the dataset — no roster required. */
export default function DatasheetScreen() {
  const { factionId, unitId } = useParams();
  const data = useDataset();

  if (!data) {
    return <p className="py-16 text-center text-xs text-ink-faint">Loading dataset…</p>;
  }

  const unit =
    unitId && factionId
      ? (data.units.getInFaction(unitId, factionId) ?? data.units.getAny(unitId))
      : undefined;
  if (!unit || !factionId) {
    return (
      <p className="py-16 text-center text-sm text-ink-dim">
        Datasheet not found. <Link to="/explore" className="underline">Back to factions</Link>
      </p>
    );
  }

  const raw = unit.raw;
  const coreTags = unit.abilities.filter((a) => a.raw.ability_type === "core");
  const textAbilities = unit.abilities.filter((a) => a.raw.ability_type !== "core");
  // Show the unit's full arsenal as a weapon table (counts don't apply here).
  const allWeapons: MergedWeapon[] = unit.weapons.map((w) => ({
    ref: ref(w.id, w.name),
    totalCount: 0,
    perInstance: [],
    universal: true,
    carrierModels: [],
  }));
  const leaders = data.dataset.leadersAttachableTo(unit.id);
  const bodyguards = data.dataset.bodyguardsAttachableFrom(unit.id);

  return (
    <div className="space-y-4">
      <div className="sticky top-12 z-10 -mx-3 flex items-center gap-1 border-b border-edge bg-surface/95 px-1 py-1.5 backdrop-blur">
        <Link
          to={`/explore/${factionId}`}
          aria-label="Back to faction"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-lg text-accent active:bg-panel"
        >
          ←
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-base font-bold leading-tight">{unit.name}</h1>
        <span className="shrink-0 text-xs text-ink-dim">
          {(raw.points ?? []).map((p) => `${p.models ?? "?"}× ${p.cost}pts`).join(" · ")}
        </span>
        <Link
          to={`/editor/${factionId}/datasheet/${unit.id}`}
          aria-label="Edit this datasheet"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-sm text-accent active:bg-panel"
        >
          ✎
        </Link>
      </div>

      <div className="space-y-2">
        {raw.profiles.map((p, i) => (
          <StatLine key={i} profile={p} showName={raw.profiles.length > 1} />
        ))}
      </div>

      <KeywordChips coreTags={coreTags.map((a) => a.name)} keywords={raw.keywords ?? []} />

      {allWeapons.length > 0 && (
        <details open className="rounded-md border border-edge">
          <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">
            Weapon options
          </summary>
          <div className="px-2 pb-2">
            <WeaponTable data={data} weapons={allWeapons} factionId={factionId} showInstances={false} />
          </div>
        </details>
      )}

      {textAbilities.length > 0 && (
        <details open className="rounded-md border border-edge">
          <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">Abilities</summary>
          <div className="space-y-2 px-2 pb-2">
            {textAbilities.map((a) => (
              <AbilityBlock
                key={a.id}
                name={a.name}
                text={abilityText(a)}
                provisional={isProvisional(a.raw.game_version?.dataslate)}
              />
            ))}
          </div>
        </details>
      )}

      {(leaders.length > 0 || bodyguards.length > 0) && (
        <div className="space-y-1 text-xs text-ink-dim">
          {leaders.length > 0 && (
            <p>
              Can be led by:{" "}
              {leaders.map((l, i) => (
                <span key={l.id}>
                  {i > 0 && ", "}
                  <Link to={`/explore/${factionId}/${l.id}`} className="text-accent underline">
                    {l.name}
                  </Link>
                </span>
              ))}
            </p>
          )}
          {bodyguards.length > 0 && (
            <p>
              Can lead:{" "}
              {bodyguards.map((b, i) => (
                <span key={b.id}>
                  {i > 0 && ", "}
                  <Link to={`/explore/${factionId}/${b.id}`} className="text-accent underline">
                    {b.name}
                  </Link>
                </span>
              ))}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
