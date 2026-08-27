import { useState } from "react";
import { Link } from "react-router-dom";
import { MicroStats } from "./StatLine";
import type { Data40k } from "../lib/data";
import { fnpFromAbilityNames } from "../lib/describe";

const ROLE_ORDER: [string, string][] = [
  ["epic-hero", "Epic Heroes"],
  ["character", "Characters"],
  ["battleline", "Battleline"],
  ["", "Other"],
  ["dedicated-transport", "Dedicated Transports"],
  ["fortification", "Fortifications"],
  ["allied", "Allied"],
];

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

  return (
    <div className="space-y-3">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter units or keywords…"
        className="w-full rounded-md border border-edge bg-panel px-3 py-2 text-sm"
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
              const selected = u.id === selectedId;
              return (
                <li key={u.id}>
                  <Link
                    to={`/explore/${factionId}/${u.id}`}
                    aria-current={selected ? "page" : undefined}
                    className={`flex min-h-11 items-center gap-2 px-3 py-1.5 hover:bg-panel active:bg-panel ${
                      selected ? "border-l-2 border-accent bg-panel pl-2.5" : ""
                    }`}
                  >
                    <span
                      className={`min-w-0 flex-1 truncate text-sm font-medium ${
                        selected ? "text-accent" : ""
                      }`}
                    >
                      {u.name}
                    </span>
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
