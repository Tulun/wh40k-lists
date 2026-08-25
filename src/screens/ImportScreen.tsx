import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ImportResult, Roster } from "@alpaca-software/40kdc-data";
import CandidatePicker from "../components/CandidatePicker";
import { loadMergedData, type Data40k } from "../lib/data";
import { OPPONENT_SLOT_ENABLED } from "../lib/flags";
import { normalizeImportedRoster, type RoleHints } from "../lib/normalize";
import { applyOverrides, collectUnresolved, type Overrides } from "../lib/overrides";
import { useLists } from "../store/lists";
import type { Slot } from "../store/schema";

declare const __DATA_PKG_VERSION__: string;

interface Review {
  data: Data40k;
  roster: Roster;
  roleHints: RoleHints;
  attachmentSeeds: Record<string, number>;
  rawText: string;
  format: string;
}

export default function ImportScreen() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [name, setName] = useState("");
  const saveList = useLists((s) => s.saveList);
  const assignSlot = useLists((s) => s.assignSlot);
  const setActiveSlot = useLists((s) => s.setActiveSlot);
  const navigate = useNavigate();

  const patched = useMemo(
    () => (review ? applyOverrides(review.roster, overrides) : null),
    [review, overrides],
  );
  const unresolved = useMemo(
    () => (review && patched ? collectUnresolved(patched) : []),
    [review, patched],
  );
  // Also offer pickers for refs the user has already overridden (so they can undo).
  const overriddenRows = useMemo(
    () => (review ? collectUnresolved(review.roster).filter((u) => overrides[u.ref.raw_name]) : []),
    [review, overrides],
  );

  async function runImport() {
    setBusy(true);
    setError(null);
    try {
      const data = await loadMergedData();
      const result: ImportResult = data.tryImportRoster(text);
      if (!result.ok) {
        setError(
          `${result.message}\n\nFormats tried: ${result.trials.map((t) => t.id).join(", ")}`,
        );
        return;
      }
      const { roster, roleHints, attachmentSeeds } = normalizeImportedRoster(
        result.roster,
        data,
        text,
      );
      setReview({ data, roster, roleHints, attachmentSeeds, rawText: text, format: result.format });
      setName(result.roster.name !== "Imported roster" ? result.roster.name : "");
      setOverrides({});
    } finally {
      setBusy(false);
    }
  }

  function save(slot: Slot | null) {
    if (!review || !patched) return;
    const faction = patched.faction_id
      ? review.data.factions.getAny(patched.faction_id)?.name
      : undefined;
    const list = {
      id: crypto.randomUUID(),
      name: name.trim() || faction || "Imported list",
      rawText: review.rawText,
      roster: patched,
      overrides,
      notes: {},
      roleHints: review.roleHints,
      attachments: review.attachmentSeeds,
      importedAt: new Date().toISOString(),
      dataVersion: {
        edition: patched.game_version.edition,
        dataslate: patched.game_version.dataslate,
        pkg: __DATA_PKG_VERSION__,
      },
    };
    saveList(list);
    if (slot) {
      assignSlot(slot, list.id);
      setActiveSlot(slot);
      navigate("/");
    } else {
      navigate("/lists");
    }
  }

  if (review && patched) {
    const d = patched.diagnostics;
    const rows = [...unresolved, ...overriddenRows];
    // Unmatched weapon/wargear lines are usually harmless flavor items; keep
    // them out of the way. Units/detachments/enhancements need real decisions.
    const mainRows = rows.filter((u) => u.kind !== "weapon");
    const gearRows = rows.filter((u) => u.kind === "weapon");
    return (
      <div className="space-y-3">
        <h1 className="text-lg font-bold">Review import</h1>
        <div className="rounded-md border border-edge bg-panel/50 px-3 py-2 text-sm">
          <span className="font-medium">
            {(patched.faction_id && review.data.factions.getAny(patched.faction_id)?.name) ??
              patched.faction_id ??
              "Unknown faction"}
          </span>
          {" · "}
          {patched.points.total_computed} pts · format: {review.format}
          <div className="mt-1 text-xs text-ink-dim">
            {d.resolved_units}/{d.resolved_units + d.unresolved_units} units,{" "}
            {d.resolved_weapons}/{d.resolved_weapons + d.unresolved_weapons} weapons resolved
          </div>
          {d.warnings.length > 0 && (
            <details className="mt-1 text-xs text-ink-faint">
              <summary>{d.warnings.length} warning(s)</summary>
              <ul className="mt-1 list-inside list-disc">
                {d.warnings.map((w, i) => (
                  <li key={i}>{w.message}</li>
                ))}
              </ul>
            </details>
          )}
        </div>

        {mainRows.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-ink-dim">
              Needs your call ({mainRows.length})
            </h2>
            {mainRows.map((u) => (
              <CandidatePicker
                key={`${u.kind}:${u.ref.raw_name}`}
                data={review.data}
                unresolved={u}
                pickedId={overrides[u.ref.raw_name] ?? null}
                onPick={(rawName, id) =>
                  setOverrides((o) => {
                    const next = { ...o };
                    if (id) next[rawName] = id;
                    else delete next[rawName];
                    return next;
                  })
                }
              />
            ))}
          </div>
        )}

        {gearRows.length > 0 && (
          <details className="rounded-md border border-edge">
            <summary className="cursor-pointer px-3 py-2 text-sm text-ink-dim">
              Unmatched wargear ({gearRows.length}) — kept as text
            </summary>
            <div className="space-y-2 px-2 pb-2">
              {gearRows.map((u) => (
                <CandidatePicker
                  key={`${u.kind}:${u.ref.raw_name}`}
                  data={review.data}
                  unresolved={u}
                  pickedId={overrides[u.ref.raw_name] ?? null}
                  onPick={(rawName, id) =>
                    setOverrides((o) => {
                      const next = { ...o };
                      if (id) next[rawName] = id;
                      else delete next[rawName];
                      return next;
                    })
                  }
                />
              ))}
            </div>
          </details>
        )}

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="List name"
          className="w-full rounded-md border border-edge bg-panel px-3 py-2 text-sm"
        />
        <div className={`grid gap-2 ${OPPONENT_SLOT_ENABLED ? "grid-cols-3" : "grid-cols-2"}`}>
          <button type="button" onClick={() => save("mine")} className="rounded-md bg-mine/20 py-2.5 text-sm font-semibold text-mine">
            Save as mine
          </button>
          {OPPONENT_SLOT_ENABLED && (
            <button type="button" onClick={() => save("opponent")} className="rounded-md bg-opponent/20 py-2.5 text-sm font-semibold text-opponent">
              Save as opponent
            </button>
          )}
          <button type="button" onClick={() => save(null)} className="rounded-md bg-panel py-2.5 text-sm font-semibold text-ink-dim">
            Just save
          </button>
        </div>
        <button type="button" onClick={() => setReview(null)} className="text-xs text-ink-faint underline">
          ← back to paste
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <h1 className="text-lg font-bold">Import a list</h1>
      <p className="text-xs text-ink-dim">
        Paste an army list export — GW app, New Recruit (text or JSON), ListForge, or
        Rosterizer. Format is detected automatically.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste your list here…"
        rows={14}
        className="w-full flex-1 rounded-md border border-edge bg-panel p-3 font-mono text-xs"
      />
      {error && (
        <pre className="whitespace-pre-wrap rounded-md border border-opponent/40 bg-opponent/10 p-2 text-xs text-opponent">
          {error}
        </pre>
      )}
      <button
        type="button"
        disabled={busy || text.trim().length === 0}
        onClick={() => void runImport()}
        className="rounded-md bg-accent py-3 text-sm font-bold text-surface disabled:opacity-40"
      >
        {busy ? "Reading list…" : "Import"}
      </button>
    </div>
  );
}
