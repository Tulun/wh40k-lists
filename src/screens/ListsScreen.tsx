import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { loadMergedData } from "../lib/data";
import { OPPONENT_SLOT_ENABLED } from "../lib/flags";
import { shareText } from "../lib/share";
import { useLists } from "../store/lists";
import type { SavedList, Slot } from "../store/schema";

export default function ListsScreen() {
  const lists = useLists((s) => s.lists);
  const slots = useLists((s) => s.slots);
  const activeSlot = useLists((s) => s.activeSlot);
  const assignSlot = useLists((s) => s.assignSlot);
  const setActiveSlot = useLists((s) => s.setActiveSlot);
  const deleteList = useLists((s) => s.deleteList);
  const renameList = useLists((s) => s.renameList);
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

  const all = Object.values(lists).sort(
    (a, b) => b.importedAt.localeCompare(a.importedAt),
  );

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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Saved lists</h1>
        <Link to="/import" className="rounded-md bg-accent px-4 py-2 text-sm font-bold text-surface">
          + Import
        </Link>
      </div>

      {all.length === 0 && (
        <p className="py-12 text-center text-sm text-ink-dim">No lists yet — import one to get started.</p>
      )}

      <ul className="space-y-2">
        {all.map((list) => (
          <li key={list.id} className="rounded-md border border-edge bg-panel/50 px-3 py-2">
            <div className="flex items-baseline gap-2">
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left text-sm font-semibold active:text-accent"
                onClick={() => open(list)}
              >
                {list.name}
              </button>
              <button
                type="button"
                aria-label="Rename list"
                className="shrink-0 px-1 text-xs text-ink-faint"
                onClick={() => {
                  const name = prompt("Rename list", list.name);
                  if (name?.trim()) renameList(list.id, name.trim());
                }}
              >
                ✏️
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
              <button
                type="button"
                onClick={() => use("mine", list.id)}
                className={`flex-1 rounded-md py-1.5 text-xs font-semibold ${
                  slots.mine === list.id ? "bg-mine/30 text-mine" : "bg-panel text-ink-dim"
                }`}
              >
                {OPPONENT_SLOT_ENABLED
                  ? slots.mine === list.id
                    ? "✓ Mine"
                    : "Use as mine"
                  : slots.mine === list.id
                    ? "✓ Active army"
                    : "Set as active army"}
              </button>
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
                className="rounded-md bg-panel px-3 py-1.5 text-xs font-semibold text-ink-dim"
              >
                Edit
              </Link>
              <button
                type="button"
                onClick={() => void share(list)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                  copiedId === list.id ? "bg-accent/20 text-accent" : "bg-panel text-ink-dim"
                }`}
              >
                {copiedId === list.id ? "✓ Copied" : "Share"}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Delete "${list.name}"?`)) deleteList(list.id);
                }}
                className="rounded-md bg-panel px-3 py-1.5 text-xs text-opponent"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
