import { useEffect, useRef, useState } from "react";
import {
  MODIFIERS,
  TARGET_CONDITIONS,
  modifierLabel,
  type ModifierDef,
  type ModifierState,
} from "../lib/crunch";

/** The value one step along, or null past the range. Ranges spanning zero
 * (±1 to Hit) skip the do-nothing 0. */
function stepped(def: ModifierDef, v: number, dir: 1 | -1): number | null {
  if (!def.range) return null;
  let next = v + dir;
  if (next === 0) next += dir;
  return next < def.range.min || next > def.range.max ? null : next;
}

/**
 * Searchable multi-picker for the manual damage modifiers. Picked modifiers
 * sit as chips above the trigger; ones with a value (+N S, Sustained Hits N…)
 * carry an inline −/+ so abilities that move a stat by more than 1 fit, and
 * every chip cycles a target condition ("vs non-VEH/MON") for the 11e
 * abilities that only bite on some targets.
 */
export default function ModifierPicker({
  value,
  onChange,
}: {
  value: ModifierState;
  onChange: (next: ModifierState) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    searchRef.current?.focus();
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = (def: ModifierDef) => {
    const next = { ...value };
    if (def.id in next) delete next[def.id];
    else next[def.id] = { value: def.range?.initial ?? 0, vs: "all" };
    onChange(next);
  };

  const step = (def: ModifierDef, dir: 1 | -1) => {
    const v = stepped(def, value[def.id].value, dir);
    if (v != null) onChange({ ...value, [def.id]: { ...value[def.id], value: v } });
  };

  const cycleCondition = (def: ModifierDef) => {
    const i = TARGET_CONDITIONS.findIndex((c) => c.id === value[def.id].vs);
    const vs = TARGET_CONDITIONS[(i + 1) % TARGET_CONDITIONS.length].id;
    onChange({ ...value, [def.id]: { ...value[def.id], vs } });
  };

  const q = query.trim().toLowerCase();
  const shown = q
    ? MODIFIERS.filter((m) =>
        `${m.label} ${m.group} ${m.aliases ?? ""}`.toLowerCase().includes(q),
      )
    : MODIFIERS;
  const groups = [...new Set(shown.map((m) => m.group))];
  const picked = MODIFIERS.filter((m) => m.id in value);

  const stepBtn =
    "flex h-5 w-5 items-center justify-center rounded-full text-xs leading-none hover:bg-accent/20 disabled:opacity-30";

  return (
    <div ref={rootRef} className="relative">
      <div className="flex flex-wrap items-center gap-1.5">
        {picked.map((def) => {
          const { value: v, vs } = value[def.id];
          return (
            <span
              key={def.id}
              className="flex items-center gap-1 rounded-full border border-accent/60 bg-accent/15 py-0.5 pl-2.5 pr-1 text-xs font-semibold text-accent"
            >
              {def.range && (
                <button
                  type="button"
                  aria-label={`Lower ${def.label}`}
                  disabled={stepped(def, v, -1) == null}
                  onClick={() => step(def, -1)}
                  className={stepBtn}
                >
                  −
                </button>
              )}
              <span className="tabular-nums">{modifierLabel(def, v)}</span>
              {def.range && (
                <button
                  type="button"
                  aria-label={`Raise ${def.label}`}
                  disabled={stepped(def, v, 1) == null}
                  onClick={() => step(def, 1)}
                  className={stepBtn}
                >
                  +
                </button>
              )}
              <button
                type="button"
                title="Which targets this applies against — tap to cycle"
                onClick={() => cycleCondition(def)}
                className={`ml-0.5 rounded-full px-1.5 text-[10px] font-medium ${
                  vs === "all" ? "text-ink-faint hover:text-ink-dim" : "bg-accent/25 text-accent"
                }`}
              >
                {TARGET_CONDITIONS.find((c) => c.id === vs)!.label}
              </button>
              <button
                type="button"
                aria-label={`Remove ${def.label}`}
                onClick={() => toggle(def)}
                className={`${stepBtn} text-ink-dim`}
              >
                ×
              </button>
            </span>
          );
        })}
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="rounded-full border border-dashed border-edge bg-panel px-2.5 py-1 text-xs text-ink-dim hover:text-ink"
        >
          + Add modifier
        </button>
        {picked.length > 1 && (
          <button
            type="button"
            onClick={() => onChange({})}
            className="px-1 text-[11px] text-ink-faint underline decoration-dotted"
          >
            clear
          </button>
        )}
      </div>

      {open && (
        <div className="absolute left-0 z-20 mt-1 w-full max-w-xs overflow-hidden rounded-md border border-edge bg-panel shadow-lg shadow-black/50">
          <div className="border-b border-edge p-1.5">
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search modifiers…"
              className="w-full rounded border border-edge bg-surface px-2 py-1 text-xs outline-none placeholder:text-ink-faint focus:border-accent/60"
            />
          </div>
          <ul role="listbox" aria-multiselectable className="max-h-72 overflow-y-auto">
            {groups.map((g) => (
              <li key={g}>
                <p className="bg-surface/60 px-3 py-1 text-[9px] font-semibold uppercase tracking-wide text-ink-faint">
                  {g}
                </p>
                <ul>
                  {shown
                    .filter((m) => m.group === g)
                    .map((def) => {
                      const on = def.id in value;
                      return (
                        <li key={def.id} role="option" aria-selected={on}>
                          <button
                            type="button"
                            onClick={() => toggle(def)}
                            className={`flex min-h-9 w-full items-center gap-2 border-t border-edge/40 px-3 py-1.5 text-left text-xs ${
                              on ? "bg-accent/10 text-accent" : "hover:bg-surface active:bg-surface"
                            }`}
                          >
                            <span className={`w-3 shrink-0 ${on ? "" : "opacity-0"}`}>✓</span>
                            <span className="min-w-0 flex-1">{def.label}</span>
                            {def.range && (
                              <span className="shrink-0 text-[10px] text-ink-faint">adjustable</span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                </ul>
              </li>
            ))}
            {shown.length === 0 && (
              <li className="px-3 py-2 text-xs text-ink-faint">No matches</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
