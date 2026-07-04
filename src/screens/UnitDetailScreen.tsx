import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import type { Enhancement } from "@alpaca-software/40kdc-data";
import AbilityBlock from "../components/AbilityBlock";
import StatLine from "../components/StatLine";
import StratagemCard from "../components/StratagemCard";
import WeaponTable from "../components/WeaponTable";
import { useDataset } from "../hooks/useDataset";
import type { Data40k } from "../lib/data";
import { dedupeRoster, type DisplayEntry } from "../lib/dedupe";
import { byId } from "../lib/lookup";
import { armyStratagems, sortStratagems, stratagemsForUnit } from "../lib/stratagems";
import { useActiveList } from "../store/lists";

export default function UnitDetailScreen() {
  const { entryKey } = useParams();
  const list = useActiveList();
  const data = useDataset();

  const entry = useMemo(() => {
    if (!list || !entryKey) return null;
    return dedupeRoster(list.roster).find((e) => e.key === entryKey) ?? null;
  }, [list, entryKey]);

  if (!list || !entry) {
    return (
      <p className="py-16 text-center text-sm text-ink-dim">
        Unit not found in the active list. <Link to="/" className="underline">Back to army</Link>
      </p>
    );
  }
  if (!data) {
    return (
      <div className="space-y-2 py-8 text-center">
        <p className="text-sm font-semibold">{entry.name}</p>
        <p className="text-xs text-ink-faint">Loading datasheet data…</p>
      </div>
    );
  }

  const roster = list.roster;
  const rosterUnit = roster.units[entry.instances[0].rosterIndex];
  const unit = data.resolveRosterUnit(rosterUnit, data.dataset, roster.faction_id);
  const raw = unit?.raw;
  const detachmentId = data.primaryDetachmentId(roster);
  const detachmentEntity = byId(data.detachments, detachmentId, roster.faction_id);

  const pools = armyStratagems(data.stratagems.all, detachmentId);
  const linkedStratagems = raw
    ? sortStratagems(
        stratagemsForUnit(raw, [...pools.detachment, ...pools.core], detachmentEntity),
      )
    : [];
  // Most stratagems have no authored target data yet; surface the rest of the
  // detachment's stratagems in a collapsed section so nothing is invisible.
  const linkedIds = new Set(linkedStratagems.map((s) => s.id));
  const otherDetachmentStratagems = sortStratagems(
    pools.detachment.filter((s) => !linkedIds.has(s.id)),
  );

  const enhancement = byId(data.enhancements, entry.enhancement?.id, roster.faction_id);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-2">
        <h1 className="flex-1 text-lg font-bold leading-tight">
          {entry.isWarlord && "⭐ "}
          {unit?.name ?? entry.name}
          {entry.count > 1 && <span className="ml-1.5 text-sm text-accent">×{entry.count}</span>}
        </h1>
        <span className="text-sm text-ink-dim">{entry.totalPoints} pts</span>
      </div>

      {!unit && (
        <p className="rounded-md border border-opponent/40 bg-opponent/10 p-2 text-xs text-opponent">
          This unit couldn't be matched to the dataset — showing list info only. Re-import
          and pick a match to see full stats.
        </p>
      )}

      {raw && (
        <div className="space-y-2">
          {raw.profiles.map((p, i) => (
            <StatLine key={i} profile={p} showName={raw.profiles.length > 1} />
          ))}
        </div>
      )}

      {entry.count > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {entry.instances.map((inst, i) => (
            <span key={i} className="rounded-md border border-edge bg-panel/50 px-2 py-1 text-xs text-ink-dim">
              #{i + 1}: {inst.modelCount} models
              {inst.points != null && ` · ${inst.points} pts`}
              {inst.isWarlord && " · ⭐"}
            </span>
          ))}
        </div>
      )}

      <Section title="Weapons" open>
        <WeaponTable
          data={data}
          weapons={entry.mergedWargear}
          factionId={roster.faction_id}
          showInstances={entry.count > 1}
        />
      </Section>

      {unit && unit.abilities.length > 0 && (
        <Section title="Abilities" open>
          <div className="space-y-2">
            {unit.abilities.map((a) => (
              <AbilityBlock key={a.id} name={a.name} text={a.describe()} />
            ))}
          </div>
        </Section>
      )}

      {entry.enhancement && (
        <Section title="Enhancement" open>
          <EnhancementCard
            data={data}
            rawName={entry.enhancement.raw_name}
            enhancement={enhancement}
            factionId={roster.faction_id}
            points={entry.instances[0].enhancementPoints}
          />
        </Section>
      )}

      <LeaderInfo data={data} entry={entry} factionId={roster.faction_id} />

      {linkedStratagems.length > 0 && (
        <Section title={`Stratagems targeting this unit (${linkedStratagems.length})`}>
          <div className="space-y-2">
            {linkedStratagems.map((s) => (
              <StratagemCard
                key={s.id}
                data={data}
                stratagem={s}
                factionId={roster.faction_id}
                listId={list.id}
              />
            ))}
          </div>
        </Section>
      )}

      {otherDetachmentStratagems.length > 0 && (
        <Section title={`Detachment stratagems (${otherDetachmentStratagems.length})`}>
          <div className="space-y-2">
            {otherDetachmentStratagems.map((s) => (
              <StratagemCard
                key={s.id}
                data={data}
                stratagem={s}
                factionId={roster.faction_id}
                listId={list.id}
              />
            ))}
          </div>
        </Section>
      )}

      <Link to="/" className="block pt-2 text-center text-xs text-ink-faint underline">
        ← back to army
      </Link>
    </div>
  );
}

function Section({
  title,
  open,
  children,
}: {
  title: string;
  open?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={open} className="rounded-md border border-edge">
      <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">{title}</summary>
      <div className="px-2 pb-2">{children}</div>
    </details>
  );
}

function EnhancementCard({
  data,
  rawName,
  enhancement,
  factionId,
  points,
}: {
  data: Data40k;
  rawName: string;
  enhancement: Enhancement | undefined;
  factionId: string | null;
  points: number | null;
}) {
  const ability = byId(data.abilities, enhancement?.ability_id, factionId);
  const cost = enhancement?.cost ?? points;
  return (
    <div className="rounded-md border border-accent/40 bg-accent/5 px-2.5 py-2">
      <div className="flex items-baseline gap-2">
        <span className="flex-1 text-xs font-bold uppercase tracking-wide text-accent">
          ✦ {enhancement?.name ?? rawName}
        </span>
        {cost != null && <span className="text-xs text-ink-dim">{cost} pts</span>}
      </div>
      {ability ? (
        <p className="mt-1 whitespace-pre-wrap text-sm leading-snug">{ability.describe()}</p>
      ) : (
        <p className="mt-1 text-xs italic text-ink-faint">
          No effect data yet — check the card or add a note on the stratagem screen.
        </p>
      )}
    </div>
  );
}

function LeaderInfo({
  data,
  entry,
  factionId,
}: {
  data: Data40k;
  entry: DisplayEntry;
  factionId: string | null;
}) {
  const attachments = entry.instances
    .map((inst, i) => ({ inst, i }))
    .filter(({ inst }) => inst.leaderAttachment);
  if (attachments.length === 0) return null;
  return (
    <div className="space-y-1">
      {attachments.map(({ inst, i }) => {
        const att = inst.leaderAttachment!;
        const bodyguardName =
          byId(data.units, att.bodyguard_ref.id, factionId)?.name ?? att.bodyguard_ref.raw_name;
        return (
          <p key={i} className="text-xs text-ink-dim">
            {entry.count > 1 ? `#${i + 1} ` : ""}
            {att.role === "leader" ? "Leads" : "Supported by"}{" "}
            <span className="font-medium text-ink">{bodyguardName}</span>
            {att.provisional && " (inferred)"}
          </p>
        );
      })}
    </div>
  );
}
