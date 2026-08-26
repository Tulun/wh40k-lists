import { useEffect, useRef, useState } from "react";

export interface DropdownOption {
  value: string;
  label: string;
  /** Right-aligned secondary text ("10 pts", "2 DP", "taken"). */
  detail?: string;
  disabled?: boolean;
}

/**
 * Styled replacement for a native <select>, matching the app's dark panel
 * look. Renders a trigger button and an in-page options panel; the native
 * popup can't be themed. Closes on outside tap or Escape.
 */
export default function Dropdown({
  value,
  options,
  onChange,
  placeholder,
  clearable = false,
  className = "",
}: {
  value: string | null;
  options: DropdownOption[];
  onChange: (value: string | null) => void;
  /** Trigger text when nothing is selected; also the clear-row label. */
  placeholder: string;
  /** Offer a row that clears the selection back to null. */
  clearable?: boolean;
  /** Extra classes for the trigger button (e.g. width/text size tweaks). */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
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

  const selected = value != null ? options.find((o) => o.value === value) : undefined;

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center gap-2 rounded-md border border-edge bg-panel px-3 py-1.5 text-left text-xs ${
          selected ? "" : "text-ink-dim"
        } ${className}`}
      >
        <span className="min-w-0 flex-1 truncate">{selected?.label ?? placeholder}</span>
        {selected?.detail && <span className="shrink-0 text-ink-faint">{selected.detail}</span>}
        <span
          className={`shrink-0 text-[9px] text-ink-faint transition-transform ${open ? "rotate-180" : ""}`}
        >
          ▼
        </span>
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 z-20 mt-1 max-h-64 min-w-fit overflow-y-auto rounded-md border border-edge bg-panel shadow-lg shadow-black/50"
        >
          {clearable && (
            <Row
              label={placeholder}
              selected={value == null}
              muted
              onPick={() => {
                onChange(null);
                setOpen(false);
              }}
            />
          )}
          {options.map((o) => (
            <Row
              key={o.value}
              label={o.label}
              detail={o.detail}
              disabled={o.disabled}
              selected={o.value === value}
              onPick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            />
          ))}
          {options.length === 0 && !clearable && (
            <li className="px-3 py-2 text-xs text-ink-faint">Nothing available</li>
          )}
        </ul>
      )}
    </div>
  );
}

function Row({
  label,
  detail,
  disabled = false,
  muted = false,
  selected,
  onPick,
}: {
  label: string;
  detail?: string;
  disabled?: boolean;
  muted?: boolean;
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <li role="option" aria-selected={selected}>
      <button
        type="button"
        disabled={disabled}
        onClick={onPick}
        className={`flex min-h-10 w-full items-center gap-2 border-b border-edge/60 px-3 py-1.5 text-left text-xs last:border-b-0 ${
          disabled
            ? "text-ink-faint/60"
            : selected
              ? "bg-accent/10 text-accent"
              : muted
                ? "text-ink-dim active:bg-surface"
                : "active:bg-surface"
        }`}
      >
        <span className={`w-3 shrink-0 ${selected ? "" : "opacity-0"}`}>✓</span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {detail && (
          <span className={`shrink-0 ${disabled ? "" : "text-ink-faint"}`}>{detail}</span>
        )}
      </button>
    </li>
  );
}
