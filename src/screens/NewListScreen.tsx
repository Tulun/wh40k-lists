import { useState } from "react";
import { useNavigate } from "react-router-dom";
import BackBar from "../components/BackBar";
import Dropdown from "../components/Dropdown";
import { useDataset } from "../hooks/useDataset";
import { DISPOSITIONS } from "../lib/codex-model";
import { EXPLORE_FACTION_IDS } from "../lib/flags";
import {
  addDetachment,
  blankSavedList,
  setFaction,
  setForceDisposition,
  type ListContent,
} from "../lib/list-edit";
import { byId } from "../lib/lookup";
import { useLists } from "../store/lists";

declare const __DATA_PKG_VERSION__: string;

/**
 * Start a list from scratch: pick the army (required), and optionally a name,
 * detachments and Force Disposition up front. Everything but the faction stays
 * editable in the list editor this hands off to.
 */
export default function NewListScreen() {
  const data = useDataset();
  const saveList = useLists((s) => s.saveList);
  const navigate = useNavigate();
  const [factionId, setFactionId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [detIds, setDetIds] = useState<string[]>([]);
  const [disposition, setDisposition] = useState<string | null>(null);

  if (!data) {
    return <p className="py-16 text-center text-xs text-ink-faint">Loading dataset…</p>;
  }

  const factions = (EXPLORE_FACTION_IDS ?? data.factions.all.map((f) => f.id))
    .map((id) => ({ id, name: data.factions.getAny(id)?.name ?? id }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const detachment = (id: string) => (factionId ? byId(data.detachments, id, factionId) : undefined);
  const detachmentPool = factionId
    ? [...data.detachments.byFaction(factionId)]
        .filter((d) => !detIds.includes(d.id))
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];
  // Matches the blank list's Strike Force budget.
  const dpCap = 3;
  const dpSpent = detIds.reduce((s, id) => s + (detachment(id)?.detachment_points ?? 0), 0);
  // The dispositions the chosen detachments grant; empty = data unrecorded, offer all.
  const granted = new Set(detIds.flatMap((id) => detachment(id)?.force_dispositions ?? []));

  function pickFaction(id: string) {
    if (id === factionId) return;
    setFactionId(id);
    // Detachments and dispositions belong to the old army.
    setDetIds([]);
    setDisposition(null);
  }

  function create() {
    if (!data || !factionId) return;
    const list = blankSavedList(__DATA_PKG_VERSION__);
    let content: ListContent = {
      roster: list.roster,
      roleHints: list.roleHints,
      attachments: list.attachments,
    };
    content = setFaction(content, factionId);
    for (const id of detIds) content = addDetachment(data, content, id);
    // Drop a disposition the final detachment set no longer grants.
    if (disposition && (granted.size === 0 || granted.has(disposition))) {
      content = setForceDisposition(content, disposition);
    }
    const listName = name.trim() || "New list";
    saveList({
      ...list,
      ...content,
      name: listName,
      roster: { ...content.roster, name: listName },
      rawText: data.exportRoster(content.roster, "roster-json"),
    });
    navigate(`/lists/${list.id}/edit`, { replace: true });
  }

  return (
    <div className="space-y-4 pb-8">
      <BackBar fallback={{ to: "/lists", label: "Lists" }} />
      <h1 className="text-lg font-bold">New list</h1>

      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-faint">Army</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {factions.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={factionId === f.id}
              onClick={() => pickFaction(f.id)}
              className={`rounded-lg border px-3 py-3 text-left text-sm font-semibold transition-colors ${
                factionId === f.id
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-edge bg-panel/50 hover:bg-panel"
              }`}
            >
              {f.name}
            </button>
          ))}
        </div>
      </section>

      {factionId && (
        <section className="space-y-3 rounded-lg border border-edge bg-panel/50 p-3">
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink-faint">
            Optional — all editable later
          </h2>

          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="List name"
            className="w-full rounded-md border border-edge bg-panel px-3 py-2 text-sm font-semibold"
          />

          <div className="flex flex-wrap items-center gap-1.5">
            {detIds.map((id) => (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded-full border border-edge bg-panel px-2.5 py-1 text-xs"
              >
                {detachment(id)?.name ?? id}
                {detachment(id)?.detachment_points != null && (
                  <span className="text-ink-faint">{detachment(id)!.detachment_points} DP</span>
                )}
                <button
                  type="button"
                  aria-label="Remove detachment"
                  className="px-0.5 text-ink-faint"
                  onClick={() => setDetIds(detIds.filter((d) => d !== id))}
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
                  if (id) setDetIds([...detIds, id]);
                }}
              />
            )}
            <span className={`text-xs ${dpSpent > dpCap ? "text-opponent" : "text-ink-faint"}`}>
              {dpSpent}/{dpCap} DP
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="shrink-0 text-xs text-ink-faint">Disposition</span>
            <div className="min-w-0 flex-1">
              <Dropdown
                value={disposition}
                placeholder="Not picked"
                clearable
                options={DISPOSITIONS.map((d) => ({
                  value: d.id,
                  label: d.label,
                  detail: granted.has(d.id) ? "granted" : undefined,
                  disabled: granted.size > 0 && !granted.has(d.id),
                }))}
                onChange={setDisposition}
              />
            </div>
          </div>
        </section>
      )}

      <button
        type="button"
        disabled={!factionId}
        onClick={create}
        className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-bold text-surface disabled:opacity-40"
      >
        {factionId ? "Create list" : "Pick an army to continue"}
      </button>
    </div>
  );
}
