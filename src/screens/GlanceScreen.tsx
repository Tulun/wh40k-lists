import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { backState } from "../components/BackBar";
import CardColumns from "../components/CardColumns";
import FilterInput from "../components/FilterInput";
import GlanceSummary from "../components/GlanceSummary";
import StratagemCard from "../components/StratagemCard";
import { MicroStats } from "../components/StatLine";
import { useDataset } from "../hooks/useDataset";
import type { Data40k } from "../lib/data";
import { dedupeRoster, unitKey, type DisplayEntry } from "../lib/dedupe";
import { fnpFromAbilityNames } from "../lib/describe";
import { byId } from "../lib/lookup";
import { organizeArmy } from "../lib/organize";
import { shareText } from "../lib/share";
import { armyStratagems, sortStratagems } from "../lib/stratagems";
import { useActiveList, useLists } from "../store/lists";

export default function GlanceScreen() {
  const list = useActiveList();
  const activeSlot = useLists((s) => s.activeSlot);
  const data = useDataset();
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);

  /** Copy the shareable text (WTC-compact), same as the Lists screen's Share. */
  async function share() {
    if (!data || !list) return;
    await navigator.clipboard.writeText(shareText(data, list));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const entries = useMemo(
    () => (list ? dedupeRoster(list.roster) : []),
    [list],
  );

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
  const resolveAt = (i: number) =>
    data ? data.resolveRosterUnit(roster.units[i], data.dataset, roster.faction_id) : undefined;

  // Attached bricks first in their own section, then role sections — the
  // same layout the share export prints.
  const sections = organizeArmy(data, list);

  const q = query.trim().toLowerCase();
  const matches = (index: number) => {
    const ru = roster.units[index];
    if (ru.ref.raw_name.toLowerCase().includes(q)) return true;
    const raw = resolveAt(index)?.raw;
    return (
      (raw?.name.toLowerCase().includes(q) ?? false) ||
      (raw?.keywords ?? []).some((k) => k.toLowerCase().includes(q))
    );
  };

  const withEnhancements = entries.filter((e) => e.enhancement);

  return (
    <div className="space-y-3">
      <ArmyHeader
        data={data}
        roster={roster}
        listName={list.name}
        onShare={data ? share : undefined}
        copied={copied}
      />

      {data && <GlanceSummary data={data} roster={roster} listId={list.id} />}

      {withEnhancements.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {withEnhancements.map((e) => {
            const pts =
              e.instances[0].enhancementPoints ??
              (data ? byId(data.enhancements, e.enhancement?.id, roster.faction_id)?.cost : null);
            return (
              <Link
                key={e.key}
                to={`/unit/${encodeURIComponent(e.key)}?i=${e.instances[0].rosterIndex}`}
                className="rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs text-accent"
              >
                ✦ {enhancementName(data, e, roster.faction_id)} → {e.name}
                {pts != null && <span className="text-accent/70"> · {pts} pts</span>}
              </Link>
            );
          })}
        </div>
      )}

      <FilterInput
        value={query}
        onChange={setQuery}
        placeholder="Filter units or keywords…"
        className="sticky top-13 z-10"
      />

      {(() => {
        const row = (index: number, isLed: boolean) => {
          const ru = roster.units[index];
          const view = resolveAt(index);
          const profile = view?.raw.profiles[0];
          const fnp = view ? fnpFromAbilityNames(view.abilities.map((a) => a.name)) : null;
          const pts = (ru.points ?? 0) + (ru.enhancement_points ?? 0);
          const enhName = ru.enhancement
            ? data
              ? (byId(data.enhancements, ru.enhancement.id, roster.faction_id)?.name ??
                ru.enhancement.raw_name)
              : ru.enhancement.raw_name
            : null;
          return (
            <Link
              key={index}
              to={`/unit/${encodeURIComponent(unitKey(ru))}?i=${index}`}
              className={`block min-h-11 px-3 py-2 hover:bg-panel active:bg-panel ${isLed && !q ? "pl-6" : ""}`}
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {isLed && !q && <span className="text-ink-faint">↳ </span>}
                  {ru.is_warlord && <span title="Warlord">⭐ </span>}
                  {view?.name ?? ru.ref.raw_name}
                  {ru.enhancement && <span className="text-accent"> ✦</span>}
                  {!ru.ref.id && (
                    <span className="ml-1 text-[10px] text-opponent">unmatched</span>
                  )}
                </span>
                {profile ? (
                  <MicroStats profile={profile} fnp={fnp} />
                ) : (
                  <span className="text-xs text-ink-faint">{pts} pts</span>
                )}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-ink-faint">
                {ru.model_count} model{ru.model_count === 1 ? "" : "s"} · {pts} pts
                {enhName && <span className="text-accent/80"> · ✦ {enhName}</span>}
              </div>
            </Link>
          );
        };

        // Filtering breaks sections and pairs apart, so matches render as
        // single cards; otherwise sections get headers, and an attached group
        // stays one rounded block with air between blocks.
        if (q) {
          const hits = sections
            .flatMap((s) => s.blocks.flatMap((b) => b.indices))
            .filter(matches);
          return (
            <ul className="space-y-2">
              {hits.map((index) => (
                <li key={index} className="overflow-hidden rounded-lg border border-edge">
                  {row(index, false)}
                </li>
              ))}
            </ul>
          );
        }
        return sections.map((section) => (
          <section key={section.label}>
            <h2 className="px-1 pb-1.5 pt-1 text-[11px] font-bold uppercase tracking-wider text-ink-faint">
              {section.label}
            </h2>
            <ul className="space-y-2">
              {section.blocks.map((b) => (
                <li
                  key={b.indices[0]}
                  className={`overflow-hidden rounded-lg border ${
                    b.attached ? "border-accent/40" : "border-edge"
                  }`}
                >
                  <div className="divide-y divide-edge/60">
                    {b.indices.map((index, pos) =>
                      row(index, b.attached && pos === b.indices.length - 1),
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ));
      })()}

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

function ArmyHeader({
  data,
  roster,
  listName,
  onShare,
  copied,
}: {
  data: Data40k | null;
  roster: import("@alpaca-software/40kdc-data").Roster;
  listName: string;
  onShare?: () => void;
  copied?: boolean;
}) {
  const faction = data && roster.faction_id ? data.factions.getAny(roster.faction_id) : undefined;

  return (
    <div className="rounded-lg border border-edge bg-panel/50 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-bold">
          {faction?.name ?? roster.faction_id ?? "Unknown faction"}
        </span>
        {onShare && (
          <button
            type="button"
            onClick={() => void onShare()}
            className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
              copied ? "bg-accent/20 text-accent" : "bg-panel text-ink-dim"
            }`}
          >
            {copied ? "✓ Copied" : "Share"}
          </button>
        )}
        <span className="shrink-0 text-xs text-ink-dim">
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
        const header = (
          <div className="mt-0.5 text-xs text-ink-dim">
            {entity?.name ?? detachment.ref.raw_name}
            {detachment.dp_cost != null && (
              <span className="text-ink-faint"> · {detachment.dp_cost} DP</span>
            )}
          </div>
        );
        // Tapping the block opens the detachment's full page — rule text,
        // enhancements, and stratagems — when it resolves to a real entity.
        if (entity && roster.faction_id) {
          return (
            <Link
              key={detachment.ref.id ?? `${detachment.ref.raw_name}-${i}`}
              to={`/explore/${roster.faction_id}/detachment/${entity.id}`}
              state={backState("/", listName)}
              className="block hover:bg-panel active:bg-panel"
            >
              {header}
              {data &&
                ruleIds.map((id) => {
                  const ability = byId(data.abilities, id, roster.faction_id);
                  if (!ability) return null;
                  return (
                    <div
                      key={id}
                      className="mt-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-accent"
                    >
                      <span className="min-w-0 flex-1 truncate">{ability.name}</span>
                      <span aria-hidden>›</span>
                    </div>
                  );
                })}
            </Link>
          );
        }
        return <div key={detachment.ref.id ?? `${detachment.ref.raw_name}-${i}`}>{header}</div>;
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
    <details className="rounded-lg border border-edge">
      <summary className="cursor-pointer px-3 py-2.5 text-sm font-semibold">
        Stratagems{" "}
        <span className="text-xs font-normal text-ink-faint">
          ({detachment.length} detachment · {core.length} core)
        </span>
      </summary>
      <div className="px-2 pb-2">
        <CardColumns>
          {sortStratagems(detachment).map((s) => (
            <StratagemCard key={s.id} data={data} stratagem={s} factionId={roster.faction_id} listId={listId} />
          ))}
        </CardColumns>
        <div className="pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
          Core
        </div>
        <CardColumns>
          {sortStratagems(core).map((s) => (
            <StratagemCard key={s.id} data={data} stratagem={s} factionId={roster.faction_id} listId={listId} />
          ))}
        </CardColumns>
      </div>
    </details>
  );
}
