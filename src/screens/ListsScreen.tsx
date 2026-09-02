import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ConfirmButton from "../components/ConfirmButton";
import { useDataset } from "../hooks/useDataset";
import { loadMergedData } from "../lib/data";
import { OPPONENT_SLOT_ENABLED } from "../lib/flags";
import { blankSavedList } from "../lib/list-edit";
import { shareText } from "../lib/share";
import { useLists } from "../store/lists";
import type { SavedList, Slot } from "../store/schema";

declare const __DATA_PKG_VERSION__: string;

export default function ListsScreen() {
  const lists = useLists((s) => s.lists);
  const slots = useLists((s) => s.slots);
  const activeSlot = useLists((s) => s.activeSlot);
  const assignSlot = useLists((s) => s.assignSlot);
  const setActiveSlot = useLists((s) => s.setActiveSlot);
  const deleteList = useLists((s) => s.deleteList);
  const saveList = useLists((s) => s.saveList);
  const navigate = useNavigate();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  /** Copy the shareable text (WTC-compact) for pasting into Discord/Facebook. */
  async function share(list: SavedList) {
    const data = await loadMergedData();
    await navigator.clipboard.writeText(shareText(data, list));
    setCopiedId(list.id);
    clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopiedId(null), 2000);
  }

  const data = useDataset();
  // Most recently edited first (`updated` stamps every in-app edit; older
  // remote copies without it fall back to their import time).
  const all = Object.values(lists).sort((a, b) =>
    (b.updated ?? b.importedAt).localeCompare(a.updated ?? a.importedAt),
  );

  // Group by faction, most recently edited first within each group. Only lists
  // with a recorded faction get a subheader; the rest render unlabeled at the end.
  const groups = new Map<string, { label: string | null; lists: SavedList[] }>();
  for (const list of all) {
    const fid = list.roster.faction_id;
    const key = fid ?? "";
    if (!groups.has(key)) {
      groups.set(key, {
        label: fid ? (data?.factions.getAny(fid)?.name ?? fid) : null,
        lists: [],
      });
    }
    groups.get(key)!.lists.push(list);
  }
  const grouped = [...groups.values()].sort((a, b) => {
    if (a.label == null) return 1;
    if (b.label == null) return -1;
    return a.label.localeCompare(b.label);
  });

  function use(slot: Slot, id: string) {
    assignSlot(slot, id);
    setActiveSlot(slot);
    navigate("/");
  }

  /** Tap the card → view that army. Uses its slot if it has one. */
  function open(list: SavedList) {
    const slot =
      slots.mine === list.id ? "mine" : slots.opponent === list.id ? "opponent" : activeSlot;
    use(slot, list.id);
  }

  const currentList = slots.mine ? (lists[slots.mine] ?? null) : null;

  const renderCard = (list: SavedList) => (
    <li key={list.id} className="rounded-lg border border-edge bg-panel/50 px-3 py-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left text-sm font-semibold hover:text-accent active:text-accent"
          onClick={() => open(list)}
        >
          {list.name}
        </button>
        <button
          type="button"
          title={slots.mine === list.id ? "Active army" : "Set as active army"}
          aria-pressed={slots.mine === list.id}
          onClick={() => {
            if (slots.mine === list.id) {
              assignSlot("mine", null);
            } else {
              assignSlot("mine", list.id);
              setActiveSlot("mine");
            }
          }}
          className={`shrink-0 px-1 text-base leading-none ${
            slots.mine === list.id ? "text-accent" : "text-ink-faint opacity-50"
          }`}
        >
          {slots.mine === list.id ? "★" : "☆"}
        </button>
        <span className="shrink-0 text-xs text-ink-faint">
          {list.roster.points.total_computed} pts
        </span>
      </div>
      <button
        type="button"
        onClick={() => open(list)}
        className="mt-0.5 block w-full text-left text-[11px] text-ink-faint"
      >
        {new Date(list.importedAt).toLocaleDateString()} · {list.dataVersion.edition} ed /{" "}
        {list.dataVersion.dataslate}
      </button>
      <div className="mt-2 flex gap-2">
        {OPPONENT_SLOT_ENABLED && (
          <button
            type="button"
            onClick={() => use("mine", list.id)}
            className={`flex-1 rounded-md py-1.5 text-xs font-semibold ${
              slots.mine === list.id ? "bg-mine/30 text-mine" : "bg-panel text-ink-dim"
            }`}
          >
            {slots.mine === list.id ? "✓ Mine" : "Use as mine"}
          </button>
        )}
        {OPPONENT_SLOT_ENABLED && (
          <button
            type="button"
            onClick={() => use("opponent", list.id)}
            className={`flex-1 rounded-md py-1.5 text-xs font-semibold ${
              slots.opponent === list.id
                ? "bg-opponent/30 text-opponent"
                : "bg-panel text-ink-dim"
            }`}
          >
            {slots.opponent === list.id ? "✓ Opponent" : "Use as opponent"}
          </button>
        )}
        <Link
          to={`/lists/${list.id}/edit`}
          className="ml-auto rounded-md bg-panel px-6 py-1.5 text-sm font-semibold text-ink-dim transition-colors hover:bg-edge hover:text-ink"
        >
          Edit
        </Link>
        <button
          type="button"
          onClick={() => void share(list)}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
            copiedId === list.id
              ? "bg-accent/20 text-accent"
              : "bg-panel text-ink-dim hover:bg-edge hover:text-ink"
          }`}
        >
          {copiedId === list.id ? "✓ Copied" : "Share"}
        </button>
        <ConfirmButton
          label="Delete"
          confirmLabel="Sure?"
          onConfirm={() => deleteList(list.id)}
          className="rounded-md bg-panel px-3 py-1.5 text-xs text-opponent transition-colors hover:bg-opponent/15"
          armedClassName="rounded-md bg-opponent/20 px-3 py-1.5 text-xs font-semibold text-opponent"
        />
      </div>
    </li>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold">Saved lists</h1>
        <button
          type="button"
          onClick={() => {
            const list = blankSavedList(__DATA_PKG_VERSION__);
            saveList(list);
            navigate(`/lists/${list.id}/edit`);
          }}
          className="rounded-md border border-accent/50 px-4 py-2 text-sm font-bold text-accent"
        >
          + New
        </button>
        <Link to="/import" className="rounded-md bg-accent px-4 py-2 text-sm font-bold text-surface">
          + Import
        </Link>
      </div>

      {all.length === 0 && (
        <p className="py-12 text-center text-sm text-ink-dim">No lists yet — import one to get started.</p>
      )}

      {currentList && (
        <div>
          <div className="mb-2 mt-2 px-1 text-sm font-bold uppercase tracking-wide text-accent">
            Current army
          </div>
          <ul className="grid gap-2 lg:grid-cols-2">{renderCard(currentList)}</ul>
        </div>
      )}

      {grouped.map((group) => (
        <div key={group.label ?? "·no-faction"}>
          {group.label && (
            <div className="mb-2 mt-2 px-1 text-sm font-bold uppercase tracking-wide text-ink-dim">
              {group.label}
            </div>
          )}
          <ul className="grid gap-2 lg:grid-cols-2">{group.lists.map(renderCard)}</ul>
        </div>
      ))}
    </div>
  );
}
