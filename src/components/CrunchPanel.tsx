import { useMemo, useState } from "react";
import type { StackableBuff } from "@alpaca-software/40kdc-data";
import type { Data40k } from "../lib/data";
import {
  CORE_TARGET_IDS,
  DEFAULT_SITUATION,
  MANUAL_TOGGLES,
  crunchLevers,
  engineContext,
  memberFromRosterUnit,
  standardTargets,
  unitOutput,
  type CrunchMember,
  type CrunchPhase,
  type CrunchSituation,
} from "../lib/crunch";
import { effectiveAttachments, leadersAttachedTo } from "../lib/attachments";
import { formatSave } from "../lib/describe";
import type { DisplayEntry } from "../lib/dedupe";
import type { SavedList } from "../store/schema";

interface Props {
  data: Data40k;
  list: SavedList;
  entry: DisplayEntry;
}

/** Board-state chips: label + which situation field they flip. */
const SITUATION_TOGGLES: { key: keyof Omit<CrunchSituation, "phase">; label: string }[] = [
  { key: "withinHalfRange", label: "Half range" },
  { key: "stationary", label: "Stationary" },
  { key: "targetInCover", label: "Target in cover" },
  { key: "charged", label: "Charged" },
];

/**
 * Expected damage/kills of this unit block — with any attached characters —
 * against the dataset's standard targets. Always-on abilities apply by
 * default; stratagems and situational levers are chips the user flips to
 * ballpark a boosted activation.
 */
export default function CrunchPanel({ data, list, entry }: Props) {
  const [instanceIdx, setInstanceIdx] = useState(0);
  const [sit, setSit] = useState<CrunchSituation>(DEFAULT_SITUATION);
  const [phaseTouched, setPhaseTouched] = useState(false);
  const [leverState, setLeverState] = useState<Record<string, boolean>>({});
  const [manualState, setManualState] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [allTargets, setAllTargets] = useState(false);

  const factionId = list.roster.faction_id;
  const inst = entry.instances[Math.min(instanceIdx, entry.instances.length - 1)];

  // The combined unit: this entry's squad plus attached characters (viewed
  // from either side — a leader's page pulls in its bodyguard squad too).
  const members = useMemo<CrunchMember[]>(() => {
    const units = list.roster.units;
    const main = memberFromRosterUnit(data, units[inst.rosterIndex], factionId);
    if (!main) return [];
    const partnerIdxs: number[] = [];
    const bodyguard = effectiveAttachments(list).get(inst.rosterIndex);
    if (bodyguard !== undefined) partnerIdxs.push(bodyguard);
    for (const leaderIdx of leadersAttachedTo(list, [inst.rosterIndex]).keys()) {
      partnerIdxs.push(leaderIdx);
    }
    const partners = partnerIdxs
      .map((i) => memberFromRosterUnit(data, units[i], factionId))
      .filter((m): m is CrunchMember => m !== null);
    return [main, ...partners];
  }, [data, list, inst.rosterIndex, factionId]);

  const hasPhase = useMemo(() => {
    const check = (wantMelee: boolean) =>
      members.some((m) =>
        m.lines.some((line) => {
          const w = data.weapons.getInFaction(line.weaponId, factionId ?? "") ??
            data.weapons.getAny(line.weaponId);
          return w?.raw.profiles.some((p) => data.isMeleeProfile(p) === wantMelee);
        }),
      );
    return { shooting: check(false), fight: check(true) };
  }, [data, members, factionId]);

  // A melee-only unit (or one with no guns) opens on the phase it can play.
  const phase: CrunchPhase =
    phaseTouched ? sit.phase : hasPhase.shooting ? "shooting" : "fight";
  const situation = { ...sit, phase };

  const detachmentId = list.roster.detachments[0]?.ref.id ?? undefined;
  const ctx = useMemo(
    () => engineContext(data, members, factionId, situation),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, members, factionId, phase, sit.withinHalfRange, sit.stationary, sit.charged, sit.targetInCover],
  );

  const levers = useMemo(
    () => crunchLevers(data, members, factionId, detachmentId, ctx),
    [data, members, factionId, detachmentId, ctx],
  );

  const chosenBuffs = useMemo(() => {
    const fromLevers = levers.buffs
      .filter((l) => leverState[l.id] ?? l.enabled)
      .flatMap((l) => l.buffs);
    const fromManual = MANUAL_TOGGLES.filter((t) => manualState[t.id]).map((t) => t.buff);
    return [...fromLevers, ...fromManual];
  }, [levers, leverState, manualState]);

  const results = useMemo(() => {
    if (members.length === 0) return [];
    return standardTargets(data).map((target) =>
      unitOutput(data, members, factionId, chosenBuffs, ctx, target),
    );
  }, [data, members, factionId, chosenBuffs, ctx]);

  // Benchmark five by default; the full standard-target list on demand.
  const shownResults = allTargets
    ? results
    : results.filter((r) => CORE_TARGET_IDS.has(r.target.profileId));
  const hiddenCount = results.length - shownResults.length;

  if (members.length === 0 || results.length === 0) return null;
  if (!hasPhase.shooting && !hasPhase.fight) return null;

  const chip = (active: boolean) =>
    `rounded-full border px-2.5 py-1 text-xs transition-colors ${
      active
        ? "border-accent/60 bg-accent/15 font-semibold text-accent"
        : "border-edge bg-panel text-ink-dim"
    }`;

  return (
    <div className="space-y-2.5">
      {entry.count > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {entry.instances.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setInstanceIdx(i)}
              className={chip(i === instanceIdx)}
            >
              #{i + 1} · {s.modelCount} models
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1.5">
        {(["shooting", "fight"] as const).map((p) => (
          <button
            key={p}
            type="button"
            disabled={!hasPhase[p]}
            onClick={() => {
              setPhaseTouched(true);
              setSit((s) => ({ ...s, phase: p }));
            }}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
              phase === p
                ? "bg-accent/20 text-accent"
                : hasPhase[p]
                  ? "bg-panel text-ink-dim"
                  : "bg-panel/50 text-ink-faint opacity-50"
            }`}
          >
            {p === "shooting" ? "Shooting" : "Melee"}
          </button>
        ))}
        {members.length > 1 && (
          <span className="ml-auto text-[11px] text-ink-faint">
            incl. {members.slice(1).map((m) => m.label).join(" + ")}
          </span>
        )}
      </div>

      {levers.buffs.length > 0 && (
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
            Abilities &amp; stratagems
          </p>
          <div className="flex flex-wrap gap-1.5">
            {levers.buffs.map((l) => (
              <LeverChip
                key={l.id}
                lever={l}
                on={leverState[l.id] ?? l.enabled}
                toggle={() =>
                  setLeverState((s) => ({ ...s, [l.id]: !(s[l.id] ?? l.enabled) }))
                }
                chip={chip}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
          Situation &amp; extras
        </p>
        <div className="flex flex-wrap gap-1.5">
          {SITUATION_TOGGLES.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setSit((s) => ({ ...s, [key]: !s[key] }))}
              className={chip(sit[key])}
            >
              {label}
            </button>
          ))}
          {MANUAL_TOGGLES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setManualState((s) => ({ ...s, [t.id]: !s[t.id] }))}
              className={chip(!!manualState[t.id])}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

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
              const stats = r.target.unitRaw.profiles[0];
              const isOpen = expanded === r.target.profileId;
              return (
                <TargetRows
                  key={r.target.profileId}
                  result={r}
                  stats={stats}
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
      <p className="text-[10px] leading-snug text-ink-faint">
        Expected values, all weapons in range. Always-on abilities are pre-applied — flip
        chips to layer stratagems and buffs. Kills cap at the target's model count.
      </p>
    </div>
  );
}

function LeverChip({
  lever,
  on,
  toggle,
  chip,
}: {
  lever: StackableBuff;
  on: boolean;
  toggle: () => void;
  chip: (active: boolean) => string;
}) {
  return (
    <button type="button" onClick={toggle} className={chip(on)} title={lever.label}>
      {lever.enabled && <span className="mr-1 opacity-70">{on ? "✓" : "✗"}</span>}
      {lever.label}
    </button>
  );
}

/**
 * The attack sequence as expected values — attacks → hits → wounds → unsaved
 * → damage (→ after FNP when the target has one) → models slain. The same
 * "flow" view damage calculators show, summed across the unit's weapons.
 */
function FlowStrip({ result }: { result: ReturnType<typeof unitOutput> }) {
  const f = result.flow;
  const fmt = (n: number) => (Number.isInteger(Math.round(n * 10) / 10) ? String(Math.round(n)) : n.toFixed(1));
  const stages: { label: string; value: number }[] = [
    { label: "attacks", value: f.attacks },
    { label: "hits", value: f.hits },
    { label: "wounds", value: f.wounds },
    { label: "unsaved", value: f.unsaved },
    { label: "damage", value: f.damage },
  ];
  if (Math.abs(f.afterFnp - f.damage) > 0.01) {
    stages.push({ label: "after FNP", value: f.afterFnp });
  }
  stages.push({ label: "slain", value: result.kills });
  if (f.attacks <= 0) return null;
  return (
    <div className="mb-1.5 overflow-x-auto">
      <div className="flex w-max items-center gap-1 whitespace-nowrap text-[11px]">
        {stages.map((s, i) => (
          <span key={s.label} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden className="text-ink-faint">→</span>}
            <span className={s.label === "slain" ? "text-accent" : ""}>
              <span className="font-semibold tabular-nums">{fmt(s.value)}</span>{" "}
              <span className="text-ink-faint">{s.label}</span>
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function TargetRows({
  result,
  stats,
  open,
  onToggle,
}: {
  result: ReturnType<typeof unitOutput>;
  stats: { T?: unknown; W?: unknown; Sv?: unknown; invuln_sv?: number | null } | undefined;
  open: boolean;
  onToggle: () => void;
}) {
  const save = stats
    ? `${formatSave(Number(stats.Sv))}${
        stats.invuln_sv != null ? ` / ${formatSave(stats.invuln_sv, true)}` : ""
      }`
    : "—";
  return (
    <>
      <tr className="cursor-pointer border-t border-edge" onClick={onToggle}>
        <td className="py-1.5 pr-1 text-right tabular-nums text-ink-faint">
          {result.target.modelCount}
        </td>
        <td className="px-1.5 py-1.5">{result.target.profileName}</td>
        <td className="px-1 py-1.5 text-center tabular-nums">{String(stats?.T ?? "—")}</td>
        <td className="px-1 py-1.5 text-center tabular-nums">{String(stats?.W ?? "—")}</td>
        <td className="px-1 py-1.5 text-center tabular-nums whitespace-nowrap">{save}</td>
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
            <FlowStrip result={result} />
            <div className="space-y-0.5">
              {result.weapons.map((w, i) => (
                <div key={`${w.weaponId}-${i}`} className="flex items-baseline gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate text-ink-dim">
                    {w.count > 1 && (
                      <span className="font-semibold text-accent">{w.count}× </span>
                    )}
                    {w.weaponName}
                    {w.profileName && <span className="italic"> ({w.profileName})</span>}
                  </span>
                  <span className="tabular-nums">{w.damage.toFixed(2)}</span>
                </div>
              ))}
              {result.weapons.length === 0 && (
                <p className="text-xs italic text-ink-faint">No weapons fire this phase.</p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
