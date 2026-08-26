import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { RosterUnit, Unit } from "@alpaca-software/40kdc-data";
import { useDataset } from "../hooks/useDataset";
import type { Data40k } from "../lib/data";
import {
  addDetachment,
  addUnit,
  duplicateUnit,
  enhancementChoices,
  loadoutDataMissing,
  nextSize,
  removeDetachment,
  removeUnit,
  setEnhancement,
  setModelCount,
  setRawModelCount,
  setUnitPoints,
  setWarlord,
  setWeaponCount,
  sizeRange,
  wargearCounts,
  type ListContent,
} from "../lib/list-edit";
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

  const legality = useMemo(
    () => (data && list ? data.checkRoster(list.roster, data.dataset) : null),
    [data, list],
  );

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

  // Army-level issues plus per-unit loadout violations, one flat readable list.
  const issues: string[] = [];
  if (legality) {
    for (const v of legality.army) {
      const unitName =
        v.unitIndex != null ? roster.units[v.unitIndex]?.ref.raw_name : null;
      issues.push(unitName ? `${unitName}: ${v.message}` : v.message);
    }
    for (const ul of legality.units) {
      // Skip loadout complaints for units the dataset has no loadout data for
      // (codex-overlay entries) — the check would flag every weapon count.
      const view = data.resolveRosterUnit(roster.units[ul.unitIndex], data.dataset, factionId);
      if (view && loadoutDataMissing(data, view.raw)) continue;
      const unitName = roster.units[ul.unitIndex]?.ref.raw_name;
      for (const v of ul.violations) issues.push(`${unitName}: ${v.message}`);
    }
  }

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
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-bold">
            {(factionId && data.factions.getAny(factionId)?.name) ?? "Unknown faction"}
          </span>
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
                onClick={() => apply(removeDetachment(content, i))}
              >
                ✕
              </button>
            </span>
          ))}
          {detachmentPool.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) apply(addDetachment(data, content, e.target.value));
              }}
              className="rounded-md border border-edge bg-panel px-2 py-1 text-xs text-ink-dim"
            >
              <option value="">+ detachment</option>
              {detachmentPool.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {d.detachment_points != null ? ` (${d.detachment_points} DP)` : ""}
                </option>
              ))}
            </select>
          )}
          {roster.points.detachment_cap != null && (
            <span className="text-xs text-ink-faint">
              {dpSpent}/{roster.points.detachment_cap} DP
            </span>
          )}
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

      <ul className="space-y-2">
        {roster.units.map((u, i) => (
          <UnitRow
            key={`${u.ref.id ?? u.ref.raw_name}-${i}`}
            data={data}
            content={content}
            index={i}
            apply={apply}
          />
        ))}
      </ul>

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
    <li className="rounded-md border border-edge bg-panel/50 px-3 py-2">
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

      {unit?.role === "character" && (
        <EnhancementPicker data={data} content={content} index={index} apply={apply} />
      )}

      {unit && (
        <WargearEditor data={data} content={content} index={index} unit={unit} apply={apply} />
      )}
    </li>
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
  return (
    <div className="mt-2 flex items-center gap-2">
      <span className="text-xs text-accent">✦</span>
      <select
        value={u.enhancement?.id ?? ""}
        onChange={(e) => apply(setEnhancement(data, content, index, e.target.value || null))}
        className="min-w-0 flex-1 rounded-md border border-edge bg-panel px-2 py-1.5 text-xs"
      >
        <option value="">No enhancement</option>
        {u.enhancement && !u.enhancement.id && (
          <option value="" disabled>
            {u.enhancement.raw_name} (unmatched)
          </option>
        )}
        {choices.map((c) => (
          <option key={c.id} value={c.id} disabled={c.takenBy != null}>
            {c.name} ({c.cost} pts){c.takenBy != null ? " — taken" : ""}
          </option>
        ))}
      </select>
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
  // Codex-overlay units carry no options/composition — the loadout maths would
  // call every weapon mandatory. Offer free steppers (0..squad size) instead.
  const freeform = loadoutDataMissing(data, unit);
  const options = freeform ? [] : data.dataset.wargearOptionsOf(unit);
  const models = freeform ? undefined : data.dataset.unitCompositionOf(unit)?.models;
  const bounds = freeform
    ? new Map((unit.weapon_ids ?? []).map((id) => [id, { min: 0, max: u.model_count }]))
    : data.weaponBounds(unit, u.model_count, options, models);
  const violations = freeform
    ? []
    : data.validateLoadout(unit, u.model_count, options, counts, models);

  const ids = [...new Set([...bounds.keys(), ...counts.keys()])];
  const rows = ids
    .map((id) => ({
      id,
      name:
        byId(data.weapons, id, content.roster.faction_id)?.name ??
        byId(data.wargear, id, content.roster.faction_id)?.name ??
        id,
      count: counts.get(id) ?? 0,
      bound: bounds.get(id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const unresolvedGear = u.wargear.filter((w) => !w.ref.id);
  const editable = rows.some((r) => r.bound && r.bound.max > r.bound.min);
  if (rows.length === 0 && unresolvedGear.length === 0) return null;

  return (
    <details className="mt-2 rounded-md border border-edge">
      <summary className="cursor-pointer px-2 py-1.5 text-xs text-ink-dim">
        Wargear{" "}
        <span className="text-ink-faint">
          ({rows.filter((r) => r.count > 0).length + unresolvedGear.length} items
          {editable ? "" : " · fixed"})
        </span>
        {violations.length > 0 && <span className="text-opponent"> ⚠ {violations.length}</span>}
      </summary>
      <div className="space-y-1 px-2 pb-2">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-xs">{r.name}</span>
            {r.bound && r.bound.max > r.bound.min ? (
              <span className="inline-flex items-center overflow-hidden rounded-md border border-edge">
                <button
                  type="button"
                  aria-label={`Fewer ${r.name}`}
                  disabled={r.count <= r.bound.min}
                  onClick={() => apply(setWeaponCount(data, content, index, r.id, r.count - 1))}
                  className="min-w-7 bg-panel px-1.5 py-0.5 text-sm disabled:opacity-30"
                >
                  −
                </button>
                <span className="min-w-6 text-center text-xs">{r.count}</span>
                <button
                  type="button"
                  aria-label={`More ${r.name}`}
                  disabled={r.count >= r.bound.max}
                  onClick={() => apply(setWeaponCount(data, content, index, r.id, r.count + 1))}
                  className="min-w-7 bg-panel px-1.5 py-0.5 text-sm disabled:opacity-30"
                >
                  +
                </button>
              </span>
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
        {violations.map((v, i) => (
          <p key={`v-${i}`} className="text-[11px] text-opponent">
            ⚠ {v.message}
          </p>
        ))}
      </div>
    </details>
  );
}
