/**
 * Structural corrections to upstream 40kdc-data records, applied before the
 * codex overlay (so a hand-authored codex patch of the same sheet still wins).
 * Ids, caps and DSL shape — never GW rules prose (enhancement text below is
 * our own paraphrase). Each fix should also be reported upstream; delete it
 * once a data bump ships the correction.
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
type AbilityRecord = RawData["abilities"][number];
type Effect = AbilityRecord["effect"];

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
    defaults: [
      "storm-bolter-paladin-squad",
      "nemesis-force-weapon-paladin-squad",
    ],
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
    defaults: [
      "storm-bolter",
      "nemesis-force-weapon-brotherhood-terminator-squad",
    ],
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
export function fixedModelAliases(
  unitId: string,
  factionId: string | null,
): string[] {
  return (
    SQUADS.find((f) => f.unitId === unitId && f.factionId === factionId)
      ?.aliases ?? []
  );
}

/**
 * Enhancements and stratagems upstream ships with no linked ability (every
 * Grey Knights one, as of v1.4.5), so the app showed no rules text. Each gets
 * an ability record carrying paraphrased `leak_text` (which `abilityText()`
 * prefers) and, where the DSL can express it, a real effect for the damage
 * cruncher. Keyed by enhancement / stratagem id.
 */
const RULE_TEXT: Record<string, { text: string; effect?: Effect }> = {
  "sixty-sixth-seal-banishers": {
    text:
      "GREY KNIGHTS model only. In your Shooting phase, attacks made by models in " +
      "the bearer's unit get +1 to their Armour Penetration (e.g. AP -1 becomes AP -2).",
    effect: {
      type: "conditional",
      condition: { type: "phase-is", parameters: { phase: "shooting" } },
      effect: {
        type: "stat-modifier",
        target: "unit",
        modifier: { stat: "AP", operation: "add", value: -1 },
      },
    } as Effect,
  },
  "sigil-of-the-hunt-banishers": {
    text:
      "GREY KNIGHTS model only. In your Shooting phase, models in the bearer's unit " +
      "can re-roll Hit rolls of 1.",
    effect: {
      type: "conditional",
      condition: { type: "phase-is", parameters: { phase: "shooting" } },
      effect: {
        type: "re-roll",
        target: "unit",
        modifier: { roll: "hit", subset: "ones" },
      },
    } as Effect,
  },
  "ephemeral-tome-banishers": {
    text:
      "GREY KNIGHTS INFANTRY model only. At the start of your Shooting phase, if the " +
      "bearer's unit is not within Engagement Range of any enemy units, the bearer can " +
      "use this Enhancement: its unit makes a Normal move of up to D6\", and can't " +
      "declare a charge for the rest of the turn.",
  },
  "pyresoul-psychic-banishers": {
    text:
      "GREY KNIGHTS model only. At the start of your Shooting phase, the bearer can use " +
      'this Enhancement: pick one enemy unit within 24" that the bearer can see; it ' +
      "suffers D3 mortal wounds.",
  },
  "vigilance-of-titan-argent-assault": {
    text:
      "TERMINATOR model only. At the start of your Shooting phase, you can pick one " +
      'visible enemy unit within 12" of the bearer. That enemy ' +
      'unit has +6" detection range.',
  },
  "psychic-celerity-argent-assault": {
    text: "TERMINATOR model only. The bearer's unit adds 1 to its Charge rolls.",
    effect: {
      type: "roll-modifier",
      target: "unit",
      modifier: { roll: "charge", operation: "add", value: 1 },
    } as Effect,
  },
  "hexwrought-reprisal-banishers": {
    text:
      "When: End of any phase.\n" +
      "Target: One GREY KNIGHTS PSYKER unit from your army on the battlefield that suffered one or more mortal wounds this phase.\n" +
      "Effect: Pick one enemy unit that inflicted mortal wounds on your unit this phase. Roll one D6 per mortal wound your unit suffered this phase; for each 2+, that enemy unit suffers 1 mortal wound (max 6). These mortal wounds count as Psychic Attacks.",
  },
  "warding-chant-banishers": {
    text:
      "When: Your opponent's Shooting phase or the Fight phase, just after an enemy unit selects its targets.\n" +
      "Target: One GREY KNIGHTS PSYKER unit from your army that was picked as a target of one or more of those attacks.\n" +
      "Effect: Until the end of the phase, models in your unit have Feel No Pain 5+ against attacks with an unmodified Damage of 1.",
  },
  "chaos-bane-banishers": {
    text:
      "When: Your Shooting phase.\n" +
      "Target: One GREY KNIGHTS PSYKER unit from your army that hasn't been selected to shoot this phase.\n" +
      "Effect: Until the end of the phase, ranged weapons equipped by models in your unit gain [ANTI-CHAOS 4+].",
  },
  "celerity-banishers": {
    text:
      "When: Your Charge phase.\n" +
      "Target: One GREY KNIGHTS PSYKER INFANTRY unit from your army.\n" +
      "Effect: Until the end of the turn, your unit can declare a charge even though it Advanced this turn.",
  },
  "circle-of-sanctuary-banishers": {
    text:
      "When: Start of your opponent's Movement phase.\n" +
      "Target: One GREY KNIGHTS CHARACTER model from your army.\n" +
      "Effect: Until the end of the phase, enemy units set up as Reinforcements can't be set up within 12\" horizontally of your model.",
  },
  "shadow-of-anarch-banishers": {
    text:
      "When: Your opponent's Movement phase, just after an enemy unit ends a Normal, Advance or Fall Back move.\n" +
      'Target: One GREY KNIGHTS PSYKER unit from your army within 8" of that enemy unit and not within Engagement Range of any enemy units.\n' +
      'Effect: Your unit can make a Normal move of up to 6", or, if it has Deep Strike, it can be placed into Strategic Reserves.',
  },
  "truesilver-aegis-argent-assault": {
    text:
      "When: Any phase, when a friendly PALADIN SQUAD unit suffers a mortal wound.\n" +
      "Target: That PALADIN SQUAD unit.\n" +
      "Effect: The unit has Feel No Pain 4+ against mortal wounds.",
  },
  "a-threat-ended-argent-assault": {
    text:
      "When: Fight phase, as a friendly PALADIN SQUAD unit is selected to fight.\n" +
      "Target: That PALADIN SQUAD unit.\n" +
      "Effect: The unit's melee attacks gain [PRECISION].",
  },
  "aura-of-vengeance-argent-assault": {
    text:
      "When: Fight phase, as an enemy unit selects a friendly PALADIN SQUAD unit as a target.\n" +
      "Target: That PALADIN SQUAD unit.\n" +
      "Effect: The attacking enemy unit's melee attacks gain [HAZARDOUS].",
  },
};

/**
 * Rewordings of upstream abilities whose DSL is right but renders clumsily
 * (the structured effect stays, so the cruncher still applies it). Keyed by
 * ability id; paraphrased prose.
 */
const ABILITY_TEXT: Record<string, string> = {
  "dauntless-champions":
    "Each time a friendly PALADIN SQUAD unit is selected to fight, until it has " +
    "resolved its attacks: if an attack's Strength is lower than the target's " +
    "Toughness, add 1 to that attack's Wound roll.",
  "channelled-force":
    "Each time a GREY KNIGHTS unit from your army is selected to fight, it can take " +
    "a Leadership test. If it passes, pick one of these; until the end of the phase, " +
    "the unit's melee weapons that have [PSYCHIC] also gain it:\n" +
    "• [SUSTAINED HITS 1]\n" +
    "• [LETHAL HITS]",
};

/**
 * Sanctic Hood (Brotherhood Librarian) is Feel No Pain 4+ against Psychic
 * Attacks only; upstream drops the scope, so it read (and crunched) as a
 * blanket 4+ FNP.
 */
const PSYCHIC_ONLY_FNP = ["sanctic-hood"];

function scopeFnpToPsychic(effect: Effect): Effect {
  const e = effect as {
    type?: string;
    effect?: Effect;
    modifier?: Record<string, unknown>;
  };
  if (e.type === "conditional" && e.effect)
    return { ...e, effect: scopeFnpToPsychic(e.effect) } as Effect;
  if (e.type === "feel-no-pain" && e.modifier && !e.modifier.scope)
    return { ...e, modifier: { ...e.modifier, scope: "psychic" } } as Effect;
  return effect;
}

function applyAbilityFixes(raw: RawData): boolean {
  let changed = false;
  raw.abilities = raw.abilities.map((a) => {
    const text = ABILITY_TEXT[a.ability_id];
    if (!text) return a;
    changed = true;
    return { ...a, leak_text: text } as AbilityRecord;
  });
  raw.abilities = raw.abilities.map((a) => {
    if (!PSYCHIC_ONLY_FNP.includes(a.ability_id)) return a;
    const effect = scopeFnpToPsychic(a.effect);
    if (effect === a.effect) return a;
    changed = true;
    return { ...a, effect };
  });
  const link = <
    T extends {
      id: string;
      name: string;
      detachment_id?: string | null;
      ability_id?: string | null;
      game_version: AbilityRecord["game_version"];
    },
  >(
    rec: T,
    abilityType: string,
  ): T => {
    const fix = RULE_TEXT[rec.id];
    if (!fix || rec.ability_id) return rec; // upstream linked one — defer to it
    const det = raw.detachments.find((d) => d.id === rec.detachment_id);
    const record = {
      ability_id: rec.id,
      name: rec.name,
      authored_by: "app-data-fix",
      ability_type: abilityType,
      effect: fix.effect ?? ({ type: "rule-state", target: "self" } as Effect),
      scope: { range: "unit", duration: "permanent" },
      game_version: rec.game_version,
      faction_id: det?.faction_id,
      detachment_id: rec.detachment_id,
      leak_text: fix.text,
    } as AbilityRecord;
    raw.abilities = [
      ...raw.abilities.filter((a) => a.ability_id !== rec.id),
      record,
    ];
    changed = true;
    return { ...rec, ability_id: rec.id };
  };
  raw.enhancements = raw.enhancements.map((e) => link(e, "enhancement"));
  raw.stratagems = raw.stratagems.map((s) => link(s, "stratagem"));
  return changed;
}

/** Apply every fix whose records are present; returns true when anything changed. */
export function applyDataFixes(raw: RawData): boolean {
  let changed = applyAbilityFixes(raw);
  for (const fix of SQUADS) {
    const comp = raw.unitCompositions.find(
      (c) => c.unit_id === fix.unitId && c.faction_id === fix.factionId,
    );
    const template = raw.wargearOptions.find(
      (o) => o.unit_id === fix.unitId && o.faction_id === fix.factionId,
    );
    const unit = raw.units.find(
      (u) => u.id === fix.unitId && u.faction_id === fix.factionId,
    );
    if (!comp || !template || !unit) continue;
    const ids = new Set([
      ...(unit.weapon_ids ?? []),
      ...raw.wargear.map((w) => w.id),
    ]);
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
      body: Pick<
        WargearOption,
        "replaces" | "replacement" | "replacement_choice"
      >,
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
          {
            replaces: [sb],
            replacement_choice: fix.guns.map((g) => [g]) as never,
          },
          { per_n_models: 5 },
        ),
      ),
      opt(
        "narthecium",
        { replaces: [sb], replacement: [NARTHECIUM] },
        { max_count: 1 },
      ),
      opt(
        "ancient",
        {
          replaces: [sb],
          replacement_choice: [
            ...fix.guns.map((g) => [g, BANNER]),
            [sb, BANNER],
          ] as never,
        },
        { max_count: 1 },
      ),
    ];

    raw.unitCompositions = raw.unitCompositions.map((c) =>
      c === comp ? fixedComp : c,
    );
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
