import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import FilterInput from "./FilterInput";
import { MicroStats } from "./StatLine";
import type { Data40k } from "../lib/data";
import { fnpFromAbilityNames } from "../lib/describe";

export const ROLE_GROUPS: [string, string][] = [
  ["epic-hero", "Epic Heroes"],
  ["character", "Characters"],
  ["battleline", "Battleline"],
  ["", "Other"],
  ["dedicated-transport", "Dedicated Transports"],
  ["fortification", "Fortifications"],
  ["allied", "Allied"],
];

/** Bucket units under the ROLE_GROUPS headers, dropping empty groups. */
export function groupByRole<T extends { raw: { role?: string | null } }>(units: T[]) {
  return ROLE_GROUPS.map(([role, label]) => ({
    label,
    units: units.filter((u) =>
      role === "" ? !ROLE_GROUPS.some(([r]) => r !== "" && r === u.raw.role) : u.raw.role === role,
    ),
  })).filter((g) => g.units.length > 0);
}

/**
 * Filterable, role-grouped unit list for a faction. Full-width on the faction
 * screen; doubles as the master pane of the desktop two-pane explore view,
 * where `selectedId` highlights the open datasheet.
 */
export default function UnitListPane({
  data,
  factionId,
  selectedId,
}: {
  data: Data40k;
  factionId: string;
  selectedId?: string;
}) {
  const [query, setQuery] = useState("");

  // Keep the open datasheet visible in the pane's own scrollbox — matters when
  // landing directly on a unit deep in the list. "nearest" leaves the scroll
  // alone once it's already on screen.
  const selectedRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

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
  const grouped = groupByRole(units);

  return (
    <div className="space-y-3">
      <FilterInput value={query} onChange={setQuery} placeholder="Filter units or keywords…" />

      {grouped.map(({ label, units: group }) => (
        <div key={label}>
          <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
            {label}
          </div>
          <ul className="space-y-1.5">
            {group.map((u) => {
              const profile = u.raw.profiles[0];
              const fnp = fnpFromAbilityNames(u.abilities.map((a) => a.name));
              const selected = u.id === selectedId;
              return (
                <li
                  key={u.id}
                  className={`overflow-hidden rounded-lg border ${
                    selected ? "border-accent/60" : "border-edge"
                  }`}
                >
                  <Link
                    to={`/explore/${factionId}/${u.id}`}
                    ref={selected ? selectedRef : undefined}
                    aria-current={selected ? "page" : undefined}
                    // Desktop side pane is narrow, so rows stack: full-width
                    // name with the micro-stats beneath. Mobile keeps the
                    // single-line row.
                    className={`flex min-h-11 items-center gap-2 px-3 py-1.5 hover:bg-panel active:bg-panel lg:flex-wrap lg:gap-y-0.5 lg:py-2 ${
                      selected ? "bg-panel" : ""
                    }`}
                  >
                    <span
                      className={`min-w-0 flex-1 truncate text-sm font-medium lg:basis-full ${
                        selected ? "text-accent" : ""
                      }`}
                    >
                      {u.name}
                    </span>
                    {profile && <MicroStats profile={profile} fnp={fnp} />}
                    {/* First points tier only — the full size/cost table (and
                        any size picking) lives on the datasheet itself. */}
                    {u.raw.points?.[0] && (
                      <span className="shrink-0 text-xs tabular-nums text-ink-faint lg:ml-auto">
                        {u.raw.points[0].cost} pts
                      </span>
                    )}
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
