import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { RosterUnit, Unit } from "@alpaca-software/40kdc-data";
import Dropdown from "../components/Dropdown";
import { useDataset } from "../hooks/useDataset";
import type { Data40k } from "../lib/data";
import {
  addDetachment,
  addUnit,
  applyWargearOption,
  duplicateUnit,
  enhancementChoices,
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
import { EXPLORE_FACTION_IDS } from "../lib/flags";
import { byId } from "../lib/lookup";
import { useLists } from "../store/lists";

const ROLE_ORDER: Record<string, number> = {
  "epic-hero": 0,
  character: 1,
  battleline: 2,
  "dedicated-transport": 4,
  fortification: 5,
  allied: 6,
};

export default function ListEditScreen() {
  const { listId } = useParams();
  const list = useLists((s) => (listId ? (s.lists[listId] ?? null) : null));
  const updateListContent = useLists((s) => s.updateListContent);
  const data = useDataset();
  const [addQuery, setAddQuery] = useState("");

  const issues = useMemo(
    () => (data && list ? legalityIssues(data, list.roster) : []),
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

  const q = addQuery.trim().toLowerCase();
  const addResults =
    factionId && q
      ? data.units
          .byFaction(factionId)
          .filter(
            (u) =>
              u.name.toLowerCase().includes(q) ||
              (u.raw.keywords ?? []).some((k) => k.toLowerCase().includes(q)),
          )
          .sort((a, b) => {
            const ra = ROLE_ORDER[a.raw.role ?? ""] ?? 3;
            const rb = ROLE_ORDER[b.raw.role ?? ""] ?? 3;
            return ra !== rb ? ra - rb : a.name.localeCompare(b.name);
          })
          .slice(0, 20)
      : [];

  const detachmentPool = factionId
    ? [...data.detachments.byFaction(factionId)]
        .filter((d) => !roster.detachments.some((rd) => rd.ref.id === d.id))
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];
  const dpSpent = roster.detachments.reduce((s, d) => s + (d.dp_cost ?? 0), 0);
  // The dispositions the chosen detachments grant; empty = data unrecorded, offer all.
  const grantedDispositions = new Set(
    roster.detachments.flatMap(
      (d) => byId(data.detachments, d.ref.id, factionId)?.force_dispositions ?? [],
    ),
  );

  return (
    <div className="space-y-3 pb-8">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-bold">Edit list</h1>
        <Link
          to="/lists"
          className="rounded-md bg-accent px-4 py-2 text-sm font-bold text-surface"
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

      <div className="rounded-md border border-edge bg-panel/50 px-3 py-2">
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
              {(d.ref.id && byId(data.detachments, d.ref.id, factionId)?.name) ??
                d.ref.raw_name}
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
        <details className="rounded-md border border-opponent/40 bg-opponent/10">
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

      <div className="rounded-md border border-edge bg-panel/50 p-3">
        <h2 className="text-sm font-semibold">Add unit</h2>
        <input
          value={addQuery}
          onChange={(e) => setAddQuery(e.target.value)}
          placeholder="Search datasheets or keywords…"
          className="mt-2 w-full rounded-md border border-edge bg-panel px-3 py-2 text-sm"
        />
        {addResults.length > 0 && (
          <ul className="mt-2 divide-y divide-edge overflow-hidden rounded-md border border-edge">
            {addResults.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  className="flex min-h-11 w-full items-center gap-2 px-3 py-1.5 text-left active:bg-panel"
                  onClick={() => {
                    apply(addUnit(data, content, u.id));
                    setAddQuery("");
                  }}
                >
                  <span className="min-w-0 flex-1 truncate text-sm">{u.name}</span>
                  <span className="text-xs text-ink-faint">
                    {u.raw.points?.[0]
                      ? `${u.raw.points[0].models}m · ${u.raw.points[0].cost} pts`
                      : "? pts"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {q && addResults.length === 0 && (
          <p className="mt-2 text-xs text-ink-faint">No datasheets match.</p>
        )}
      </div>

      <Link to={`/import?edit=${list.id}`} className="block text-xs text-ink-faint underline">
        Edit as text (re-import) →
      </Link>
    </div>
  );
}

/**
 * Units in roster order, with attached pairings grouped into one bordered
 * block anchored at the CHARACTER's position — the led unit moves up to its
 * leader, not the other way around.
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
  const roster = content.roster;
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

  // Characters first (like the glance view), attached pairs anchored at the
  // character; stable within each rank so roster order still breaks ties.
  const rankOf = (i: number) => {
    const u = roster.units[i];
    const role = u.ref.id
      ? byId(data.units, u.ref.id, roster.faction_id)?.raw.role
      : undefined;
    return role === "character" || role === "epic-hero" ? 0 : 1;
  };
  const displayOrder = roster.units
    .map((_, i) => i)
    .sort((a, b) => rankOf(a) - rankOf(b) || a - b);

  return (
    <ul className="space-y-2">
      {displayOrder.map((i) => {
        const u = roster.units[i];
        const key = `${u.ref.id ?? u.ref.raw_name}-${i}`;
        if (leadersOf.has(i)) return null; // moves up to its (first) leader's slot
        const body = bodyguardOf.get(i);
        if (body != null) {
          const leaders = leadersOf.get(body)!;
          if (leaders[0] !== i) return null; // co-leader, rendered with the first
          return (
            <li key={key} className="space-y-1 rounded-lg border border-accent/40 p-1">
              <p className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-wide text-accent">
                Attached unit
              </p>
              {leaders.map((li) => (
                <UnitRow key={li} data={data} content={content} index={li} apply={apply} />
              ))}
              <UnitRow data={data} content={content} index={body} apply={apply} />
            </li>
          );
        }
        return (
          <li key={key}>
            <UnitRow data={data} content={content} index={i} apply={apply} />
          </li>
        );
      })}
    </ul>
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

  return (
    <div className="rounded-md border border-edge bg-panel/50 px-3 py-2">
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          {name}
          {!unit && <span className="ml-1 text-[10px] text-opponent">unmatched</span>}
        </span>
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

        <button
          type="button"
          title="Duplicate unit"
          onClick={() => apply(duplicateUnit(data, content, index))}
          className="rounded-md bg-panel px-2.5 py-1 text-xs text-ink-dim"
        >
          ⧉
        </button>
        <button
          type="button"
          title="Remove unit"
          onClick={() => {
            if (confirm(`Remove ${name}?`)) apply(removeUnit(data, content, index));
          }}
          className="rounded-md bg-panel px-2.5 py-1 text-xs text-opponent"
        >
          ✕
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
  // A unit takes at most 1 leader and 1 support: hide units that already have
  // an attached character of this character's role class.
  const roleOf = (i: number) => {
    const u = roster.units[i];
    const ent = u.ref.id ? byId(data.units, u.ref.id, roster.faction_id)?.raw : undefined;
    return ent?.attachment_role === "support" ? "support" : "leader";
  };
  const occupied = new Set<number>();
  for (const [l, b] of Object.entries(content.attachments)) {
    const li = Number(l);
    if (li !== index && roleOf(li) === roleOf(index)) occupied.add(b);
  }
  const candidates = roster.units
    .map((u, i) => ({ u, i }))
    .filter(
      ({ u, i }) =>
        i !== index && u.ref.id != null && eligible.has(u.ref.id) && !occupied.has(i),
    );
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
    return {
      value: String(i),
      label: dup ? `${nameOf(i)} #${n}` : nameOf(i),
      ...describe(i),
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
  return (
    <div className="mt-2 flex items-center gap-2">
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
            ...currentRow,
            ...choices.map((c) => ({
              value: c.id,
              label: c.name,
              detail: c.takenBy != null ? `${c.cost} pts · taken` : `${c.cost} pts`,
              disabled: c.takenBy != null,
            })),
          ]}
          onChange={(id) =>
            apply(setEnhancement(data, content, index, id === "unmatched" ? null : id))
          }
        />
      </div>
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
      : data.groupLoadout(
          unit,
          u.model_count,
          optionStates.map((s) => s.option),
          data.dataset.unitCompositionOf(unit)?.models,
          counts,
        );
  const splitGroups = gearGroups && gearGroups.length > 1 ? gearGroups : null;
  if (rows.length === 0 && unresolvedGear.length === 0 && optionStates.length === 0) return null;

  return (
    <details className="mt-2 rounded-md border border-edge">
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
                  {g.count > 1 && <span className="normal-case"> · {g.count} models</span>}
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
          : rows.map((r) => (
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
                    onStep={(d) => apply(setWeaponCount(data, content, index, r.id, r.count + d))}
                  />
                ) : (
                  <span className="text-xs text-ink-faint">×{r.count}</span>
                )}
              </div>
            ))}
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
            // One row per takeable branch. A branch that is neither taken nor
            // currently takeable (source weapon swapped away, or the option's
            // allowance already spent on a sibling branch) is hidden — taken
            // rows always stay so they can be stepped back down.
            const rows = optionStates.flatMap((s) => {
              const replaces = (s.option.replaces ?? []).map(nameOf).join(" + ");
              const swapAvailable = (s.option.replaces ?? []).every(
                (id) => (counts.get(id) ?? 0) > 0,
              );
              return s.branches.flatMap((b, bi) => {
                const canUp = s.totalApplied < s.cap && swapAvailable;
                if (b.applied === 0 && !canUp) return [];
                const added = b.ids.map(nameOf).join(" + ");
                const label = replaces ? `${replaces} → ${added}` : `Add ${added}`;
                return [
                  {
                    who: s.option.model_constraint?.model_name ?? "",
                    node: (
                      <div
                        key={`${s.option.id}-${bi}`}
                        className="flex items-center gap-2 py-0.5"
                      >
                        <span className="min-w-0 flex-1 truncate text-xs">{label}</span>
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
                    ),
                  },
                ];
              });
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
