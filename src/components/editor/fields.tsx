/**
 * Small shared form controls for the codex editor. Mobile-first, matching the
 * app's existing input styling.
 */
import { useState, type ReactNode } from "react";

const INPUT = "w-full rounded-md border border-edge bg-panel px-2 py-1.5 text-sm";

export function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
        {label}
      </span>
      {children}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input type="text" {...props} className={`${INPUT} ${props.className ?? ""}`} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={`${INPUT} ${props.className ?? ""}`} />;
}

/**
 * Numeric input that tolerates being emptied mid-edit; commits `fallback`
 * (default 0) on blur when left empty.
 */
export function NumberInput({
  value,
  onValue,
  fallback = 0,
  className = "",
  ...rest
}: {
  value: number;
  onValue: (n: number) => void;
  fallback?: number;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      type="number"
      inputMode="numeric"
      value={text ?? String(value)}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value.trim() !== "" && Number.isFinite(n)) onValue(n);
      }}
      onBlur={() => {
        if (text !== null && text.trim() === "") onValue(fallback);
        setText(null);
      }}
      {...rest}
      className={`${INPUT} ${className}`}
    />
  );
}

/**
 * Free text that may hold a number or a dice expression ("D6", "D6+2") —
 * used for A / S / D / M stat cells.
 */
export function StatInput({
  value,
  onValue,
  className = "",
  ...rest
}: {
  value: number | string;
  onValue: (v: number | string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <input
      type="text"
      inputMode="text"
      value={String(value)}
      onChange={(e) => {
        const raw = e.target.value.trim();
        const n = Number(raw);
        onValue(raw !== "" && Number.isFinite(n) ? n : e.target.value);
      }}
      {...rest}
      className={`${INPUT} ${className}`}
    />
  );
}

/** Chip list with an inline adder — Enter or comma commits, × removes. */
export function ChipListInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const commit = () => {
    const parts = draft
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s && !value.includes(s));
    if (parts.length > 0) onChange([...value, ...parts]);
    setDraft("");
  };
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-md border border-edge bg-panel px-2 py-1.5">
      {value.map((chip) => (
        <span
          key={chip}
          className="inline-flex items-center gap-1 rounded bg-edge/60 px-1.5 py-0.5 text-xs"
        >
          {chip}
          <button
            type="button"
            aria-label={`Remove ${chip}`}
            onClick={() => onChange(value.filter((c) => c !== chip))}
            className="text-ink-faint"
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={commit}
        placeholder={value.length === 0 ? placeholder : undefined}
        className="min-w-20 flex-1 bg-transparent text-sm outline-none"
      />
    </div>
  );
}

export function SectionCard({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-md border border-edge">
      <div className="flex items-center gap-2 border-b border-edge px-3 py-2">
        <h2 className="flex-1 text-sm font-semibold">{title}</h2>
        {actions}
      </div>
      <div className="space-y-2 p-3">{children}</div>
    </section>
  );
}

/** Full-width tab bar for switching lists; labels carry their counts. */
export function TabBar({
  tabs,
  active,
  onSelect,
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div role="tablist" className="flex overflow-hidden rounded-md border border-edge text-sm font-semibold">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          onClick={() => onSelect(t.id)}
          className={`min-h-11 flex-1 px-2 ${
            active === t.id ? "bg-accent/20 text-accent" : "text-ink-dim active:bg-panel"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** View/Edit segmented toggle shared by the editor screens. */
export function ModeToggle({
  mode,
  onChange,
}: {
  mode: "view" | "edit";
  onChange: (m: "view" | "edit") => void;
}) {
  return (
    <div className="flex shrink-0 overflow-hidden rounded-md border border-edge text-xs font-semibold">
      {(["view", "edit"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`px-3 py-1.5 capitalize ${
            mode === m ? "bg-accent/20 text-accent" : "text-ink-faint active:bg-panel"
          }`}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

export function SmallButton({
  onClick,
  children,
  tone = "default",
}: {
  onClick: () => void;
  children: ReactNode;
  tone?: "default" | "danger" | "primary";
}) {
  const toneClass =
    tone === "danger"
      ? "text-opponent border-opponent/40"
      : tone === "primary"
        ? "bg-accent text-white border-accent"
        : "border-edge text-ink-dim";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2 py-1 text-xs font-semibold active:bg-panel ${toneClass}`}
    >
      {children}
    </button>
  );
}
