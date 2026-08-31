import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { RosterUnit, Unit } from "@alpaca-software/40kdc-data";
import Dropdown from "../components/Dropdown";
import FilterInput from "../components/FilterInput";
import { useDataset } from "../hooks/useDataset";
import type { Data40k } from "../lib/data";
import {
  addDetachment,
  addUnit,
  applyWargearOption,
  battlelineGrants,
  duplicateUnit,
  enhancementChoices,
  enhancementSlots,
  legalityIssues,
  loadoutDataMissing,
  nextSize,
  removeDetachment,
  removeUnit,
  repriceAll,
  setEnhancement,
  setFaction,
  setModelCount,
  setForceDisposition,
  setLeaderAttachment,
  setRawModelCount,
  setUnitPoints,
  setWarlord,
  setWeaponCount,
  sizeRange,
  wargearCounts,
  wargearOptionStates,
  type ListContent,
} from "../lib/list-edit";
import { DISPOSITIONS } from "../lib/codex-model";
import { abilityText } from "../lib/describe";
import { EXPLORE_FACTION_IDS } from "../lib/flags";
import { byId } from "../lib/lookup";
import { groupLoadoutSpread } from "../lib/group-loadout";
import { useLists } from "../store/lists";
import { backState } from "../components/BackBar";

/** Router state linking a reference page back to the edit screen it came from. */
function useEditBackState() {
  const { listId } = useParams();
  const listName = useLists((s) => (listId ? s.lists[listId]?.name : undefined));
  return listId ? backState(`/lists/${listId}/edit`, listName ?? "Edit list") : undefined;
}

export default function ListEditScreen() {
  const { listId } = useParams();
  const list = useLists((s) => (listId ? (s.lists[listId] ?? null) : null));
  const updateListContent = useLists((s) => s.updateListContent);
  const data = useDataset();
  const editBack = useEditBackState();

  const issues = useMemo(
    () => (data && list ? legalityIssues(data, list.roster, list.attachments) : []),
    [data, list],
  );

  // Opening the editor snaps stored costs to the dataset (imports sometimes
  // roll an upgrade's cost into the printed unit cost, e.g. Deffkoptas at 170).
  useEffect(() => {
    if (!list || !data) return;
    const repriced = repriceAll(data, {
      roster: list.roster,
      roleHints: list.roleHints,
      attachments: list.attachments,
    });
    const changed =
      repriced.roster.points.total_computed !== list.roster.points.total_computed ||
      repriced.roster.units.some(
        (u, i) =>
          u.points !== list.roster.units[i].points ||
          u.enhancement_points !== list.roster.units[i].enhancement_points,
      );
    if (changed) {
      updateListContent(list.id, {
        ...repriced,
        rawText: data.exportRoster(repriced.roster, "roster-json"),
      });
    }
    // Run once per list per dataset build — not on every store write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list?.id, data]);

  if (!list) {
    return (
      <p className="py-16 text-center text-sm text-ink-dim">
        List not found. <Link to="/lists" className="underline">Back to lists</Link>
      </p>
    );
  }
  if (!data) {
    return <p className="py-16 text-center text-xs text-ink-faint">Loading dataset…</p>;
  }

  const roster = list.roster;
  const factionId = roster.faction_id;
  const content: ListContent = {
    roster,
    roleHints: list.roleHints,
    attachments: list.attachments,
  };
  const apply = (next: ListContent) =>
    updateListContent(list.id, {
      ...next,
      rawText: data.exportRoster(next.roster, "roster-json"),
    });

  const detachmentPool = factionId
    ? [...data.detachments.byFaction(factionId)]
        .filter((d) => !roster.detachments.some((rd) => rd.ref.id === d.id))
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];
  const dpSpent = roster.detachments.reduce((s, d) => s + (d.dp_cost ?? 0), 0);
  const enhSlots = enhancementSlots(roster);
  // The dispositions the chosen detachments grant; empty = data unrecorded, offer all.
  const grantedDispositions = new Set(
    roster.detachments.flatMap(
      (d) => byId(data.detachments, d.ref.id, factionId)?.force_dispositions ?? [],
    ),
  );

  return (
    <div className="space-y-3 pb-8">
      <div className="sticky top-12 z-10 -mx-3 flex items-center justify-between gap-2 border-b border-edge bg-surface/95 px-3 py-1.5 backdrop-blur">
        <h1 className="text-lg font-bold">Edit list</h1>
        <Link
          to="/lists"
          className="rounded-md bg-accent px-4 py-1.5 text-sm font-bold text-surface"
        >
          Done
        </Link>
      </div>

      <input
        defaultValue={list.name}
        onBlur={(e) => {
          const name = e.target.value.trim();
          if (name && name !== list.name) updateListContent(list.id, { name });
        }}
        placeholder="List name"
        className="w-full rounded-md border border-edge bg-panel px-3 py-2 text-sm font-semibold"
      />

      <div className="rounded-lg border border-edge bg-panel/50 px-3 py-2">
        <div className="flex items-baseline justify-between gap-2">
          {factionId || roster.units.length > 0 ? (
            <span className="text-sm font-bold">
              {(factionId && data.factions.getAny(factionId)?.name) ?? "Unknown faction"}
            </span>
          ) : (
            <div className="min-w-0 flex-1">
              <Dropdown
                value={null}
                placeholder="Pick a faction to start"
                options={(EXPLORE_FACTION_IDS ?? data.factions.all.map((f) => f.id))
                  .map((id) => ({ value: id, label: data.factions.getAny(id)?.name ?? id }))
                  .sort((a, b) => a.label.localeCompare(b.label))}
                onChange={(id) => {
                  if (id) apply(setFaction(content, id));
                }}
              />
            </div>
          )}
          <span className="text-sm font-bold text-accent">
            {enhSlots.used > 0 && (
              <span
                title="Enhancement & upgrade slots used"
                className={`mr-2 text-xs font-normal ${
                  enhSlots.used > enhSlots.limit ? "text-opponent" : "text-ink-dim"
                }`}
              >
                ✦ {enhSlots.used}/{enhSlots.limit} enhancements
              </span>
            )}
            {roster.points.total_computed}
            {roster.points.declared_limit ? `/${roster.points.declared_limit}` : ""} pts
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {roster.detachments.map((d, i) => (
            <span
              key={d.ref.id ?? `${d.ref.raw_name}-${i}`}
              className="inline-flex items-center gap-1 rounded-full border border-edge bg-panel px-2.5 py-1 text-xs"
            >
              {d.ref.id && factionId ? (
                <Link
                  to={`/explore/${factionId}/detachment/${d.ref.id}`}
                  state={editBack}
                  className="hover:underline"
                >
                  {byId(data.detachments, d.ref.id, factionId)?.name ?? d.ref.raw_name}
                </Link>
              ) : (
                d.ref.raw_name
              )}
              {d.dp_cost != null && <span className="text-ink-faint">{d.dp_cost} DP</span>}
              <button
                type="button"
                aria-label="Remove detachment"
                className="px-0.5 text-ink-faint"
                onClick={() => apply(removeDetachment(data, content, i))}
              >
                ✕
              </button>
            </span>
          ))}
          {detachmentPool.length > 0 && (
            <Dropdown
              value={null}
              placeholder="+ detachment"
              options={detachmentPool.map((d) => ({
                value: d.id,
                label: d.name,
                detail: d.detachment_points != null ? `${d.detachment_points} DP` : undefined,
              }))}
              onChange={(id) => {
                if (id) apply(addDetachment(data, content, id));
              }}
            />
          )}
          {roster.points.detachment_cap != null && (
            <span className="text-xs text-ink-faint">
              {dpSpent}/{roster.points.detachment_cap} DP
            </span>
          )}
        </div>

        <div className="mt-2 flex items-center gap-2">
          <span className="shrink-0 text-xs text-ink-faint">Disposition</span>
          <div className="min-w-0 flex-1">
            <Dropdown
              value={roster.force_disposition ?? null}
              placeholder="Not picked"
              clearable
              options={DISPOSITIONS.map((d) => ({
                value: d.id,
                label: d.label,
                detail: grantedDispositions.has(d.id) ? "granted" : undefined,
                disabled: grantedDispositions.size > 0 && !grantedDispositions.has(d.id),
              }))}
              onChange={(id) => apply(setForceDisposition(content, id))}
            />
          </div>
        </div>
      </div>

      {issues.length > 0 && (
        <details className="rounded-lg border border-opponent/40 bg-opponent/10">
          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-opponent">
            ⚠ {issues.length} legality issue{issues.length === 1 ? "" : "s"}
          </summary>
          <ul className="list-inside list-disc space-y-1 px-3 pb-2 text-xs text-ink-dim">
            {issues.map((msg, i) => (
              <li key={i}>{msg}</li>
            ))}
          </ul>
        </details>
      )}

      <UnitGroups data={data} content={content} apply={apply} />

      <Link to={`/import?edit=${list.id}`} className="block text-xs text-ink-faint underline">
        Edit as text (re-import) →
      </Link>
    </div>
  );
}

/**
 * GW-app-style list sections: one header per role category with its points
 * subtotal and a + that expands an add-picker in place — no scrolling to a
 * single add box at the bottom, on any screen size.
 */
const SECTIONS: { key: string; label: string; roles: string[] }[] = [
  { key: "characters", label: "Characters", roles: ["epic-hero", "character"] },
  { key: "battleline", label: "Battleline", roles: ["battleline"] },
  { key: "transports", label: "Dedicated Transports", roles: ["dedicated-transport"] },
  { key: "fortifications", label: "Fortifications", roles: ["fortification"] },
  { key: "allied", label: "Allied", roles: ["allied"] },
  { key: "other", label: "Other Datasheets", roles: [] }, // catch-all
];
const KNOWN_ROLES = new Set(SECTIONS.flatMap((s) => s.roles));
const sectionKeyOf = (role: string | null | undefined) =>
  (role && SECTIONS.find((s) => s.roles.includes(role))?.key) ?? "other";

/** Copies of each datasheet in the list, keyed by datasheet id. */
function countsInList(roster: ListContent["roster"]): Map<string, number> {
  const inList = new Map<string, number>();
  for (const u of roster.units) {
    if (u.ref.id) inList.set(u.ref.id, (inList.get(u.ref.id) ?? 0) + 1);
  }
  return inList;
}

// The conventional cap on copies of a datasheet (rule of three;
// battleline/transports six, epic heroes one). Advisory only — the dataset
// records no per-datasheet limit to check against.
const capFor = (role: string | null | undefined) =>
  role === "epic-hero" ? 1 : role === "battleline" || role === "dedicated-transport" ? 6 : 3;

/** Inline add-picker for one section: filter box + that category's datasheets. */
function AddSection({
  data,
  content,
  apply,
  section,
}: {
  data: Data40k;
  content: ListContent;
  apply: (next: ListContent) => void;
  section: (typeof SECTIONS)[number];
}) {
  const [query, setQuery] = useState("");
  const factionId = content.roster.faction_id;
  if (!factionId) return null;
  const q = query.trim().toLowerCase();
  const inList = countsInList(content.roster);
  // Detachment-granted Battleline units list (and cap) as Battleline.
  const granted = battlelineGrants(data, content.roster);
  const roleFor = (u: { id: string; raw: { role?: string | null } }) =>
    granted.has(u.id) ? "battleline" : u.raw.role;
  const units = data.units
    .byFaction(factionId)
    .filter((u) =>
      section.roles.length > 0
        ? section.roles.includes(roleFor(u) ?? "")
        : !KNOWN_ROLES.has(roleFor(u) ?? ""),
    )
    .filter(
      (u) =>
        !q ||
        u.name.toLowerCase().includes(q) ||
        (u.raw.keywords ?? []).some((k) => k.toLowerCase().includes(q)),
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="rounded-lg border border-edge bg-panel/50 p-2">
      <FilterInput value={query} onChange={setQuery} placeholder="Filter datasheets…" />
      <ul className="mt-2 max-h-72 divide-y divide-edge overflow-y-auto rounded-md border border-edge lg:max-h-96">
        {units.map((u) => {
          const taken = inList.get(u.id) ?? 0;
          const cap = capFor(roleFor(u));
          const full = taken >= cap;
          return (
            <li key={u.id}>
              <button
                type="button"
                disabled={full}
                className={`flex min-h-11 w-full items-center gap-2 px-3 py-1.5 text-left ${
                  full ? "opacity-40" : "hover:bg-panel active:bg-panel"
                }`}
                onClick={() => apply(addUnit(data, content, u.id))}
              >
                <span className="min-w-0 flex-1 truncate text-sm">{u.name}</span>
                {taken > 0 && (
                  <span className="shrink-0 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-accent">
                    {taken}/{cap}
                  </span>
                )}
                <span className="shrink-0 text-xs text-ink-faint">
                  {u.raw.points?.[0]
                    ? `${u.raw.points[0].models}m · ${u.raw.points[0].cost} pts`
                    : "? pts"}
                </span>
              </button>
            </li>
          );
        })}
        {units.length === 0 && (
          <li className="py-4 text-center text-xs text-ink-faint">No datasheets match.</li>
        )}
      </ul>
    </div>
  );
}

/**
 * The army as GW-app-style role sections (Characters, Battleline, …), each
 * with a points subtotal and a + that expands an add-picker in place.
 * Attached pairings render as one bordered block — leaders ride with their
 * unit, and the block lives in the LED UNIT's section (a Warboss leading
 * Boyz shows under Battleline, like the official app).
 */
function UnitGroups({
  data,
  content,
  apply,
}: {
  data: Data40k;
  content: ListContent;
  apply: (next: ListContent) => void;
}) {
  const [addOpen, setAddOpen] = useState<string | null>(null);
  // A tap outside the open add-picker (its header and filter included) folds
  // it away — same manners as the wargear block. Unmounting also resets the
  // picker's filter for next time.
  const openPickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (addOpen == null) return;
    const onDown = (e: PointerEvent) => {
      if (openPickerRef.current && !openPickerRef.current.contains(e.target as Node)) {
        setAddOpen(null);
      }
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [addOpen]);
  const roster = content.roster;
  const factionId = roster.faction_id;
  const bodyguardOf = new Map<number, number>();
  const leadersOf = new Map<number, number[]>();
  for (const [l, b] of Object.entries(content.attachments)) {
    const li = Number(l);
    if (!roster.units[li] || !roster.units[b]) continue;
    bodyguardOf.set(li, b);
    if (!leadersOf.has(b)) leadersOf.set(b, []);
    leadersOf.get(b)!.push(li);
  }
  for (const leaders of leadersOf.values()) leaders.sort((a, b) => a - b);

  // Detachment rules can promote datasheets to Battleline (Kult of Speed's
  // Warbikers, Runt Swarm's Gretchin) — those units section as Battleline.
  const granted = battlelineGrants(data, roster);
  const sectionAt = (i: number) => {
    const id = roster.units[i].ref.id;
    if (id && granted.has(id)) return "battleline";
    return sectionKeyOf(
      id ? byId(data.units, id, factionId)?.raw.role : undefined,
    );
  };
  const ptsOf = (i: number) =>
    (roster.units[i].points ?? 0) + (roster.units[i].enhancement_points ?? 0);

  // One entry per rendered block. An attached block sits in the HIGHEST
  // section any of its members belongs to — a character leading Warbikers
  // stays up under Characters rather than being pulled down to Battleline.
  const sectionRank = (key: string) => SECTIONS.findIndex((s) => s.key === key);
  const nameAt = (i: number) => {
    const id = roster.units[i].ref.id;
    return (id && byId(data.units, id, factionId)?.name) || roster.units[i].ref.raw_name;
  };
  const entries: {
    key: string;
    section: string;
    points: number;
    attached: boolean;
    sortName: string;
    node: React.ReactNode;
  }[] = [];
  roster.units.forEach((u, i) => {
    const key = `${u.ref.id ?? u.ref.raw_name}-${i}`;
    if (leadersOf.has(i)) {
      const leaders = leadersOf.get(i)!;
      entries.push({
        key,
        section: [i, ...leaders]
          .map(sectionAt)
          .reduce((a, b) => (sectionRank(a) <= sectionRank(b) ? a : b)),
        attached: true,
        sortName: nameAt(leaders[0]),
        points: ptsOf(i) + leaders.reduce((s, li) => s + ptsOf(li), 0),
        node: (
          <li key={key} className="space-y-1 rounded-lg border border-accent/40 p-1">
            <p className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-wide text-accent">
              Attached unit
            </p>
            {leaders.map((li) => (
              <UnitRow key={li} data={data} content={content} index={li} apply={apply} />
            ))}
            <UnitRow data={data} content={content} index={i} apply={apply} />
          </li>
        ),
      });
      return;
    }
    if (bodyguardOf.has(i)) return; // renders inside its unit's block
    entries.push({
      key,
      section: sectionAt(i),
      attached: false,
      sortName: nameAt(i),
      points: ptsOf(i),
      node: (
        <li key={key}>
          <UnitRow data={data} content={content} index={i} apply={apply} />
        </li>
      ),
    });
  });

  // A section shows when it holds units or has datasheets to add.
  const addable = new Set(
    factionId
      ? data.units
          .byFaction(factionId)
          .map((u) => (granted.has(u.id) ? "battleline" : sectionKeyOf(u.raw.role)))
      : [],
  );

  return (
    <div className="space-y-3">
      {SECTIONS.map((section) => {
        // Attached blocks first, then everything alphabetically.
        const own = entries
          .filter((e) => e.section === section.key)
          .sort(
            (a, b) =>
              Number(b.attached) - Number(a.attached) || a.sortName.localeCompare(b.sortName),
          );
        if (own.length === 0 && !addable.has(section.key)) return null;
        const pts = own.reduce((s, e) => s + e.points, 0);
        const open = addOpen === section.key;
        return (
          <div key={section.key} className="space-y-2">
            <div ref={open ? openPickerRef : undefined} className="space-y-2">
              <div className="flex min-h-9 items-center gap-2 rounded-md bg-panel px-3 py-1.5">
                <h2 className="min-w-0 flex-1 truncate text-xs font-bold uppercase tracking-wide">
                  {section.label}
                </h2>
                <span className="shrink-0 text-xs tabular-nums text-ink-dim">{pts} pts</span>
                {addable.has(section.key) && (
                  <button
                    type="button"
                    aria-label={`Add ${section.label}`}
                    aria-expanded={open}
                    onClick={() => setAddOpen(open ? null : section.key)}
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-base leading-none ${
                      open
                        ? "border-accent bg-accent/15 text-accent"
                        : "border-edge text-ink-dim hover:text-ink"
                    }`}
                  >
                    {open ? "✕" : "+"}
                  </button>
                )}
              </div>
              {open && <AddSection data={data} content={content} apply={apply} section={section} />}
            </div>
            {own.length > 0 && <ul className="space-y-2">{own.map((e) => e.node)}</ul>}
          </div>
        );
      })}
    </div>
  );
}

function UnitRow({
  data,
  content,
  index,
  apply,
}: {
  data: Data40k;
  content: ListContent;
  index: number;
  apply: (next: ListContent) => void;
}) {
  const roster = content.roster;
  const u = roster.units[index];
  const view = data.resolveRosterUnit(u, data.dataset, roster.faction_id);
  const unit = view?.raw;
  const name = unit?.name ?? u.ref.raw_name;
  const pts = (u.points ?? 0) + (u.enhancement_points ?? 0);
  const isCharacter = unit?.role === "character" || unit?.role === "epic-hero";
  const editBack = useEditBackState();

  return (
    <div className="rounded-lg border border-edge bg-panel/50 px-3 py-2">
      <div className="flex items-baseline gap-2">
        {unit && roster.faction_id ? (
          <Link
            to={`/explore/${roster.faction_id}/${unit.id}`}
            state={editBack}
            className="min-w-0 flex-1 truncate text-sm font-semibold hover:underline"
          >
            {name} <span className="font-normal text-ink-faint">›</span>
          </Link>
        ) : (
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">
            {name}
            {!unit && <span className="ml-1 text-[10px] text-opponent">unmatched</span>}
          </span>
        )}
        <span className="shrink-0 text-xs text-ink-faint">
          {u.points == null ? "? pts" : `${pts} pts`}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {unit ? (
          <SizeStepper data={data} unit={unit} rosterUnit={u} onSet={(n) => apply(setModelCount(data, content, index, n))} />
        ) : (
          <label className="flex items-center gap-1 text-xs text-ink-dim">
            models
            <input
              type="number"
              min={1}
              value={u.model_count}
              onChange={(e) => apply(setRawModelCount(content, index, Number(e.target.value)))}
              className="w-14 rounded-md border border-edge bg-panel px-2 py-1 text-sm"
            />
          </label>
        )}

        {(!unit || u.points == null) && (
          <label className="flex items-center gap-1 text-xs text-ink-dim">
            pts
            <input
              type="number"
              min={0}
              value={u.points ?? 0}
              onChange={(e) =>
                apply(setUnitPoints(content, index, Number(e.target.value) || null))
              }
              className="w-16 rounded-md border border-edge bg-panel px-2 py-1 text-sm"
            />
          </label>
        )}

        {isCharacter && (
          <button
            type="button"
            title="Warlord"
            onClick={() => apply(setWarlord(content, index, !u.is_warlord))}
            className={`rounded-md px-2 py-1 text-xs ${
              u.is_warlord ? "bg-accent/20 text-accent" : "bg-panel text-ink-faint"
            }`}
          >
            ⭐ Warlord
          </button>
        )}

        <span className="flex-1" />

        {unit && roster.faction_id && (
          <Link
            to={`/explore/${roster.faction_id}/${unit.id}`}
            state={editBack}
            className="rounded-md bg-panel px-2.5 py-1.5 text-xs font-semibold text-ink-dim"
          >
            Datasheet
          </Link>
        )}
        <button
          type="button"
          title={unit?.role === "epic-hero" ? "Epic heroes are unique" : "Duplicate unit"}
          disabled={unit?.role === "epic-hero"}
          onClick={() => apply(duplicateUnit(data, content, index))}
          className={`rounded-md bg-panel px-3 py-1.5 text-xs text-ink-dim ${
            unit?.role === "epic-hero" ? "opacity-40" : ""
          }`}
        >
          Copy
        </button>
        <button
          type="button"
          title="Remove unit"
          onClick={() => apply(removeUnit(data, content, index))}
          className="ml-1 rounded-md bg-panel px-3 py-1.5 text-xs text-opponent"
        >
          Delete
        </button>
      </div>

      <EnhancementPicker data={data} content={content} index={index} apply={apply} />

      {unit && (
        <AttachPicker data={data} content={content} index={index} unit={unit} apply={apply} />
      )}

      {unit && (
        <WargearEditor data={data} content={content} index={index} unit={unit} apply={apply} />
      )}
    </div>
  );
}

/**
 * "Leads" dropdown for a character that can attach: eligible bodyguard units
 * present in the roster, from the dataset's leader-attachment data.
 */
function AttachPicker({
  data,
  content,
  index,
  unit,
  apply,
}: {
  data: Data40k;
  content: ListContent;
  index: number;
  unit: Unit;
  apply: (next: ListContent) => void;
}) {
  const roster = content.roster;
  const eligible = new Set(data.dataset.bodyguardsAttachableFrom(unit.id).map((v) => v.id));
  const current = content.attachments[String(index)] ?? null;
  if (eligible.size === 0 && current == null) return null;
  // A unit takes at most 1 leader and 1 support. Each option names whichever
  // it already has ("Leader: Big Mek · Support: Mek"); it greys out only when
  // this character's own role class is the one taken, so a support can still
  // join a led unit and vice versa.
  const roleOf = (i: number) => {
    const u = roster.units[i];
    const ent = u.ref.id ? byId(data.units, u.ref.id, roster.faction_id)?.raw : undefined;
    return ent?.attachment_role === "support" ? "support" : "leader";
  };
  const attachedTo = new Map<number, { leader?: number; support?: number }>();
  for (const [l, b] of Object.entries(content.attachments)) {
    const li = Number(l);
    if (li === index) continue; // this character's own pick shows as the ✓
    const rec = attachedTo.get(b) ?? {};
    rec[roleOf(li)] = li;
    attachedTo.set(b, rec);
  }
  const candidates = roster.units
    .map((u, i) => ({ u, i }))
    .filter(({ u, i }) => i !== index && u.ref.id != null && eligible.has(u.ref.id));
  if (candidates.length === 0 && current == null) return null;

  const nameOf = (i: number) => {
    const u = roster.units[i];
    return byId(data.units, u.ref.id, roster.faction_id)?.name ?? u.ref.raw_name;
  };
  const gearOf = (i: number) => {
    const u = roster.units[i];
    return u.wargear
      .filter((w) => w.count > 0)
      .map((w) => {
        const name = w.ref.id
          ? (byId(data.weapons, w.ref.id, roster.faction_id)?.name ??
            byId(data.wargear, w.ref.id, roster.faction_id)?.name ??
            w.ref.raw_name)
          : w.ref.raw_name;
        return `${w.count}× ${name}`;
      })
      .join(", ");
  };
  const describe = (i: number) => {
    const u = roster.units[i];
    const pts = (u.points ?? 0) + (u.enhancement_points ?? 0);
    return {
      detail: `${u.model_count} model${u.model_count === 1 ? "" : "s"} · ${pts} pts`,
      sub: gearOf(i) || undefined,
    };
  };
  const nth = new Map<string, number>();
  const options = candidates.map(({ u, i }) => {
    const n = (nth.get(u.ref.id!) ?? 0) + 1;
    nth.set(u.ref.id!, n);
    const dup = candidates.filter((c) => c.u.ref.id === u.ref.id).length > 1;
    const rec = attachedTo.get(i);
    const attachSub = rec
      ? [
          rec.leader != null ? `Leader: ${nameOf(rec.leader)}` : null,
          rec.support != null ? `Support: ${nameOf(rec.support)}` : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : null;
    return {
      value: String(i),
      label: dup ? `${nameOf(i)} #${n}` : nameOf(i),
      ...describe(i),
      ...(attachSub ? { sub: attachSub } : {}),
      ...(rec?.[roleOf(index)] != null ? { disabled: true } : {}),
    };
  });
  // The current pick may have become ineligible (unit swapped) — keep it visible.
  if (current != null && !options.some((o) => o.value === String(current))) {
    options.unshift({ value: String(current), label: nameOf(current), ...describe(current) });
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      <span className="shrink-0 text-xs text-ink-faint">Leads</span>
      <div className="min-w-0 flex-1">
        <Dropdown
          value={current != null ? String(current) : null}
          placeholder="Not attached"
          clearable
          options={options}
          onChange={(v) =>
            apply(setLeaderAttachment(content, index, v == null ? null : Number(v)))
          }
        />
      </div>
    </div>
  );
}

function SizeStepper({
  data,
  unit,
  rosterUnit,
  onSet,
}: {
  data: Data40k;
  unit: Unit;
  rosterUnit: RosterUnit;
  onSet: (n: number) => void;
}) {
  const range = sizeRange(unit);
  const count = rosterUnit.model_count;
  const down = range ? nextSize(data, unit, count, -1) : null;
  const up = range ? nextSize(data, unit, count, 1) : null;
  if (!range || (down == null && up == null)) {
    return <span className="text-xs text-ink-dim">{count} model{count === 1 ? "" : "s"}</span>;
  }
  return (
    <span className="inline-flex items-center overflow-hidden rounded-md border border-edge">
      <button
        type="button"
        aria-label="Fewer models"
        disabled={down == null}
        onClick={() => down != null && onSet(down)}
        className="min-w-8 bg-panel px-2 py-1 text-sm disabled:opacity-30"
      >
        −
      </button>
      <span className="px-2 text-xs text-ink-dim">{count} models</span>
      <button
        type="button"
        aria-label="More models"
        disabled={up == null}
        onClick={() => up != null && onSet(up)}
        className="min-w-8 bg-panel px-2 py-1 text-sm disabled:opacity-30"
      >
        +
      </button>
    </span>
  );
}

function EnhancementPicker({
  data,
  content,
  index,
  apply,
}: {
  data: Data40k;
  content: ListContent;
  index: number;
  apply: (next: ListContent) => void;
}) {
  const u = content.roster.units[index];
  const choices = enhancementChoices(data, content.roster, index);
  if (choices.length === 0 && !u.enhancement) return null;
  // A unit already carrying an enhancement may swap it slot-for-slot; one
  // without can only add while the army still has a free enhancement slot.
  const slots = enhancementSlots(content.roster);
  const slotsFull = slots.used >= slots.limit && u.enhancement == null;
  /** The enhancement's rules text, resolved through its linked ability. */
  const enhText = (id: string | null | undefined): string | null => {
    const enh = id ? byId(data.enhancements, id, content.roster.faction_id) : undefined;
    const ability = enh?.ability_id
      ? byId(data.abilities, enh.ability_id, content.roster.faction_id)
      : undefined;
    return ability ? abilityText(ability) : null;
  };
  // An unmatched enhancement (text-only import) isn't in the choice list; show
  // it as its own row so the trigger names it and picking anything replaces it.
  const unmatched = u.enhancement && !u.enhancement.id ? u.enhancement.raw_name : null;
  // The CURRENT enhancement must always be a listed option, even when the
  // choice filters exclude it (other detachment, upgrade on a vehicle, …) —
  // otherwise the trigger would falsely read "No enhancement".
  const currentId = u.enhancement?.id ?? null;
  const currentRow =
    currentId && !choices.some((c) => c.id === currentId)
      ? [
          {
            value: currentId,
            label:
              byId(data.enhancements, currentId, content.roster.faction_id)?.name ??
              u.enhancement!.raw_name,
            detail: u.enhancement_points != null ? `${u.enhancement_points} pts` : undefined,
          },
        ]
      : [];
  const currentText = unmatched ? null : enhText(currentId);
  return (
    <div className="mt-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-accent">✦</span>
        <div className="min-w-0 flex-1">
          <Dropdown
            value={unmatched ? "unmatched" : currentId}
            placeholder="No enhancement"
            clearable
            options={[
              ...(unmatched
                ? [{ value: "unmatched", label: `${unmatched} (unmatched)`, disabled: true }]
                : []),
              ...currentRow.map((r) => ({ ...r, sub: enhText(r.value) ?? undefined })),
              ...choices.map((c) => ({
                value: c.id,
                label: c.name,
                detail:
                  c.taken > 0
                    ? `${c.cost} pts · ${c.max > 1 ? `${c.taken}/${c.max} taken` : "taken"}`
                    : slotsFull
                      ? `${c.cost} pts · army at ${slots.limit} enhancements`
                      : `${c.cost} pts`,
                disabled: c.taken >= c.max || slotsFull,
                sub: enhText(c.id) ?? undefined,
              })),
            ]}
            onChange={(id) =>
              apply(setEnhancement(data, content, index, id === "unmatched" ? null : id))
            }
          />
        </div>
      </div>
      {currentText && (
        <p className="mt-1 whitespace-pre-wrap pl-6 text-xs leading-snug text-ink-dim">
          {currentText}
        </p>
      )}
    </div>
  );
}

function WargearEditor({
  data,
  content,
  index,
  unit,
  apply,
}: {
  data: Data40k;
  content: ListContent;
  index: number;
  unit: Unit;
  apply: (next: ListContent) => void;
}) {
  const u = content.roster.units[index];
  const counts = wargearCounts(u);
  const factionId = content.roster.faction_id;
  const nameOf = (id: string) =>
    byId(data.weapons, id, factionId)?.name ?? byId(data.wargear, id, factionId)?.name ?? id;
  const unresolvedGear = u.wargear.filter((w) => !w.ref.id);

  // Epic heroes come as they are — no swaps, nothing removable.
  const locked = unit.role === "epic-hero";
  // Codex-overlay units with no authored options/composition can't express
  // swaps yet — offer free steppers (0..squad size) until options are recorded.
  const freeform = !locked && loadoutDataMissing(data, unit);
  const optionStates = locked || freeform ? [] : wargearOptionStates(data, u, unit);
  const violations =
    locked || freeform
      ? []
      : data.validateLoadout(
          unit,
          u.model_count,
          optionStates.map((s) => s.option),
          counts,
          data.dataset.unitCompositionOf(unit)?.models,
        );
  // The package validator misses one-of add-ons taken twice across branches
  // (extra Busta Rokkit Launcha AND Pulsa Rokkit) — flag over-cap ourselves.
  const overCap = optionStates
    .filter((s) => s.totalApplied > s.cap)
    .map((s) => {
      const picked = s.branches
        .filter((b) => b.applied > 0)
        .map((b) => b.ids.map(nameOf).join(" + "))
        .join(", ");
      return `Only ${s.cap} of: ${picked} (${s.totalApplied} taken)`;
    });

  const surcharge = (id: string) =>
    unit.wargear_costs?.find((c) => c.item_id === id)?.cost ?? 0;
  const gearIds = freeform
    ? [...new Set([...(unit.weapon_ids ?? []), ...counts.keys()])]
    : [...counts.keys()];
  const rows = gearIds
    .map((id) => ({ id, name: nameOf(id), count: counts.get(id) ?? 0, cost: surcharge(id) }))
    .filter((r) => freeform || r.count > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
  // Multi-model-type units (Nob + Boyz) split into per-model groups so it's
  // clear which gear — and which swap — belongs to the squad leader.
  const gearGroups =
    locked || freeform
      ? null
      : groupLoadoutSpread(
          unit,
          u.model_count,
          optionStates.map((s) => s.option),
          data.dataset.unitCompositionOf(unit)?.models,
          counts,
        );
  const splitGroups = gearGroups && gearGroups.length > 1 ? gearGroups : null;
  if (rows.length === 0 && unresolvedGear.length === 0 && optionStates.length === 0) return null;

  return (
    <details className="mt-2 rounded-lg border border-edge">
      <summary className="cursor-pointer px-2 py-1.5 text-xs text-ink-dim">
        Wargear{" "}
        <span className="text-ink-faint">
          ({rows.filter((r) => r.count > 0).length + unresolvedGear.length} items
          {locked ? " · fixed" : ""})
        </span>
        {violations.length + overCap.length > 0 && (
          <span className="text-opponent"> ⚠ {violations.length + overCap.length}</span>
        )}
      </summary>
      <div className="space-y-1 px-2 pb-2">
        {splitGroups
          ? splitGroups.map((g, gi) => (
              <div key={`grp-${gi}`} className={gi > 0 ? "border-t border-edge/40 pt-1" : ""}>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                  {g.model_name ?? "Model"} wargear
                  <span className="normal-case">
                    {" "}
                    · {g.count} {g.count === 1 ? "model" : "models"}
                  </span>
                </p>
                {g.weapons.map((w) => (
                  <div key={`${gi}-${w.id}`} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs">
                      {nameOf(w.id)}
                      {surcharge(w.id) > 0 && (
                        <span className="text-ink-faint"> +{surcharge(w.id)} pts ea</span>
                      )}
                    </span>
                    <span className="text-xs text-ink-faint">×{w.count}</span>
                  </div>
                ))}
              </div>
            ))
          : (() => {
              // Ranged / Melee / other-gear subheaders — same-name profiles
              // (Nazdreg's ranged and melee Kustom Blasta X) are otherwise
              // indistinguishable rows. Headers only show when they separate
              // anything.
              const typeOf = (id: string) =>
                byId(data.weapons, id, factionId)?.raw.type ?? null;
              const buckets: ["ranged" | "melee" | null, string][] = [
                ["ranged", "Ranged"],
                ["melee", "Melee"],
                [null, "Gear"],
              ];
              const grouped = buckets
                .map(([t, label]) => ({ label, rows: rows.filter((r) => typeOf(r.id) === t) }))
                .filter((g) => g.rows.length > 0);
              return grouped.map((g) => (
                <div key={g.label}>
                  {grouped.length > 1 && (
                    <p className="pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                      {g.label}
                    </p>
                  )}
                  {g.rows.map((r) => (
                    <div key={r.id} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs">
                        {r.name}
                        {r.cost > 0 && <span className="text-ink-faint"> +{r.cost} pts ea</span>}
                      </span>
                      {freeform ? (
                        <Stepper
                          label={r.name}
                          count={r.count}
                          canDown={r.count > 0}
                          canUp={r.count < u.model_count}
                          onStep={(d) =>
                            apply(setWeaponCount(data, content, index, r.id, r.count + d))
                          }
                        />
                      ) : (
                        <span className="text-xs text-ink-faint">×{r.count}</span>
                      )}
                    </div>
                  ))}
                </div>
              ));
            })()}
        {unresolvedGear.map((w, i) => (
          <div key={`raw-${i}`} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-xs text-ink-dim">
              {w.ref.raw_name}
            </span>
            <span className="text-xs text-ink-faint">×{w.count} (text)</span>
          </div>
        ))}

        {optionStates.length > 0 &&
          (() => {
            // One block per option. Every branch always renders — a blocked
            // swap (allowance spent, or its source weapon gone to another
            // swap) greys out rather than disappearing, so the block keeps a
            // stable height instead of reflowing as options are taken. One-of
            // groups get a "One of:" blurb, so siblings read as exclusive.
            const rows = optionStates.flatMap((s) => {
              const replaces = (s.option.replaces ?? []).map(nameOf).join(" + ");
              const swapAvailable = (s.option.replaces ?? []).every(
                (id) => (counts.get(id) ?? 0) > 0,
              );
              const canUp = s.totalApplied < s.cap && swapAvailable;
              const branchRows = s.branches.map((b, bi) => {
                const dimmed = b.applied === 0 && !canUp;
                const added = b.ids.map(nameOf).join(" + ");
                const label = replaces ? `${replaces} → ${added}` : `Add ${added}`;
                return (
                  <div
                    key={`${s.option.id}-${bi}`}
                    className={`flex items-center gap-2 py-0.5${dimmed ? " opacity-40" : ""}`}
                  >
                    {/* Wraps rather than truncates — cutting the label off can
                        hide what the swap actually gives you. */}
                    <span className="min-w-0 flex-1 text-xs leading-snug">{label}</span>
                    <span className="shrink-0 text-[10px] text-ink-faint">
                      {s.totalApplied}/{s.cap}
                    </span>
                    <Stepper
                      label={label}
                      count={b.applied}
                      canDown={b.applied > 0}
                      canUp={canUp}
                      onStep={(d) =>
                        apply(applyWargearOption(data, content, index, s.option.id, bi, d))
                      }
                    />
                  </div>
                );
              });
              if (branchRows.length === 0) return [];
              return [
                {
                  who: s.option.model_constraint?.model_name ?? "",
                  node: (
                    <div key={s.option.id}>
                      {branchRows.length > 1 && (
                        <p className="pt-0.5 text-[10px] italic text-ink-faint">
                          {s.cap === 1 ? "One of:" : `Up to ${s.cap} of:`}
                        </p>
                      )}
                      {branchRows}
                    </div>
                  ),
                },
              ];
            });
            if (rows.length === 0) return null;
            // Group rows by the model they apply to (Nob vs squad) so
            // leader-only swaps read as such instead of blending into the list.
            const byWho = new Map<string, typeof rows>();
            for (const r of rows) byWho.set(r.who, [...(byWho.get(r.who) ?? []), r]);
            const showWho = byWho.size > 1 || !byWho.has("");
            return (
              <div className="mt-1 border-t border-edge/60 pt-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                  Wargear options
                </p>
                {[...byWho.entries()].map(([who, group]) => (
                  <div key={who || "any"}>
                    {showWho && (
                      <p className="pt-0.5 text-[10px] font-semibold text-ink-dim">
                        {who || "Any model"}
                      </p>
                    )}
                    {group.map((r) => r.node)}
                  </div>
                ))}
              </div>
            );
          })()}

        {violations.map((v, i) => (
          <p key={`v-${i}`} className="text-[11px] text-opponent">
            ⚠ {v.message}
          </p>
        ))}
        {overCap.map((msg, i) => (
          <p key={`oc-${i}`} className="text-[11px] text-opponent">
            ⚠ {msg}
          </p>
        ))}
      </div>
    </details>
  );
}

function Stepper({
  label,
  count,
  canDown,
  canUp,
  onStep,
}: {
  label: string;
  count: number;
  canDown: boolean;
  canUp: boolean;
  onStep: (delta: 1 | -1) => void;
}) {
  return (
    <span className="inline-flex shrink-0 items-center overflow-hidden rounded-md border border-edge">
      <button
        type="button"
        aria-label={`Fewer ${label}`}
        disabled={!canDown}
        onClick={() => onStep(-1)}
        className="min-w-7 bg-panel px-1.5 py-0.5 text-sm disabled:opacity-30"
      >
        −
      </button>
      <span className="min-w-6 text-center text-xs">{count}</span>
      <button
        type="button"
        aria-label={`More ${label}`}
        disabled={!canUp}
        onClick={() => onStep(1)}
        className="min-w-7 bg-panel px-1.5 py-0.5 text-sm disabled:opacity-30"
      >
        +
      </button>
    </span>
  );
}
