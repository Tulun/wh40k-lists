import { useState } from "react";
import type { Stratagem } from "@alpaca-software/40kdc-data";
import type { Data40k } from "../lib/data";
import { dekebabLabel } from "../lib/describe";
import { byId } from "../lib/lookup";
import { useLists } from "../store/lists";

interface Props {
  data: Data40k;
  stratagem: Stratagem;
  factionId: string | null;
  listId: string | null;
}

const TURN_LABEL: Record<string, string> = {
  "your-turn": "Your turn",
  "opponents-turn": "Opponent's turn",
  either: "Either turn",
  "either-turn": "Either turn",
};

export default function StratagemCard({ data, stratagem, factionId, listId }: Props) {
  const note = useLists((s) =>
    listId ? (s.lists[listId]?.notes[stratagem.id] ?? "") : "",
  );
  const setNote = useLists((s) => s.setNote);
  const [editing, setEditing] = useState(false);

  const ability = byId(data.abilities, stratagem.ability_id, factionId);
  const text = ability?.describe() ?? null;
  const tr = stratagem.target_restrictions;

  return (
    <div className="rounded-md border border-edge bg-panel/50 px-2.5 py-2">
      <div className="flex items-baseline gap-2">
        <span className="flex-1 text-xs font-bold uppercase tracking-wide">{stratagem.name}</span>
        <span className="rounded bg-accent/20 px-1.5 py-px text-[11px] font-bold text-accent">
          {stratagem.cp_cost} CP
        </span>
      </div>
      <div className="mt-1 flex flex-wrap gap-1 text-[10px] uppercase tracking-wide text-ink-faint">
        {stratagem.phases.map((p) => (
          <span key={p} className="rounded bg-panel px-1 py-px">
            {dekebabLabel(p)}
          </span>
        ))}
        <span className="rounded bg-panel px-1 py-px">
          {TURN_LABEL[stratagem.player_turn] ?? dekebabLabel(stratagem.player_turn)}
        </span>
        <span className="rounded bg-panel px-1 py-px">{dekebabLabel(stratagem.timing)}</span>
      </div>
      {text && <p className="mt-1.5 whitespace-pre-wrap text-sm leading-snug">{text}</p>}
      {!text && tr?.notes && (
        <p className="mt-1.5 text-sm leading-snug text-ink-dim">
          <span className="text-[10px] uppercase text-ink-faint">Target: </span>
          {tr.notes}
        </p>
      )}
      {tr?.required_keywords && tr.required_keywords.length > 0 && (
        <p className="mt-1 text-[11px] text-ink-faint">
          Targets: {tr.required_keywords.join(" + ")}
          {tr.required_keywords_any?.length ? ` (any of: ${tr.required_keywords_any.join(", ")})` : ""}
        </p>
      )}
      {listId && (
        <div className="mt-1.5">
          {editing ? (
            <textarea
              autoFocus
              defaultValue={note}
              rows={2}
              placeholder="Your note (what this does)…"
              className="w-full rounded border border-edge bg-surface p-1.5 text-sm"
              onBlur={(e) => {
                setNote(listId, stratagem.id, e.target.value);
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
      )}
    </div>
  );
}
