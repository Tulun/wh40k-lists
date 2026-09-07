import { useMemo, useState } from "react";
import type { StackableBuff } from "@alpaca-software/40kdc-data";
import type { Data40k } from "../lib/data";
import {
  DEFAULT_SITUATION,
  MANUAL_TOGGLES,
  SITUATION_TOGGLES,
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
import type { DisplayEntry } from "../lib/dedupe";
import type { SavedList } from "../store/schema";
import { TargetTable, crunchChip } from "./CrunchResults";

interface Props {
  data: Data40k;
  list: SavedList;
  entry: DisplayEntry;
}

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

  if (members.length === 0 || results.length === 0) return null;
  if (!hasPhase.shooting && !hasPhase.fight) return null;

  const chip = crunchChip;

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

      <TargetTable results={results} />
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

