import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Unit } from "@alpaca-software/40kdc-data";
import Dropdown from "../components/Dropdown";
import {
  FlowStrip,
  TargetTable,
  WeaponBreakdown,
  crunchChip,
  saveLabel,
} from "../components/CrunchResults";
import { MicroStats } from "../components/StatLine";
import { useDataset } from "../hooks/useDataset";
import type { Data40k } from "../lib/data";
import { fnpFromAbilityNames } from "../lib/describe";
import { EXPLORE_FACTION_IDS } from "../lib/flags";
import { loadoutDataMissing } from "../lib/list-edit";
import { byId } from "../lib/lookup";
import {
  DEFAULT_SITUATION,
  MANUAL_TOGGLES,
  SITUATION_TOGGLES,
  crunchLevers,
  engineContext,
  memberFromCounts,
  standardTargets,
  targetFromUnit,
  unitOutput,
  type CrunchMember,
  type CrunchPhase,
  type CrunchSituation,
  type TargetOutput,
} from "../lib/crunch";
import { useActiveList } from "../store/lists";

/**
 * The UnitCrunch-style standalone calculator: load ANY attacker datasheet
 * (faction → unit, size, editable weapon loadout, optional attached leader)
 * against ANY defender (the benchmark target profiles, or a picked datasheet
 * at a chosen size) and read the full expected attack sequence — per-weapon
 * stage breakdown, survivors, and the points trade.
 *
 * Deep-linkable: `?af`/`au` prefill the attacker, `?df`/`du` the defender
 * (datasheet pages link here with their own ids).
 */
export default function CrunchLabScreen() {
  const data = useDataset();
  if (!data) {
    return <p className="py-16 text-center text-xs text-ink-faint">Loading dataset…</p>;
  }
  return <CrunchLab data={data} />;
}

interface AttackerState {
  factionId: string | null;
  unitId: string | null;
  models: number;
  /** Weapon/wargear id → squad-wide count (the editable loadout). */
  counts: Record<string, number>;
  leaderId: string | null;
  detachmentId: string | null;
}

interface DefenderState {
  factionId: string | null;
  unitId: string | null;
  models: number;
}

/** Wargear options + composition rows, as the package's loadout maths wants them. */
function loadoutCtx(data: Data40k, unit: Unit) {
  return {
    options: data.dataset.wargearOptionsOf(unit),
    models: data.dataset.unitCompositionOf(unit)?.models,
  };
}

/** The unit's out-of-the-box loadout at a size, as plain state. */
function baseCounts(data: Data40k, unit: Unit, models: number): Record<string, number> {
  const { options, models: rows } = loadoutCtx(data, unit);
  return Object.fromEntries(data.baseLoadout(unit, models, options, rows).counts);
}

/** Unit cost at a size, or null when the dataset has no tier covering it. */
function unitPoints(data: Data40k, unit: Unit, models: number): number | null {
  return data.pointsTierMissing(unit, models) ? null : data.baseUnitPoints(unit, models);
}

function CrunchLab({ data }: { data: Data40k }) {
  const [params] = useSearchParams();
  const list = useActiveList();

  const [atk, setAtk] = useState<AttackerState>(() => {
    const factionId = params.get("af") ?? list?.roster.faction_id ?? null;
    const unitId = params.get("au");
    const unit = unitId ? byId(data.units, unitId, factionId) : undefined;
    if (unit) {
      const models = unit.raw.model_count?.min ?? 1;
      return {
        factionId: unit.raw.faction_id ?? factionId,
        unitId: unit.id,
        models,
        counts: baseCounts(data, unit.raw, models),
        leaderId: null,
        detachmentId: null,
      };
    }
    return { factionId, unitId: null, models: 1, counts: {}, leaderId: null, detachmentId: null };
  });

  const [defMode, setDefMode] = useState<"benchmarks" | "unit">(
    params.get("du") ? "unit" : "benchmarks",
  );
  const [def, setDef] = useState<DefenderState>(() => {
    const factionId = params.get("df") ?? null;
    const unitId = params.get("du");
    const unit = unitId ? byId(data.units, unitId, factionId) : undefined;
    return unit
      ? {
          factionId: unit.raw.faction_id ?? factionId,
          unitId: unit.id,
          models: unit.raw.model_count?.min ?? 1,
        }
      : { factionId, unitId: null, models: 1 };
  });

  const [sit, setSit] = useState<CrunchSituation>(DEFAULT_SITUATION);
  const [phaseTouched, setPhaseTouched] = useState(false);
  const [leverState, setLeverState] = useState<Record<string, boolean>>({});
  const [manualState, setManualState] = useState<Record<string, boolean>>({});

  // Played factions first so the common picks sit on top of the long list.
  const factionOptions = useMemo(() => {
    const played = new Set(EXPLORE_FACTION_IDS ?? []);
    return [...data.factions.all]
      .sort(
        (a, b) =>
          (played.has(b.id) ? 1 : 0) - (played.has(a.id) ? 1 : 0) ||
          a.name.localeCompare(b.name),
      )
      .map((f) => ({ value: f.id, label: f.name }));
  }, [data]);

  const unitOptionsFor = (factionId: string | null) =>
    factionId
      ? data.units
          .byFaction(factionId)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((u) => ({
            value: u.id,
            label: u.name,
            detail: u.raw.points?.[0] ? `${u.raw.points[0].cost} pts` : undefined,
          }))
      : [];

  const atkUnit = atk.unitId ? byId(data.units, atk.unitId, atk.factionId) : undefined;
  const leaderUnit = atk.leaderId ? byId(data.units, atk.leaderId, atk.factionId) : undefined;
  const defUnit = def.unitId ? byId(data.units, def.unitId, def.factionId) : undefined;

  const pickAttackerUnit = (unitId: string | null) =>
    setAtk((s) => {
      if (!unitId) return { ...s, unitId: null, counts: {}, leaderId: null };
      const unit = byId(data.units, unitId, s.factionId);
      if (!unit) return s;
      const models = unit.raw.model_count?.min ?? 1;
      return { ...s, unitId, models, counts: baseCounts(data, unit.raw, models), leaderId: null };
    });

  // Resizing resets the loadout to the new size's base — weapon edits don't
  // survive a size change (the base set itself changes shape with size).
  const setAttackerModels = (models: number) =>
    setAtk((s) => {
      const unit = s.unitId ? byId(data.units, s.unitId, s.factionId) : undefined;
      return unit ? { ...s, models, counts: baseCounts(data, unit.raw, models) } : s;
    });

  // The editable loadout rows: every weapon the unit can field, stepper-bound
  // by the package's loadout maths. Units without authored loadout data get
  // free 0..models steppers instead of hard-locked ones.
  const loadout = useMemo(() => {
    if (!atkUnit) return null;
    const raw = atkUnit.raw;
    const missing = loadoutDataMissing(data, raw);
    const { options, models: rows } = loadoutCtx(data, raw);
    const bounds = missing ? null : data.weaponBounds(raw, atk.models, options, rows);
    const ids = new Set<string>([...Object.keys(atk.counts), ...(bounds ? bounds.keys() : [])]);
    const weaponRows = [...ids]
      .flatMap((id) => {
        const weapon = byId(data.weapons, id, atk.factionId);
        if (!weapon) return []; // non-weapon wargear — nothing to crunch
        const b = bounds?.get(id);
        const count = atk.counts[id] ?? 0;
        return [
          {
            id,
            name: weapon.name,
            count,
            min: b?.min ?? 0,
            max: b?.max ?? Math.max(atk.models, count),
          },
        ];
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    return { missing, rows: weaponRows };
  }, [data, atkUnit, atk.models, atk.counts, atk.factionId]);

  const leaderOptions = useMemo(
    () =>
      atkUnit
        ? data.dataset.leadersAttachableTo(atkUnit.id).map((u) => ({
            value: u.id,
            label: u.name,
            detail: u.raw.points?.[0] ? `${u.raw.points[0].cost} pts` : undefined,
          }))
        : [],
    [data, atkUnit],
  );

  const detachmentOptions = useMemo(
    () =>
      atk.factionId
        ? data.detachments
            .byFaction(atk.factionId)
            .map((d) => ({ value: d.id, label: d.name }))
            .sort((a, b) => a.label.localeCompare(b.label))
        : [],
    [data, atk.factionId],
  );

  // The combined unit: the squad plus its attached leader (at the leader's
  // minimum size, out-of-the-box loadout).
  const members = useMemo<CrunchMember[]>(() => {
    if (!atkUnit) return [];
    const out = [
      memberFromCounts(
        data,
        atkUnit.id,
        atkUnit.name,
        new Map(Object.entries(atk.counts)),
        atk.factionId,
      ),
    ];
    if (leaderUnit) {
      const lModels = leaderUnit.raw.model_count?.min ?? 1;
      out.push(
        memberFromCounts(
          data,
          leaderUnit.id,
          leaderUnit.name,
          new Map(Object.entries(baseCounts(data, leaderUnit.raw, lModels))),
          atk.factionId,
        ),
      );
    }
    return out;
  }, [data, atkUnit, leaderUnit, atk.counts, atk.factionId]);

  const hasPhase = useMemo(() => {
    const check = (wantMelee: boolean) =>
      members.some((m) =>
        m.lines.some((line) => {
          const w = byId(data.weapons, line.weaponId, atk.factionId);
          return w?.raw.profiles.some((p) => data.isMeleeProfile(p) === wantMelee);
        }),
      );
    return { shooting: check(false), fight: check(true) };
  }, [data, members, atk.factionId]);

  // A melee-only unit (or one with no guns) opens on the phase it can play.
  const phase: CrunchPhase = phaseTouched ? sit.phase : hasPhase.shooting ? "shooting" : "fight";
  const situation = { ...sit, phase };

  const ctx = useMemo(
    () => engineContext(data, members, atk.factionId, situation),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, members, atk.factionId, phase, sit.withinHalfRange, sit.stationary, sit.charged, sit.targetInCover],
  );

  const levers = useMemo(
    () => crunchLevers(data, members, atk.factionId, atk.detachmentId ?? undefined, ctx),
    [data, members, atk.factionId, atk.detachmentId, ctx],
  );

  const chosenBuffs = useMemo(() => {
    const fromLevers = levers.buffs
      .filter((l) => leverState[l.id] ?? l.enabled)
      .flatMap((l) => l.buffs);
    const fromManual = MANUAL_TOGGLES.filter((t) => manualState[t.id]).map((t) => t.buff);
    return [...fromLevers, ...fromManual];
  }, [levers, leverState, manualState]);

  const benchmarkResults = useMemo(() => {
    if (defMode !== "benchmarks" || members.length === 0) return [];
    return standardTargets(data).map((target) =>
      unitOutput(data, members, atk.factionId, chosenBuffs, ctx, target),
    );
  }, [data, defMode, members, atk.factionId, chosenBuffs, ctx]);

  const duelResult = useMemo(() => {
    if (defMode !== "unit" || members.length === 0 || !defUnit) return null;
    return unitOutput(
      data,
      members,
      atk.factionId,
      chosenBuffs,
      ctx,
      targetFromUnit(defUnit, def.models),
    );
  }, [data, defMode, members, atk.factionId, chosenBuffs, ctx, defUnit, def.models]);

  const attackerPoints = useMemo(() => {
    if (!atkUnit) return null;
    const main = unitPoints(data, atkUnit.raw, atk.models);
    if (main == null) return null;
    const leader = leaderUnit
      ? unitPoints(data, leaderUnit.raw, leaderUnit.raw.model_count?.min ?? 1)
      : 0;
    return leader == null ? null : main + leader;
  }, [data, atkUnit, atk.models, leaderUnit]);

  const chip = crunchChip;
  const atkMin = atkUnit?.raw.model_count?.min ?? 1;
  const atkMax = atkUnit?.raw.model_count?.max ?? atkMin;
  const defMin = defUnit?.raw.model_count?.min ?? 1;
  const defMax = defUnit?.raw.model_count?.max ?? defMin;
  const defStats = defUnit?.raw.profiles[0];

  return (
    <div className="space-y-3">
      <div className="sticky top-12 z-10 -mx-3 border-b border-edge bg-surface/95 px-3 py-1.5 backdrop-blur">
        <h1 className="text-base font-bold leading-tight">💥 Crunch lab</h1>
        <p className="text-[11px] text-ink-faint">
          Load an attacker and a defender, read the expected damage.
        </p>
      </div>

      <div className="space-y-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0">
        {/* ————— Attacker ————— */}
        <section className="space-y-2 rounded-lg border border-edge p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
            ⚔ Attacker
          </p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            <Dropdown
              value={atk.factionId}
              options={factionOptions}
              onChange={(factionId) =>
                setAtk((s) => ({
                  ...s,
                  factionId,
                  unitId: null,
                  counts: {},
                  leaderId: null,
                  detachmentId: null,
                }))
              }
              placeholder="Faction…"
              searchable
            />
            <Dropdown
              value={atk.unitId}
              options={unitOptionsFor(atk.factionId)}
              onChange={pickAttackerUnit}
              placeholder="Unit…"
              searchable
            />
          </div>

          {atkUnit && (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {atkMax > atkMin ? (
                  <Stepper
                    label="models"
                    value={atk.models}
                    min={atkMin}
                    max={atkMax}
                    onChange={setAttackerModels}
                  />
                ) : (
                  <span className="text-xs text-ink-dim">
                    {atk.models} model{atk.models === 1 ? "" : "s"}
                  </span>
                )}
                <span className="ml-auto text-xs tabular-nums text-ink-faint">
                  {attackerPoints != null ? `${attackerPoints} pts` : "pts unknown"}
                </span>
              </div>

              {(leaderOptions.length > 0 || detachmentOptions.length > 0) && (
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {leaderOptions.length > 0 && (
                    <Dropdown
                      value={atk.leaderId}
                      options={leaderOptions}
                      onChange={(leaderId) => setAtk((s) => ({ ...s, leaderId }))}
                      placeholder="No attached leader"
                      clearable
                    />
                  )}
                  {detachmentOptions.length > 0 && (
                    <Dropdown
                      value={atk.detachmentId}
                      options={detachmentOptions}
                      onChange={(detachmentId) => setAtk((s) => ({ ...s, detachmentId }))}
                      placeholder="No detachment"
                      clearable
                    />
                  )}
                </div>
              )}

              {loadout && loadout.rows.length > 0 && (
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                    Loadout
                  </p>
                  <div className="space-y-1">
                    {loadout.rows.map((row) => (
                      <div key={row.id} className="flex items-center gap-2 text-xs">
                        <span className="min-w-0 flex-1 truncate text-ink-dim">{row.name}</span>
                        <Stepper
                          value={row.count}
                          min={row.min}
                          max={row.max}
                          onChange={(next) =>
                            setAtk((s) => ({ ...s, counts: { ...s.counts, [row.id]: next } }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                  {loadout.missing && (
                    <p className="mt-1 text-[10px] italic text-ink-faint">
                      No loadout data for this unit — counts are unclamped.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </section>

        {/* ————— Defender ————— */}
        <section className="space-y-2 rounded-lg border border-edge p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
            🛡 Defender
          </p>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setDefMode("benchmarks")}
              className={chip(defMode === "benchmarks")}
            >
              Benchmark targets
            </button>
            <button
              type="button"
              onClick={() => setDefMode("unit")}
              className={chip(defMode === "unit")}
            >
              Pick a datasheet
            </button>
          </div>

          {defMode === "benchmarks" && (
            <p className="text-[11px] leading-snug text-ink-faint">
              GEQ / MEQ / TEQ / vehicle / knight reference profiles — the classic sweep. Switch to
              a datasheet to duel a specific unit.
            </p>
          )}

          {defMode === "unit" && (
            <>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                <Dropdown
                  value={def.factionId}
                  options={factionOptions}
                  onChange={(factionId) => setDef({ factionId, unitId: null, models: 1 })}
                  placeholder="Faction…"
                  searchable
                />
                <Dropdown
                  value={def.unitId}
                  options={unitOptionsFor(def.factionId)}
                  onChange={(unitId) =>
                    setDef((s) => {
                      if (!unitId) return { ...s, unitId: null };
                      const unit = byId(data.units, unitId, s.factionId);
                      return {
                        ...s,
                        unitId,
                        models: unit?.raw.model_count?.min ?? 1,
                      };
                    })
                  }
                  placeholder="Unit…"
                  searchable
                />
              </div>
              {defUnit && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  {defMax > defMin ? (
                    <Stepper
                      label="models"
                      value={def.models}
                      min={defMin}
                      max={defMax}
                      onChange={(models) => setDef((s) => ({ ...s, models }))}
                    />
                  ) : (
                    <span className="text-xs text-ink-dim">
                      {def.models} model{def.models === 1 ? "" : "s"}
                    </span>
                  )}
                  {defStats && (
                    <span className="ml-auto">
                      <MicroStats
                        profile={defStats}
                        fnp={fnpFromAbilityNames(defUnit.abilities.map((a) => a.name))}
                      />
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {!atkUnit && (
        <p className="py-8 text-center text-sm text-ink-dim">
          Pick an attacker to start crunching.
        </p>
      )}

      {atkUnit && (hasPhase.shooting || hasPhase.fight) && (
        <>
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
            {leaderUnit && (
              <span className="ml-auto text-[11px] text-ink-faint">incl. {leaderUnit.name}</span>
            )}
          </div>

          {levers.buffs.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                Abilities &amp; stratagems
              </p>
              <div className="flex flex-wrap gap-1.5">
                {levers.buffs.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() =>
                      setLeverState((s) => ({ ...s, [l.id]: !(s[l.id] ?? l.enabled) }))
                    }
                    className={chip(leverState[l.id] ?? l.enabled)}
                    title={l.label}
                  >
                    {l.enabled && (
                      <span className="mr-1 opacity-70">
                        {(leverState[l.id] ?? l.enabled) ? "✓" : "✗"}
                      </span>
                    )}
                    {l.label}
                  </button>
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

          {defMode === "benchmarks" && benchmarkResults.length > 0 && (
            <TargetTable results={benchmarkResults} />
          )}

          {defMode === "unit" && !defUnit && (
            <p className="py-6 text-center text-sm text-ink-dim">Pick a defender datasheet.</p>
          )}
          {defMode === "unit" && duelResult && (
            <DuelResult
              data={data}
              result={duelResult}
              defUnit={defUnit!.raw}
              attackerPoints={attackerPoints}
            />
          )}

          <p className="text-[10px] leading-snug text-ink-faint">
            Expected values, all weapons in range. Always-on abilities are pre-applied — flip
            chips to layer stratagems and buffs. The defender's own defensive abilities (FNP,
            save mods) apply automatically. Kills cap at the target's model count.
          </p>
        </>
      )}
    </div>
  );
}

/** −/+ count stepper with clamped range. */
function Stepper({
  value,
  min,
  max,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  label?: string;
}) {
  const btn =
    "flex h-7 w-7 items-center justify-center rounded-md border border-edge bg-panel text-sm " +
    "disabled:opacity-30 hover:bg-surface active:bg-surface";
  return (
    <span className="flex items-center gap-1.5">
      <button
        type="button"
        aria-label="Fewer"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className={btn}
      >
        −
      </button>
      <span className="min-w-6 text-center text-sm font-semibold tabular-nums">{value}</span>
      <button
        type="button"
        aria-label="More"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className={btn}
      >
        +
      </button>
      {label && <span className="text-xs text-ink-faint">{label}</span>}
    </span>
  );
}

/**
 * The duel readout for a picked defender: headline tiles (damage, slain,
 * survivors, points trade), the attack-sequence flow, and the per-weapon
 * stage table.
 */
function DuelResult({
  data,
  result,
  defUnit,
  attackerPoints,
}: {
  data: Data40k;
  result: TargetOutput;
  defUnit: Unit;
  attackerPoints: number | null;
}) {
  const target = result.target;
  const stats = target.unitRaw.profiles[0];
  const wounds = Number(stats?.W) || 1;
  const totalWounds = wounds * target.modelCount;
  const modelsLeft = Math.max(0, target.modelCount - result.kills);
  const woundsLeft = Math.max(0, totalWounds - result.damage);
  const pct = target.modelCount > 0 ? Math.min(1, result.kills / target.modelCount) : 0;
  const wiped = pct >= 1;

  const defPoints = unitPoints(data, defUnit, target.modelCount);
  const killedPoints = defPoints != null ? defPoints * pct : null;

  const fmt = (n: number, dp = 1) => n.toFixed(dp);

  return (
    <section className="space-y-2.5 rounded-lg border border-edge p-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h2 className="text-sm font-bold">
          vs {target.modelCount}× {target.profileName}
        </h2>
        <span className="text-xs text-ink-faint">
          T{String(stats?.T ?? "—")} · W{String(stats?.W ?? "—")} · Sv {saveLabel(stats)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        <Tile label="damage" value={fmt(result.damage)} sub={`of ${totalWounds} wounds`} />
        <Tile
          label="models slain"
          value={fmt(result.kills, result.kills >= 10 ? 1 : 2)}
          sub={wiped ? "unit destroyed" : `of ${target.modelCount} (${Math.round(pct * 100)}%)`}
          accent
        />
        <Tile
          label="left standing"
          value={wiped ? "0" : `≈${fmt(modelsLeft)}`}
          sub={wiped ? "—" : `${fmt(woundsLeft)} wounds`}
        />
        <Tile
          label="points killed"
          value={killedPoints != null ? `≈${Math.round(killedPoints)}` : "—"}
          sub={
            attackerPoints != null && killedPoints != null
              ? `per ${attackerPoints} pts spent`
              : "pts unknown"
          }
        />
      </div>

      {/* Kill-fraction bar: how much of the defender unit evaporates. */}
      <div className="h-1.5 overflow-hidden rounded-full bg-panel">
        <div
          className="h-full rounded-full bg-accent transition-[width]"
          style={{ width: `${Math.round(pct * 100)}%` }}
        />
      </div>

      <FlowStrip flow={result.flow} kills={result.kills} />
      <WeaponBreakdown weapons={result.weapons} />
    </section>
  );
}

function Tile({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-md bg-panel px-2 py-1.5">
      <p className="text-[9px] font-semibold uppercase tracking-wide text-ink-faint">{label}</p>
      <p className={`text-lg font-bold leading-tight tabular-nums ${accent ? "text-accent" : ""}`}>
        {value}
      </p>
      {sub && <p className="text-[10px] leading-snug text-ink-faint">{sub}</p>}
    </div>
  );
}
