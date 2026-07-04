import { formatSave } from "../lib/describe";

export interface Profile {
  name?: string | null;
  /** Movement can be a string for special values (e.g. hover/variable moves). */
  M: number | string;
  T: number;
  W: number;
  Sv: number;
  invuln_sv?: number | null;
  Ld: number;
  OC: number;
}

const CELLS: { label: string; render: (p: Profile) => string }[] = [
  { label: "M", render: (p) => `${p.M}"` },
  { label: "T", render: (p) => String(p.T) },
  { label: "Sv", render: (p) => formatSave(p.Sv) },
  { label: "Inv", render: (p) => (p.invuln_sv != null ? formatSave(p.invuln_sv, true) : "—") },
  { label: "W", render: (p) => String(p.W) },
  { label: "Ld", render: (p) => formatSave(p.Ld) },
  { label: "OC", render: (p) => String(p.OC) },
];

export default function StatLine({ profile, showName }: { profile: Profile; showName?: boolean }) {
  return (
    <div>
      {showName && profile.name && (
        <div className="mb-0.5 text-xs font-medium text-ink-dim">{profile.name}</div>
      )}
      <div className="grid grid-cols-7 overflow-hidden rounded-md border border-edge text-center">
        {CELLS.map(({ label }) => (
          <div key={label} className="bg-panel py-0.5 text-[10px] font-semibold uppercase text-ink-faint">
            {label}
          </div>
        ))}
        {CELLS.map(({ label, render }) => (
          <div key={`v-${label}`} className="py-1 text-sm font-bold tabular-nums">
            {render(profile)}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Compact inline stats for glance rows: T4 · 3+/4++ · W12 · OC3 */
export function MicroStats({ profile }: { profile: Profile }) {
  const save =
    profile.invuln_sv != null
      ? `${profile.Sv}+/${profile.invuln_sv}++`
      : `${profile.Sv}+`;
  return (
    <span className="whitespace-nowrap text-xs tabular-nums text-ink-dim">
      T{profile.T} · {save} · W{profile.W} · OC{profile.OC}
    </span>
  );
}
