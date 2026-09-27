/**
 * Structural corrections to upstream 40kdc-data records, applied before the
 * codex overlay (so a hand-authored codex patch of the same sheet still wins).
 * Ids and caps only — never rules prose. Each fix should also be reported
 * upstream; delete it once a data bump ships the correction.
 *
 * Grey Knights Paladin / Brotherhood Terminator squads (checked against the
 * GW app, Sep 2026): upstream models the Ancient as a separate 0-1 model row
 * the loadout allocator never fills (so the banner swap caps at 0 and the
 * other swaps spill onto the whole squad), and lumps the narthecium in with
 * the per-5-models guns as "any number". The datasheet actually reads: 1
 * leader + 3-9 troopers; per 5 models N troopers swap storm bolter for a
 * special gun (N = 2 Paladins / 1 Terminator); 1 trooper takes a narthecium;
 * 1 trooper becomes the Ancient (banner + gun, or banner keeping the bolter).
 */
import type { RawData, WargearOption } from "@alpaca-software/40kdc-data";

type CompositionModel = RawData["unitCompositions"][number]["models"][number];

interface SquadFix {
  factionId: string;
  unitId: string;
  leader: string;
  trooper: string;
  defaults: string[];
  stormBolter: string;
  guns: [string, string, string];
  /** Special-gun swaps allowed per 5 models. */
  gunsPer5: number;
  /** Model names the GW app uses that are now plain troopers (import aliases). */
  aliases: string[];
}

const NARTHECIUM = "apothecarys-narthecium";
const BANNER = "ancients-banner";

const SQUADS: SquadFix[] = [
  {
    factionId: "grey-knights",
    unitId: "paladin-squad",
    leader: "Paragon",
    trooper: "Paladin",
    defaults: ["storm-bolter-paladin-squad", "nemesis-force-weapon-paladin-squad"],
    stormBolter: "storm-bolter-paladin-squad",
    guns: ["incinerator", "psilencer", "psycannon"],
    gunsPer5: 2,
    aliases: ["Paladin Ancient"],
  },
  {
    factionId: "grey-knights",
    unitId: "brotherhood-terminator-squad",
    leader: "Justicar",
    trooper: "Terminator",
    defaults: ["storm-bolter", "nemesis-force-weapon-brotherhood-terminator-squad"],
    stormBolter: "storm-bolter",
    guns: [
      "incinerator",
      "psilencer-brotherhood-terminator-squad",
      "psycannon-brotherhood-terminator-squad",
    ],
    gunsPer5: 1,
    aliases: ["Ancient"],
  },
];

/**
 * Extra names that identify a model-group header (not a weapon) on an
 * imported unit — the GW app still prints the retired "Ancient" rows.
 */
export function fixedModelAliases(unitId: string, factionId: string | null): string[] {
  return SQUADS.find((f) => f.unitId === unitId && f.factionId === factionId)?.aliases ?? [];
}

/** Apply every fix whose records are present; returns true when anything changed. */
export function applyDataFixes(raw: RawData): boolean {
  let changed = false;
  for (const fix of SQUADS) {
    const comp = raw.unitCompositions.find(
      (c) => c.unit_id === fix.unitId && c.faction_id === fix.factionId,
    );
    const template = raw.wargearOptions.find(
      (o) => o.unit_id === fix.unitId && o.faction_id === fix.factionId,
    );
    const unit = raw.units.find((u) => u.id === fix.unitId && u.faction_id === fix.factionId);
    if (!comp || !template || !unit) continue;
    const ids = new Set([...(unit.weapon_ids ?? []), ...raw.wargear.map((w) => w.id)]);
    const needed = [...fix.defaults, ...fix.guns, NARTHECIUM, BANNER];
    if (!needed.every((id) => ids.has(id))) continue; // upstream reshaped — leave it be

    const leaderRow = comp.models.find((m) => m.name === fix.leader);
    const trooperRow = comp.models.find((m) => m.name === fix.trooper);
    if (!leaderRow || !trooperRow) continue;
    const models: [CompositionModel, ...CompositionModel[]] = [
      { ...leaderRow, min: 1, max: 1, default_weapon_ids: [...fix.defaults] },
      { ...trooperRow, min: 3, max: 9, default_weapon_ids: [...fix.defaults] },
    ];
    const fixedComp = { ...comp, models };

    const opt = (
      suffix: string,
      body: Pick<WargearOption, "replaces" | "replacement" | "replacement_choice">,
      constraint: NonNullable<WargearOption["model_constraint"]>,
    ): WargearOption =>
      ({
        id: `${fix.unitId}-wgo-fix-${suffix}`,
        unit_id: fix.unitId,
        faction_id: fix.factionId,
        game_version: template.game_version,
        is_free: true,
        ...body,
        model_constraint: { model_name: fix.trooper, ...constraint },
      }) as WargearOption;
    const sb = fix.stormBolter;
    const options: WargearOption[] = [
      // "N per 5 models" = N identical per-5 records; the editor merges them.
      ...Array.from({ length: fix.gunsPer5 }, (_, n) =>
        opt(
          `guns-${n + 1}`,
          { replaces: [sb], replacement_choice: fix.guns.map((g) => [g]) as never },
          { per_n_models: 5 },
        ),
      ),
      opt("narthecium", { replaces: [sb], replacement: [NARTHECIUM] }, { max_count: 1 }),
      opt(
        "ancient",
        {
          replaces: [sb],
          replacement_choice: [...fix.guns.map((g) => [g, BANNER]), [sb, BANNER]] as never,
        },
        { max_count: 1 },
      ),
    ];

    raw.unitCompositions = raw.unitCompositions.map((c) => (c === comp ? fixedComp : c));
    raw.wargearOptions = [
      ...raw.wargearOptions.filter(
        (o) => !(o.unit_id === fix.unitId && o.faction_id === fix.factionId),
      ),
      ...options,
    ];
    changed = true;
  }
  return changed;
}
