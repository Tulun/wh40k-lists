import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Dropdown from "./Dropdown";
import { DISPOSITIONS } from "../lib/codex-model";
import type { Data40k } from "../lib/data";
import { byId } from "../lib/lookup";
import type { SavedList } from "../store/schema";

export interface DupeChoices {
  name: string;
  disposition: string | null;
  /** Jump straight into the editor on the copy. */
  edit: boolean;
}

/**
 * Modal for duplicating a list: rename it and (the usual reason to dupe)
 * re-pick its Force Disposition. Detachments and units carry over verbatim —
 * those changes belong in the editor, which "Dupe & edit" opens.
 */
export default function DupeDialog({
  list,
  data,
  onConfirm,
  onCancel,
}: {
  list: SavedList;
  data: Data40k | null;
  onConfirm: (choices: DupeChoices) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(`${list.name} (copy)`);
  const [disposition, setDisposition] = useState(list.roster.force_disposition ?? null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  // The dispositions the list's detachments grant; empty = data unrecorded, offer all.
  const granted = new Set(
    data
      ? list.roster.detachments.flatMap(
          (d) => byId(data.detachments, d.ref.id, list.roster.faction_id)?.force_dispositions ?? [],
        )
      : [],
  );
  const submit = (edit: boolean) =>
    onConfirm({ name: name.trim() || `${list.name} (copy)`, disposition, edit });

  return createPortal(
    // Portal to <body>: sticky/backdrop-blur ancestors would clip a fixed dialog.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Dupe "${list.name}"`}
    >
      <button
        type="button"
        aria-label="Cancel"
        className="absolute inset-0 animate-fade-in bg-black/70"
        onClick={onCancel}
      />
      <div className="relative w-full max-w-sm animate-pop-in space-y-3 rounded-lg border border-edge bg-surface p-4 shadow-2xl">
        <p className="truncate text-sm font-bold">Dupe "{list.name}"</p>

        <label className="block">
          <span className="text-xs text-ink-faint">Name</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit(false);
            }}
            className="mt-1 w-full rounded-md border border-edge bg-panel px-3 py-2 text-sm font-semibold"
          />
        </label>

        <div>
          <span className="text-xs text-ink-faint">Disposition</span>
          <div className="mt-1">
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

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="mr-auto rounded-md px-3 py-2 text-sm font-semibold text-ink-dim hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => submit(true)}
            className="rounded-md bg-panel px-4 py-2 text-sm font-semibold text-ink-dim hover:bg-edge hover:text-ink"
          >
            Dupe & edit
          </button>
          <button
            type="button"
            onClick={() => submit(false)}
            className="rounded-md bg-accent px-4 py-2 text-sm font-bold text-surface"
          >
            Dupe
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
