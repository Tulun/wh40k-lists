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
const EYE_OF_THE_AUGURIUM =
  "GREY KNIGHTS model only. The bearer's unit can be targeted with the Heroic " +
  "Intervention Stratagem even if another unit has already used it this phase. If it " +
  "is, that use costs 1CP less and doesn't stop other units using that Stratagem this phase.";

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
  // Faction Pack v1.2 (Sep 30 2026) Rules Updates, as amended.
  "one-foot-in-the-future-augurium-task-force": {
    text:
      "GREY KNIGHTS model only. When the bearer's unit ends an ingress move, it can use " +
      'this Enhancement: the unit can make a normal move of up to D6", and can\'t ' +
      "declare a charge for the rest of the turn.",
  },
  "eye-of-the-augurium-hallowed-conclave": {
    text: EYE_OF_THE_AUGURIUM,
  },
  "eye-of-the-augurim-hallowed-conclave": {
    text: EYE_OF_THE_AUGURIUM,
  },
  "sigil-of-exigence-sanctic-spearhead": {
    text:
      "GREY KNIGHTS model only. Once per battle, in your opponent's Shooting phase, when " +
      "the bearer's unit is picked as the target of a ranged attack, you can remove the " +
      "unit and set it back up anywhere on the battlefield more than 8\" horizontally " +
      "from every enemy unit. If it is no longer an eligible target, your opponent can " +
      "pick new targets for any attacks aimed at it. (Usable in your opponent's first turn.)",
  },
  "aggressive-anticipation-augurium-task-force": {
    text:
      "When: Your Shooting phase or the Fight phase.\n" +
      "Target: One GREY KNIGHTS PSYKER unit from your army that hasn't been selected to shoot or fight this phase.\n" +
      "Effect: Your unit's attacks can re-roll Hit rolls.",
  },
  "combat-manifestation-brotherhood-strike": {
    text:
      "When: Your Movement phase.\n" +
      "Target: One GREY KNIGHTS unit from your army arriving via Deep Strike this phase.\n" +
      'Effect: Set your unit up anywhere on the battlefield more than 6" horizontally from ' +
      "every enemy unit; until the end of the turn it can't declare a charge.",
  },
  "precognitive-strategies-hallowed-conclave": {
    text:
      "When: Your opponent's Movement phase, just after an enemy unit ends a Normal, Advance or Fall Back move.\n" +
      'Target: One GREY KNIGHTS INFANTRY unit from your army within 8" of that enemy unit and not within Engagement Range of any enemy units.\n' +
      'Effect: Your unit can make a Normal move of up to D6".',
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
 * faction, then ability id — ids are shared across factions (Truesilver
 * Aegis, Ancient's Banner), so a rewording must not leak. Paraphrased prose.
 */
const ABILITY_TEXT: Record<string, Record<string, string>> = {
  "grey-knights": {
    "champion-of-the-order-of-purifiers-psychic":
      "While this model is leading a unit, Purifying Flame weapons equipped by models in " +
      "that unit get +1 Attacks.",
    "sanctity-of-purpose":
      "Each time a model in this unit makes an attack, re-roll a Wound roll of 1. If the " +
      "target is within range of an objective marker, you can re-roll the Wound roll instead.",
    "foesight-psychic":
      "Each time this model makes an attack that targets a CHARACTER unit, you can re-roll " +
      "the Hit roll.",
    "fire-focus":
      "In your Shooting phase, once this model has shot, pick one enemy unit that any of " +
      "those attacks hit. Until the end of the turn, attacks against that unit made by " +
      "friendly models that disembarked from this TRANSPORT this turn get +1 to their " +
      "Armour Penetration. Each enemy unit can only be picked for this once per turn.",
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
    "gate-of-infinity":
      "If your Army Faction is GREY KNIGHTS: at the end of your opponent's Fight phase, " +
      "you can pick units from your army that are on the battlefield and not within " +
      "Engagement Range of any enemy units, as long as every model in them has this " +
      "ability. How many you can pick depends on battle size:\n\n" +
      "Incursion: up to 2 units\n" +
      "Strike Force: up to 3 units\n" +
      "Onslaught: up to 4 units\n\n" +
      "Put those units into Strategic Reserves. They can make an ingress move in your " +
      "next Movement phase, even if that is your first turn.",
    "force-edge-psychic":
      "Each time a model in this unit makes a melee attack against a unit that isn't a " +
      "MONSTER or VEHICLE, that attack gets +1 to its Armour Penetration (e.g. AP -1 " +
      "becomes AP -2).",
    "righteous-persecution":
      "In your Shooting phase, after this unit has shot, pick one enemy unit (other than " +
      "a MONSTER or VEHICLE) that was hit by one or more of those attacks. That unit is " +
      "pinned until the start of your next turn. While pinned, subtract 2 from its Move " +
      "characteristic and from its Charge rolls.",
    "attuned-onslaught-psychic":
      "Each time this unit makes a Charge move, until the end of the turn, melee weapons " +
      "equipped by PALADIN SQUAD models in this unit get +1 Damage.",
    "ancient-s-banner": "Models in the bearer's unit get +1 Objective Control.",
    "apothecary-s-narthecium":
      "In your Command phase, if the bearer hasn't been destroyed, you can return 1 " +
      "destroyed model (not a CHARACTER) to the bearer's unit.",
    "might-of-titan-psychic":
      "Once per battle, at the start of the Fight phase, this model can use this ability. " +
      "If it does, until the end of the phase, its melee weapons get +3 Attacks and +3 Strength.",
    "warrior-strategist":
      "Once per battle round, one model from your army with this ability can use it when " +
      "its unit is targeted with a Stratagem. If it does, that use of the Stratagem costs " +
      "1CP less.",
    "sanctifying-ritual-psychic":
      "At the end of your Command phase, if this unit is within range of an objective " +
      "marker you control, that objective stays under your control until your opponent's " +
      "Level of Control over it is higher than yours at the end of a phase.",
    "truesilver-aegis-aura":
      'While a friendly GREY KNIGHTS unit is wholly within 6" of this model, models ' +
      "in that unit have Feel No Pain 6+ against mortal wounds.",
  },
};

/**
 * Rewordings of core (faction-less) abilities, keyed by ability id. Fire
 * Overwatch: upstream's note only names snap shooting, so the card spells
 * the shooting type out (core rule 15.09, checked against the GW app Sep
 * 2026 — its hits are no longer Critical Hits). Paraphrased prose.
 */
const CORE_ABILITY_TEXT: Record<string, string> = {
  "fire-overwatch":
    "At the end of your opponent's Movement phase, one friendly unengaged unit " +
    "(excluding TITANIC) shoots using snap shooting.\n" +
    "Snap shooting:\n" +
    '- Target only one visible, eligible enemy unit within 24" of your unit.\n' +
    "- Attacks hit only on an unmodified hit roll of 6, whatever the weapon's " +
    "BS or modifiers, and those hits are not Critical Hits.\n" +
    "- Hit rolls cannot be re-rolled.\n" +
    "- After shooting, your unit cannot start an action until the end of the phase.",
};

/**
 * Structural effect replacements, keyed by ability id. Truesilver Aegis
 * (Grey Knights Rhino) is an aura of FNP 6+ vs mortal wounds for GREY KNIGHTS
 * units; upstream made it a blanket FNP 6+ on the Rhino itself.
 */
const ABILITY_EFFECTS: Record<string, { factionId: string; effect: Effect }> = {
  "truesilver-aegis-aura": {
    factionId: "grey-knights",
    effect: {
      type: "aura",
      target: "friendly-within-aura",
      modifier: {
        range: 6,
        recipient_filter: { required_keywords: ["GREY KNIGHTS"] },
        effect: {
          type: "feel-no-pain",
          target: "unit",
          modifier: { threshold: 6, scope: "mortal" },
        },
      },
    } as Effect,
  },
};

/** Abilities upstream lists on a datasheet that the card doesn't have. */
const UNIT_ABILITY_REMOVALS: {
  factionId: string;
  unitId: string;
  abilityIds: string[];
}[] = [
  { factionId: "grey-knights", unitId: "rhino", abilityIds: ["self-repair"] },
];

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
    const fix = ABILITY_EFFECTS[a.ability_id];
    if (!fix || a.faction_id !== fix.factionId) return a;
    changed = true;
    return { ...a, effect: fix.effect };
  });
  for (const r of UNIT_ABILITY_REMOVALS) {
    raw.units = raw.units.map((u) => {
      if (u.id !== r.unitId || u.faction_id !== r.factionId) return u;
      const ability_ids = (u.ability_ids ?? []).filter(
        (id) => !r.abilityIds.includes(id),
      );
      if (ability_ids.length === (u.ability_ids ?? []).length) return u;
      changed = true;
      return { ...u, ability_ids };
    });
  }
  raw.abilities = raw.abilities.map((a) => {
    const text = a.faction_id
      ? ABILITY_TEXT[a.faction_id]?.[a.ability_id]
      : CORE_ABILITY_TEXT[a.ability_id];
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

/**
 * Grey Knights points per MFM v1.5 (Sep 30 2026) where upstream still ships
 * v1.4: each unit's tier costs in upstream tier order (sizes and ordinal bands
 * are unchanged, only the costs moved). Skipped if upstream reshapes the
 * tiers — then re-check against the MFM rather than guess.
 */
const POINTS: Record<string, Record<string, number[]>> = {
  "grey-knights": {
    "brother-captain": [100],
    "brotherhood-champion": [75],
    "brotherhood-chaplain": [70],
    "brotherhood-librarian": [95, 105],
    "brotherhood-techmarine": [75],
    "brotherhood-terminator-squad": [150, 185, 315, 380],
    "castellan-crowe": [105],
    "grand-master": [100],
    "grand-master-in-nemesis-dreadknight": [210, 225],
    "grand-master-voldus": [130],
    "interceptor-squad": [135, 270, 145, 280],
    "nemesis-dreadknight": [205, 220],
    "paladin-squad": [185, 230, 385, 490, 225, 270, 425, 530],
    "purgation-squad": [115, 230, 125, 240],
    "purifier-squad": [145, 290, 155, 300],
    "strike-squad": [125, 250],
  },
};

/** MFM per-copy wargear surcharges upstream lacks: faction → unit → item → pts. */
const WARGEAR_COSTS: Record<string, Record<string, Record<string, number>>> = {
  "grey-knights": { "stormraven-gunship": { "hurricane-bolter": 10 } },
};

/** Force dispositions per MFM where upstream is behind: faction → detachment. */
const DISPOSITIONS: Record<string, Record<string, string[]>> = {
  "grey-knights": { "warpbane-task-force": ["take-and-hold", "purge-the-foe"] },
};

/**
 * Grey Knights Faction Pack v1.2 (Sep 30 2026) datasheet changes upstream
 * lacks. Weapon stats: faction → overrides matched by weapon name (each
 * character carries its own `storm-bolter-<unit>` copy) or by id, applied
 * to every profile.
 */
const WEAPON_STATS: Record<
  string,
  { names?: string[]; ids?: string[]; stats: { S?: number; AP?: number } }[]
> = {
  "grey-knights": [
    { names: ["Storm bolter"], stats: { S: 5, AP: -1 } },
    { ids: ["close-combat-weapon"], stats: { S: 5 } },
    { ids: ["combi-weapon"], stats: { S: 5, AP: -1 } },
    { ids: ["hurricane-bolter-stormraven-gunship"], stats: { S: 5, AP: -1 } },
  ],
};

/**
 * Weapons one unit must stop sharing because a fix changes only its copy:
 * the pack buffs the Stormraven's hurricane bolter but not the Land Raider
 * Crusader's (both use upstream's `hurricane-bolter`). The clone takes the
 * new id on every record of that unit; `fixedWargearAliases` heals saved lists.
 */
const WEAPON_SPLITS: { factionId: string; unitId: string; from: string; to: string }[] = [
  {
    factionId: "grey-knights",
    unitId: "stormraven-gunship",
    from: "hurricane-bolter",
    to: "hurricane-bolter-stormraven-gunship",
  },
];

/** Saved-list wargear ids a split retired on this unit: old id → new id. */
export function fixedWargearAliases(
  unitId: string,
  factionId: string | null,
): Record<string, string> {
  return Object.fromEntries(
    WEAPON_SPLITS.filter((s) => s.unitId === unitId && s.factionId === factionId).map(
      (s) => [s.from, s.to],
    ),
  );
}

/** Unit profile, keyword and ability changes: faction → unit id. */
const UNIT_FIXES: Record<
  string,
  Record<
    string,
    { T?: number; M?: string; OC?: string; addKeywords?: string[]; removeAbilities?: string[] }
  >
> = {
  "grey-knights": {
    ...Object.fromEntries(
      [
        "brother-captain",
        "brotherhood-chaplain",
        "brotherhood-librarian",
        "brotherhood-terminator-squad",
        "crowes-sanctifiers-brotherhood-terminator-squad",
        "grand-master",
        "grand-master-voldus",
        "paladin-squad",
      ].map((id) => [id, { T: 6 }]),
    ),
    ...Object.fromEntries(
      [
        "brotherhood-champion",
        "brotherhood-techmarine",
        "castellan-crowe",
        "sanctifiers-castellan-crowe",
        // The pack prints "Inceptor Squad"; GK has none — it means Interceptors.
        "interceptor-squad",
        "purgation-squad",
        "purifier-squad",
        "strike-squad",
        "crowes-sanctifiers-strike-squad",
      ].map((id) => [id, { T: 5 }]),
    ),
    "grand-master-in-nemesis-dreadknight": { T: 9 },
    "nemesis-dreadknight": { T: 9 },
    ...Object.fromEntries(
      ["land-raider", "land-raider-crusader", "land-raider-redeemer", "razorback", "rhino"].map(
        (id) => [id, { addKeywords: ["Frame"] }],
      ),
    ),
    ...Object.fromEntries(
      ["stormtalon-gunship", "stormhawk-interceptor"].map((id) => [
        id,
        { M: "-", OC: "-", removeAbilities: ["hover"] },
      ]),
    ),
  },
};

function applyWeaponFixes(raw: RawData): boolean {
  let changed = false;
  for (const split of WEAPON_SPLITS) {
    const src = raw.weapons.find((w) => w.id === split.from && w.faction_id === split.factionId);
    if (!src || raw.weapons.some((w) => w.id === split.to)) continue;
    raw.weapons = [...raw.weapons, { ...src, id: split.to }];
    // Retarget every reference on this unit's own records (weapon_ids,
    // wargear_costs, composition defaults, option swaps) by exact id.
    const swap = <T>(rec: T): T =>
      JSON.parse(JSON.stringify(rec).replaceAll(`"${split.from}"`, `"${split.to}"`));
    const mine = (r: { unit_id?: string; id?: string; faction_id?: string | null }) =>
      (r.unit_id ?? r.id) === split.unitId && r.faction_id === split.factionId;
    raw.units = raw.units.map((u) => (mine(u) ? swap(u) : u));
    raw.unitCompositions = raw.unitCompositions.map((c) => (mine(c) ? swap(c) : c));
    raw.wargearOptions = raw.wargearOptions.map((o) => (mine(o) ? swap(o) : o));
    changed = true;
  }
  raw.weapons = raw.weapons.map((w) => {
    const fixes = (WEAPON_STATS[w.faction_id ?? ""] ?? []).filter(
      (f) => f.names?.includes(w.name) || f.ids?.includes(w.id),
    );
    if (!fixes.length) return w;
    changed = true;
    const stats = Object.assign({}, ...fixes.map((f) => f.stats));
    return {
      ...w,
      profiles: w.profiles.map((p) => ({ ...p, stats: { ...p.stats, ...stats } })),
    } as typeof w;
  });
  return changed;
}

function applyUnitFixes(raw: RawData): boolean {
  let changed = false;
  raw.units = raw.units.map((u) => {
    const fix = UNIT_FIXES[u.faction_id]?.[u.id];
    if (!fix) return u;
    changed = true;
    const stats = Object.fromEntries(
      (["T", "M", "OC"] as const).filter((k) => fix[k] != null).map((k) => [k, fix[k]]),
    );
    const kw = u.keywords ?? [];
    const keywords = [...kw, ...(fix.addKeywords ?? []).filter((k) => !kw.includes(k))];
    const ability_ids = (u.ability_ids ?? []).filter(
      (id) => !fix.removeAbilities?.includes(id),
    );
    return {
      ...u,
      profiles: u.profiles.map((p) => ({ ...p, ...stats })),
      keywords,
      ability_ids,
    } as typeof u;
  });
  return changed;
}

function applyPointsFixes(raw: RawData): boolean {
  let changed = false;
  raw.units = raw.units.map((u) => {
    let next = u;
    const costs = POINTS[u.faction_id]?.[u.id];
    if (costs && u.points?.length === costs.length) {
      next = { ...next, points: u.points.map((p, i) => ({ ...p, cost: costs[i] })) };
    }
    const gear = WARGEAR_COSTS[u.faction_id]?.[u.id];
    if (gear) {
      const kept = (u.wargear_costs ?? []).filter((c) => !(c.item_id in gear));
      const added = Object.entries(gear).map(([item_id, cost]) => ({ item_id, cost }));
      next = { ...next, wargear_costs: [...kept, ...added] } as typeof u;
    }
    if (next !== u) changed = true;
    return next;
  });
  raw.detachments = raw.detachments.map((d) => {
    const dispositions = DISPOSITIONS[d.faction_id]?.[d.id];
    if (!dispositions) return d;
    changed = true;
    return { ...d, force_dispositions: dispositions } as typeof d;
  });
  return changed;
}

/** Apply every fix whose records are present; returns true when anything changed. */
export function applyDataFixes(raw: RawData): boolean {
  let changed = applyAbilityFixes(raw);
  if (applyPointsFixes(raw)) changed = true;
  if (applyWeaponFixes(raw)) changed = true;
  if (applyUnitFixes(raw)) changed = true;
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
