import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Enhancement } from "@alpaca-software/40kdc-data";
import AbilityBlock from "../components/AbilityBlock";
import KeywordChips from "../components/KeywordChips";
import StatLine from "../components/StatLine";
import StratagemCard from "../components/StratagemCard";
import WeaponTable from "../components/WeaponTable";
import { useDataset } from "../hooks/useDataset";
import { effectiveAttachments, leadersAttachedTo } from "../lib/attachments";
import type { Data40k } from "../lib/data";
import { dedupeRoster, type DisplayEntry } from "../lib/dedupe";
import { byId } from "../lib/lookup";
import { armyStratagems, sortStratagems, stratagemsForUnit } from "../lib/stratagems";
import { useActiveList, useLists } from "../store/lists";
import type { SavedList } from "../store/schema";

const ROLE_HINT_LABEL: Record<string, string> = {
  leader: "Leader",
  support: "Support — must attach",
  bodyguard: "Has character attached",
};

/** Dataslates like "pre-launch-provisional" mean 10e-ported, unverified data. */
export function isProvisional(dataslate: string | undefined): boolean {
  return dataslate?.includes("provisional") ?? false;
}

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
  const detachmentIds = roster.detachments.map((d) => d.ref.id);
  const detachmentEntities = detachmentIds
    .map((id) => byId(data.detachments, id, roster.faction_id))
    .filter((d) => d != null);

  const pools = armyStratagems(data.stratagems.all, detachmentIds);
  const linkedStratagems = raw
    ? sortStratagems(
        stratagemsForUnit(raw, [...pools.detachment, ...pools.core], detachmentEntities),
      )
    : [];
  // Most stratagems have no authored target data yet; surface the rest of the
  // detachment's stratagems in a collapsed section so nothing is invisible.
  const linkedIds = new Set(linkedStratagems.map((s) => s.id));
  const otherDetachmentStratagems = sortStratagems(
    pools.detachment.filter((s) => !linkedIds.has(s.id)),
  );

  const enhancement = byId(data.enhancements, entry.enhancement?.id, roster.faction_id);

  // Core abilities (Leader, Feel No Pain 5+, Deep Strike…) read fine as bare
  // tags — only datasheet-specific abilities get their full text below.
  const coreTags = unit ? unit.abilities.filter((a) => a.raw.ability_type === "core") : [];
  const textAbilities = unit
    ? unit.abilities.filter((a) => a.raw.ability_type !== "core")
    : [];

  return (
    <div className="space-y-4">
      <div className="sticky top-12 z-10 -mx-3 flex items-center gap-1 border-b border-edge bg-surface/95 px-1 py-1.5 backdrop-blur">
        <Link
          to="/"
          aria-label="Back to army"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-lg text-accent active:bg-panel"
        >
          ←
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-base font-bold leading-tight">
          {entry.isWarlord && "⭐ "}
          {unit?.name ?? entry.name}
          {entry.count > 1 && <span className="ml-1.5 text-sm text-accent">×{entry.count}</span>}
        </h1>
        <span className="shrink-0 pr-2 text-sm text-ink-dim">{entry.totalPoints} pts</span>
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

      <TagRow list={list} entry={entry} coreTags={coreTags.map((a) => a.name)} keywords={raw?.keywords ?? []} />

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

      {textAbilities.length > 0 && (
        <Section title="Abilities" open>
          <div className="space-y-2">
            {textAbilities.map((a) => (
              <AbilityBlock
                key={a.id}
                name={a.name}
                text={a.describe()}
                provisional={isProvisional(a.raw.game_version?.dataslate)}
              />
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
            listId={list.id}
          />
        </Section>
      )}

      <AttachmentBlock data={data} list={list} entry={entry} unitId={unit?.id ?? null} />

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
  listId,
}: {
  data: Data40k;
  rawName: string;
  enhancement: Enhancement | undefined;
  factionId: string | null;
  points: number | null;
  listId: string;
}) {
  const ability = byId(data.abilities, enhancement?.ability_id, factionId);
  const cost = enhancement?.cost ?? points;
  const name = enhancement?.name ?? rawName;
  const noteKey = enhancement?.id ?? `raw:${rawName}`;
  const note = useLists((s) => s.lists[listId]?.notes[noteKey] ?? "");
  const setNote = useLists((s) => s.setNote);
  const [editing, setEditing] = useState(false);
  const lookupUrl = `https://www.google.com/search?q=${encodeURIComponent(
    `40k enhancement "${name}"`,
  )}`;
  return (
    <div className="rounded-md border border-accent/40 bg-accent/5 px-2.5 py-2">
      <div className="flex items-baseline gap-2">
        <span className="flex-1 text-xs font-bold uppercase tracking-wide text-accent">
          ✦ {name}
        </span>
        {cost != null && <span className="text-xs text-ink-dim">{cost} pts</span>}
      </div>
      {ability ? (
        <p className="mt-1 whitespace-pre-wrap text-sm leading-snug">{ability.describe()}</p>
      ) : (
        <p className="mt-1 text-xs italic text-ink-faint">
          Effect not in the dataset yet —{" "}
          <a
            href={lookupUrl}
            target="_blank"
            rel="noreferrer"
            className="not-italic text-accent underline"
          >
            look it up ↗
          </a>
        </p>
      )}
      <div className="mt-1.5">
        {editing ? (
          <textarea
            autoFocus
            defaultValue={note}
            rows={2}
            placeholder="Your note (what this does)…"
            className="w-full rounded border border-edge bg-surface p-1.5 text-sm"
            onBlur={(e) => {
              setNote(listId, noteKey, e.target.value);
              setEditing(false);
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-left text-xs text-ink-faint underline decoration-dotted"
          >
            {note ? <span className="text-ink-dim">📝 {note}</span> : "+ add note"}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * One glanceable chip row: core-ability tags (accent), role hints from the
 * import (blue), important keywords (solid), then flavor keywords (faint).
 */
function TagRow({
  list,
  entry,
  coreTags,
  keywords,
}: {
  list: SavedList;
  entry: DisplayEntry;
  coreTags: string[];
  keywords: readonly string[];
}) {
  const hints = [
    ...new Set(
      entry.instances
        .map((inst) => list.roleHints[String(inst.rosterIndex)])
        .filter((h) => h != null),
    ),
    // The core "Leader" tag already covers the leader hint.
  ].filter((h) => !(h === "leader" && coreTags.includes("Leader")));

  return (
    <KeywordChips coreTags={coreTags} keywords={keywords}>
      {hints.map((h) => (
        <span
          key={h}
          className="rounded-full border border-mine/40 bg-mine/10 px-2.5 py-1 text-xs text-mine"
        >
          {ROLE_HINT_LABEL[h] ?? h}
        </span>
      ))}
    </KeywordChips>
  );
}

/** Label a roster unit, disambiguating duplicates: "Boyz (2nd)" */
function rosterUnitLabel(list: SavedList, index: number): string {
  const units = list.roster.units;
  const unit = units[index];
  const sameBefore = units
    .slice(0, index)
    .filter((u) => u.ref.id === unit.ref.id && u.ref.raw_name === unit.ref.raw_name).length;
  const total = units.filter(
    (u) => u.ref.id === unit.ref.id && u.ref.raw_name === unit.ref.raw_name,
  ).length;
  const ord = ["1st", "2nd", "3rd"][sameBefore] ?? `${sameBefore + 1}th`;
  return total > 1 ? `${unit.ref.raw_name} (${ord})` : unit.ref.raw_name;
}

/**
 * Attachments come from the imported list — declared at list build, inferred
 * where forced. Characters not pre-attached run solo (only Support markers
 * genuinely require a unit, so those get a warning when unmatched).
 * Character side: read-only "Leading …". Unit side: attached characters with
 * their buff abilities.
 */
function AttachmentBlock({
  data,
  list,
  entry,
  unitId,
}: {
  data: Data40k;
  list: SavedList;
  entry: DisplayEntry;
  unitId: string | null;
}) {
  const factionId = list.roster.faction_id;
  const raw = byId(data.units, unitId, factionId)?.raw;
  const hinted = entry.instances.some((inst) => {
    const h = list.roleHints[String(inst.rosterIndex)];
    return h === "leader" || h === "support";
  });
  const isCharacter = raw ? raw.role === "character" || raw.role === "epic-hero" : hinted;
  const attachments = effectiveAttachments(list);

  if (isCharacter) {
    const rows = entry.instances
      .map((inst, i) => ({ inst, i, bodyguard: attachments.get(inst.rosterIndex) }))
      .filter((r) => r.bodyguard !== undefined);
    const unmatchedSupport = entry.instances.some(
      (inst) =>
        list.roleHints[String(inst.rosterIndex)] === "support" &&
        attachments.get(inst.rosterIndex) === undefined,
    );

    if (rows.length === 0 && !unmatchedSupport) return null; // solo character
    return (
      <div className="space-y-1">
        {rows.map(({ i, bodyguard }) => (
          <p key={i} className="text-sm text-ink-dim">
            {entry.count > 1 && <span className="text-xs text-ink-faint">#{i + 1} </span>}
            ⟠ Leading{" "}
            <span className="font-medium text-ink">{rosterUnitLabel(list, bodyguard!)}</span>
          </p>
        ))}
        {unmatchedSupport && (
          <p className="rounded-md border border-opponent/40 bg-opponent/10 p-2 text-xs text-opponent">
            Support character — must be attached, but the list didn't say to which unit.
          </p>
        )}
      </div>
    );
  }

  // Unit side: characters attached to any instance of this entry.
  const leaders = leadersAttachedTo(
    list,
    entry.instances.map((i) => i.rosterIndex),
  );
  if (leaders.size === 0) return null;

  return (
    <Section title="Attached characters" open>
      <div className="space-y-2">
        {[...leaders.keys()].map((leaderIndex) => {
          const leaderUnit = list.roster.units[leaderIndex];
          const view = data.resolveRosterUnit(leaderUnit, data.dataset, factionId);
          return (
            <div key={leaderIndex} className="rounded-md border border-mine/40 bg-mine/5 px-2.5 py-2">
              <div className="text-xs font-bold uppercase tracking-wide text-mine">
                ⟠ {view?.name ?? leaderUnit.ref.raw_name}
                {entry.count > 1 && (
                  <span className="ml-1 font-normal text-ink-faint">
                    → #{entry.instances.findIndex((i) => i.rosterIndex === leaders.get(leaderIndex)) + 1}
                  </span>
                )}
              </div>
              {view?.abilities.map((a) => (
                <div key={a.id} className="mt-1.5">
                  <div className="text-[11px] font-semibold uppercase text-ink-dim">{a.name}</div>
                  <p className="whitespace-pre-wrap text-sm leading-snug">{a.describe()}</p>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </Section>
  );
}
