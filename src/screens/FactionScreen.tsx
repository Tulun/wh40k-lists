import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { MicroStats } from "../components/StatLine";
import { useDataset } from "../hooks/useDataset";
import { DISPOSITIONS } from "../lib/codex-model";
import { abilityText, fnpFromAbilityNames } from "../lib/describe";
import { byId } from "../lib/lookup";
import { codexBadge, useCodex } from "../store/codex";

const ROLE_ORDER: [string, string][] = [
  ["epic-hero", "Epic Heroes"],
  ["character", "Characters"],
  ["battleline", "Battleline"],
  ["", "Other"],
  ["dedicated-transport", "Dedicated Transports"],
  ["fortification", "Fortifications"],
  ["allied", "Allied"],
];

export default function FactionScreen() {
  const { factionId } = useParams();
  const data = useDataset();
  const doc = useCodex((s) => s.doc);
  const [query, setQuery] = useState("");

  if (!data) {
    return <p className="py-16 text-center text-xs text-ink-faint">Loading dataset…</p>;
  }

  const faction = factionId ? data.factions.getAny(factionId) : undefined;
  if (!faction || !factionId) {
    return (
      <p className="py-16 text-center text-sm text-ink-dim">
        Faction not found. <Link to="/explore" className="underline">Back to factions</Link>
      </p>
    );
  }

  const q = query.trim().toLowerCase();
  const units = data.units
    .byFaction(factionId)
    .filter(
      (u) =>
        !q ||
        u.name.toLowerCase().includes(q) ||
        (u.raw.keywords ?? []).some((k) => k.toLowerCase().includes(q)),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  const grouped = ROLE_ORDER.map(([role, label]) => ({
    label,
    units: units.filter((u) =>
      role === "" ? !ROLE_ORDER.some(([r]) => r !== "" && r === u.raw.role) : u.raw.role === role,
    ),
  })).filter((g) => g.units.length > 0);

  const detachments = [...data.detachments.byFaction(factionId)].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const armyRuleId = faction.raw.faction_rule_id;
  const armyRule = armyRuleId ? byId(data.abilities, armyRuleId, factionId) : undefined;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2">
        <h1 className="flex-1 text-lg font-bold">{faction.name}</h1>
        {codexBadge(doc, factionId) && (
          <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent">
            {codexBadge(doc, factionId) === "replace" ? "Leaked codex" : "Edited"}
          </span>
        )}
        <Link to={`/editor/${factionId}`} className="text-xs text-accent underline">
          edit
        </Link>
        <Link to="/explore" className="text-xs text-ink-faint underline">
          all factions
        </Link>
      </div>

      {armyRule && (
        <details className="rounded-md border border-edge">
          <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">
            Army rule <span className="text-xs font-normal text-ink-faint">· {armyRule.name}</span>
          </summary>
          <p className="mt-1 whitespace-pre-wrap px-3 pb-2 text-sm leading-snug">
            {abilityText(armyRule)}
          </p>
        </details>
      )}

      {detachments.length > 0 && (
        <details className="rounded-md border border-edge">
          <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">
            Detachments <span className="text-xs font-normal text-ink-faint">({detachments.length})</span>
          </summary>
          <ul className="divide-y divide-edge border-t border-edge">
            {detachments.map((d) => (
              <li key={d.id}>
                <Link
                  to={`/explore/${factionId}/detachment/${d.id}`}
                  className="flex min-h-11 items-center gap-2 px-3 py-1.5 active:bg-panel"
                >
                  <span className="min-w-0 flex-1">
                    <span className="text-sm font-medium">
                      {d.name}
                      {d.detachment_points != null && (
                        <span className="ml-1 text-xs font-normal text-ink-faint">
                          · {d.detachment_points} DP
                        </span>
                      )}
                    </span>
                    {(d.force_dispositions?.length ?? 0) > 0 && (
                      <span className="block text-xs text-ink-faint">
                        {d.force_dispositions!
                          .map((id) => DISPOSITIONS.find((x) => x.id === id)?.label ?? id)
                          .join(" · ")}
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-ink-faint">›</span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter units or keywords…"
        className="sticky top-13 z-10 w-full rounded-md border border-edge bg-panel px-3 py-2 text-sm"
      />

      {grouped.map(({ label, units: group }) => (
        <div key={label}>
          <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
            {label}
          </div>
          <ul className="divide-y divide-edge overflow-hidden rounded-md border border-edge">
            {group.map((u) => {
              const profile = u.raw.profiles[0];
              const fnp = fnpFromAbilityNames(u.abilities.map((a) => a.name));
              return (
                <li key={u.id}>
                  <Link
                    to={`/explore/${factionId}/${u.id}`}
                    className="flex min-h-11 items-center gap-2 px-3 py-1.5 active:bg-panel"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{u.name}</span>
                    {profile && <MicroStats profile={profile} fnp={fnp} />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
