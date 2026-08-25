import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { UnitView } from "@alpaca-software/40kdc-data";
import StratagemCard from "../components/StratagemCard";
import { MicroStats } from "../components/StatLine";
import { useDataset } from "../hooks/useDataset";
import type { Data40k } from "../lib/data";
import { dedupeRoster, type DisplayEntry } from "../lib/dedupe";
import { byId } from "../lib/lookup";
import { armyStratagems, sortStratagems } from "../lib/stratagems";
import { useActiveList, useLists } from "../store/lists";

const ROLE_ORDER: Record<string, number> = {
  "epic-hero": 0,
  character: 1,
  battleline: 2,
  "dedicated-transport": 4,
  fortification: 5,
  allied: 6,
};

export default function GlanceScreen() {
  const list = useActiveList();
  const activeSlot = useLists((s) => s.activeSlot);
  const data = useDataset();
  const [query, setQuery] = useState("");

  const entries = useMemo(
    () => (list ? dedupeRoster(list.roster) : []),
    [list],
  );

  const resolveUnit = (entry: DisplayEntry): UnitView | undefined => {
    if (!data || !list) return undefined;
    const rosterUnit = list.roster.units[entry.instances[0].rosterIndex];
    return data.resolveRosterUnit(rosterUnit, data.dataset, list.roster.faction_id);
  };

  if (!list) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="text-sm text-ink-dim">
          No list in the <span className="font-semibold">{activeSlot}</span> slot yet.
        </p>
        <Link to="/import" className="rounded-md bg-accent px-6 py-3 text-sm font-bold text-surface">
          Import a list
        </Link>
        <Link to="/lists" className="text-xs text-ink-faint underline">
          or pick a saved list
        </Link>
      </div>
    );
  }

  const roster = list.roster;
  const sorted = [...entries].sort((a, b) => {
    if (!data) return 0;
    const ra = ROLE_ORDER[resolveUnit(a)?.raw.role ?? ""] ?? 3;
    const rb = ROLE_ORDER[resolveUnit(b)?.raw.role ?? ""] ?? 3;
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name);
  });
  const q = query.trim().toLowerCase();
  const filtered = q
    ? sorted.filter((e) => {
        if (e.name.toLowerCase().includes(q)) return true;
        const raw = resolveUnit(e)?.raw;
        return (raw?.keywords ?? []).some((k) => k.toLowerCase().includes(q));
      })
    : sorted;

  const withEnhancements = entries.filter((e) => e.enhancement);

  return (
    <div className="space-y-3">
      <ArmyHeader data={data} roster={roster} />

      {withEnhancements.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {withEnhancements.map((e) => (
            <Link
              key={e.key}
              to={`/unit/${encodeURIComponent(e.key)}`}
              className="rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs text-accent"
            >
              ✦ {enhancementName(data, e, roster.faction_id)} → {e.name}
            </Link>
          ))}
        </div>
      )}

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter units or keywords…"
        className="sticky top-13 z-10 w-full rounded-md border border-edge bg-panel px-3 py-2 text-sm"
      />

      <ul className="divide-y divide-edge overflow-hidden rounded-md border border-edge">
        {filtered.map((entry) => {
          const profile = resolveUnit(entry)?.raw.profiles[0];
          return (
            <li key={entry.key}>
              <Link
                to={`/unit/${encodeURIComponent(entry.key)}`}
                className="flex min-h-11 items-center gap-2 px-3 py-1.5 active:bg-panel"
              >
                {entry.count > 1 && (
                  <span className="rounded bg-accent/20 px-1.5 py-px text-xs font-bold text-accent">
                    ×{entry.count}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {entry.isWarlord && <span title="Warlord">⭐ </span>}
                  {entry.name}
                  {entry.enhancement && <span className="text-accent"> ✦</span>}
                  {!entry.unitId && (
                    <span className="ml-1 text-[10px] text-opponent">unmatched</span>
                  )}
                </span>
                {profile ? (
                  <MicroStats profile={profile} />
                ) : (
                  <span className="text-xs text-ink-faint">{entry.totalPoints} pts</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      <StratagemSection data={data} roster={roster} listId={list.id} />
    </div>
  );
}

function enhancementName(
  data: Data40k | null,
  entry: DisplayEntry,
  factionId: string | null,
): string {
  const ref = entry.enhancement!;
  if (ref.id && data) return byId(data.enhancements, ref.id, factionId)?.name ?? ref.raw_name;
  return ref.raw_name;
}

function ArmyHeader({ data, roster }: { data: Data40k | null; roster: import("@alpaca-software/40kdc-data").Roster }) {
  const faction = data && roster.faction_id ? data.factions.getAny(roster.faction_id) : undefined;

  return (
    <div className="rounded-md border border-edge bg-panel/50 px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold">
          {faction?.name ?? roster.faction_id ?? "Unknown faction"}
        </span>
        <span className="text-xs text-ink-dim">
          {roster.points.total_computed}
          {roster.points.declared_limit ? `/${roster.points.declared_limit}` : ""} pts
        </span>
      </div>
      {roster.detachments.map((detachment, i) => {
        const entity = data
          ? byId(data.detachments, detachment.ref.id, roster.faction_id)
          : undefined;
        const ruleIds = entity?.detachment_rule_ids?.length
          ? entity.detachment_rule_ids
          : entity?.detachment_rule_id
            ? [entity.detachment_rule_id]
            : [];
        return (
          <div key={detachment.ref.id ?? `${detachment.ref.raw_name}-${i}`}>
            <div className="mt-0.5 text-xs text-ink-dim">
              {entity?.name ?? detachment.ref.raw_name}
              {detachment.dp_cost != null && (
                <span className="text-ink-faint"> · {detachment.dp_cost} DP</span>
              )}
            </div>
            {data &&
              ruleIds.map((id) => {
                const ability = byId(data.abilities, id, roster.faction_id);
                if (!ability) return null;
                return (
                  <details key={id} className="mt-1">
                    <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-accent">
                      {ability.name}
                    </summary>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-snug">
                      {ability.describe()}
                    </p>
                  </details>
                );
              })}
          </div>
        );
      })}
    </div>
  );
}

function StratagemSection({
  data,
  roster,
  listId,
}: {
  data: Data40k | null;
  roster: import("@alpaca-software/40kdc-data").Roster;
  listId: string;
}) {
  if (!data) return null;
  const detachmentIds = roster.detachments.map((d) => d.ref.id);
  const { detachment, core } = armyStratagems(data.stratagems.all, detachmentIds);

  return (
    <details className="rounded-md border border-edge">
      <summary className="cursor-pointer px-3 py-2.5 text-sm font-semibold">
        Stratagems{" "}
        <span className="text-xs font-normal text-ink-faint">
          ({detachment.length} detachment · {core.length} core)
        </span>
      </summary>
      <div className="space-y-2 px-2 pb-2">
        {sortStratagems(detachment).map((s) => (
          <StratagemCard key={s.id} data={data} stratagem={s} factionId={roster.faction_id} listId={listId} />
        ))}
        <div className="pt-1 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
          Core
        </div>
        {sortStratagems(core).map((s) => (
          <StratagemCard key={s.id} data={data} stratagem={s} factionId={roster.faction_id} listId={listId} />
        ))}
      </div>
    </details>
  );
}
