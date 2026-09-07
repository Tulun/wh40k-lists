/**
 * Presentation pieces shared by the two damage views: the per-unit CrunchPanel
 * (roster entry vs standard targets) and the standalone Crunch lab (any
 * attacker vs any defender). One implementation so the flow strip, per-weapon
 * breakdown, and target-table rows stay identical everywhere.
 */
import { useState } from "react";
import { CORE_TARGET_IDS, type StageFlow, type TargetOutput, type WeaponOutput } from "../lib/crunch";
import { formatSave } from "../lib/describe";

/** Toggle-chip styling shared across the crunch UIs. */
export function crunchChip(active: boolean): string {
  return `rounded-full border px-2.5 py-1 text-xs transition-colors ${
    active
      ? "border-accent/60 bg-accent/15 font-semibold text-accent"
      : "border-edge bg-panel text-ink-dim"
  }`;
}

/** One decimal, but whole numbers stay whole ("12", "3.4"). */
export function fmtExpected(n: number): string {
  return Number.isInteger(Math.round(n * 10) / 10) ? String(Math.round(n)) : n.toFixed(1);
}

/**
 * The attack sequence as expected values — attacks → hits → wounds → unsaved
 * → damage (→ after FNP when the target has one) → models slain. The same
 * "flow" view damage calculators show, summed across the unit's weapons.
 */
export function FlowStrip({ flow, kills }: { flow: StageFlow; kills: number }) {
  const stages: { label: string; value: number }[] = [
    { label: "attacks", value: flow.attacks },
    { label: "hits", value: flow.hits },
    { label: "wounds", value: flow.wounds },
    { label: "unsaved", value: flow.unsaved },
    { label: "damage", value: flow.damage },
  ];
  if (Math.abs(flow.afterFnp - flow.damage) > 0.01) {
    stages.push({ label: "after FNP", value: flow.afterFnp });
  }
  stages.push({ label: "slain", value: kills });
  if (flow.attacks <= 0) return null;
  return (
    <div className="overflow-x-auto">
      <div className="flex w-max items-center gap-1 whitespace-nowrap text-[11px]">
        {stages.map((s, i) => (
          <span key={s.label} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden className="text-ink-faint">→</span>}
            <span className={s.label === "slain" ? "text-accent" : ""}>
              <span className="font-semibold tabular-nums">{fmtExpected(s.value)}</span>{" "}
              <span className="text-ink-faint">{s.label}</span>
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Per-weapon stage table: each line's attacks → hits → wounds → unsaved →
 * damage, so you can see WHICH gun is doing the work, not just the totals.
 */
export function WeaponBreakdown({ weapons }: { weapons: WeaponOutput[] }) {
  if (weapons.length === 0) {
    return <p className="text-xs italic text-ink-faint">No weapons fire this phase.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="text-[9px] uppercase text-ink-faint">
            <th className="py-0.5 pr-1.5 text-left font-semibold">Weapon</th>
            <th className="px-1 py-0.5 text-right font-semibold">A</th>
            <th className="px-1 py-0.5 text-right font-semibold">Hits</th>
            <th className="px-1 py-0.5 text-right font-semibold">Wnds</th>
            <th className="px-1 py-0.5 text-right font-semibold">Uns</th>
            <th className="py-0.5 pl-1 text-right font-semibold">Dmg</th>
          </tr>
        </thead>
        <tbody>
          {weapons.map((w, i) => (
            <tr key={`${w.weaponId}-${i}`} className="border-t border-edge/40">
              <td className="max-w-48 truncate py-1 pr-1.5 text-ink-dim">
                {w.count > 1 && <span className="font-semibold text-accent">{w.count}× </span>}
                {w.weaponName}
                {w.profileName && <span className="italic"> ({w.profileName})</span>}
              </td>
              <td className="px-1 py-1 text-right tabular-nums">{fmtExpected(w.flow.attacks)}</td>
              <td className="px-1 py-1 text-right tabular-nums">{fmtExpected(w.flow.hits)}</td>
              <td className="px-1 py-1 text-right tabular-nums">{fmtExpected(w.flow.wounds)}</td>
              <td className="px-1 py-1 text-right tabular-nums">{fmtExpected(w.flow.unsaved)}</td>
              <td className="py-1 pl-1 text-right font-semibold tabular-nums">
                {w.damage.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** "2+ / 4++" save cell text for a unit profile. */
export function saveLabel(
  stats: { Sv?: unknown; invuln_sv?: number | null } | undefined,
): string {
  if (!stats) return "—";
  return `${formatSave(Number(stats.Sv))}${
    stats.invuln_sv != null ? ` / ${formatSave(stats.invuln_sv, true)}` : ""
  }`;
}

/**
 * The results table over the standard target profiles: benchmark five by
 * default, the full list behind a "show all" toggle, each row expandable to
 * its flow strip + per-weapon breakdown.
 */
export function TargetTable({ results }: { results: TargetOutput[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [allTargets, setAllTargets] = useState(false);

  const shownResults = allTargets
    ? results
    : results.filter((r) => CORE_TARGET_IDS.has(r.target.profileId));
  const hiddenCount = results.length - shownResults.length;

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-[10px] uppercase text-ink-faint">
              <th className="py-1 pr-1 text-right font-semibold">#</th>
              <th className="px-1.5 py-1 text-left font-semibold">Target</th>
              <th className="px-1 py-1 text-center font-semibold">T</th>
              <th className="px-1 py-1 text-center font-semibold">W</th>
              <th className="px-1 py-1 text-center font-semibold">Sv</th>
              <th className="px-1.5 py-1 text-right font-semibold">Dmg</th>
              <th className="px-1.5 py-1 text-right font-semibold">Kills</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shownResults.map((r) => {
              const isOpen = expanded === r.target.profileId;
              return (
                <TargetRows
                  key={r.target.profileId}
                  result={r}
                  open={isOpen}
                  onToggle={() => setExpanded(isOpen ? null : r.target.profileId)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
      {(hiddenCount > 0 || allTargets) && (
        <button
          type="button"
          onClick={() => setAllTargets(!allTargets)}
          className="w-full rounded-md border border-edge py-1.5 text-xs font-semibold text-ink-dim hover:bg-panel active:bg-panel"
        >
          {allTargets ? "▴ Show benchmark targets only" : `▾ Show all targets (${hiddenCount} more)`}
        </button>
      )}
    </>
  );
}

/**
 * One target's row in the results table, plus its expandable detail row
 * (flow strip + per-weapon breakdown).
 */
export function TargetRows({
  result,
  open,
  onToggle,
}: {
  result: TargetOutput;
  open: boolean;
  onToggle: () => void;
}) {
  const stats = result.target.unitRaw.profiles[0];
  return (
    <>
      <tr className="cursor-pointer border-t border-edge" onClick={onToggle}>
        <td className="py-1.5 pr-1 text-right tabular-nums text-ink-faint">
          {result.target.modelCount}
        </td>
        <td className="px-1.5 py-1.5">{result.target.profileName}</td>
        <td className="px-1 py-1.5 text-center tabular-nums">{String(stats?.T ?? "—")}</td>
        <td className="px-1 py-1.5 text-center tabular-nums">{String(stats?.W ?? "—")}</td>
        <td className="whitespace-nowrap px-1 py-1.5 text-center tabular-nums">
          {saveLabel(stats)}
        </td>
        <td className="px-1.5 py-1.5 text-right font-semibold tabular-nums">
          {result.damage.toFixed(1)}
        </td>
        <td className="px-1.5 py-1.5 text-right font-semibold tabular-nums text-accent">
          {result.kills.toFixed(result.kills >= 10 ? 1 : 2)}
        </td>
        <td className="pl-1 text-center text-xs text-ink-faint">{open ? "▴" : "▾"}</td>
      </tr>
      {open && (
        <tr className="border-t border-edge/40 bg-panel/40">
          <td colSpan={8} className="px-2 py-1.5">
            <div className="mb-1.5">
              <FlowStrip flow={result.flow} kills={result.kills} />
            </div>
            <WeaponBreakdown weapons={result.weapons} />
          </td>
        </tr>
      )}
    </>
  );
}
