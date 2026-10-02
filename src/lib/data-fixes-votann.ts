/**
 * Leagues of Votann rules text upstream lacks (v1.4.5): almost every
 * detachment stratagem and enhancement ships without a linked ability, and
 * the few that have one render garbled (Materialisation Matrices ends in
 * "?", Brëkkeknots points at a missing record). Paraphrased from the 11e
 * codex wording as amended by Faction Pack v1.1 (22 Jul 2026) — never GW
 * prose verbatim. Keyed by enhancement / stratagem id; `applyDataFixes`
 * links each one and overrides any upstream text.
 */

const unitOnly = (who: string, rest: string) => `${who} model only. ${rest}`;
const LOV = "LEAGUES OF VOTANN";

const fellBack = (who: string) =>
  `When: Your Movement phase, just after a ${who} unit from your army Falls Back.\n` +
  `Target: That ${who} unit.\n` +
  "Effect: Until the end of the turn, the unit can still shoot and declare a charge " +
  "even though it Fell Back.";

const pileIn =
  "When: Fight phase.\n" +
  `Target: One ${LOV} unit from your army that hasn't been selected to fight this phase.\n` +
  'Effect: Until the end of the phase, its models can move up to 6" instead of 3" when ' +
  "they Pile In or Consolidate.";

const reRollOnes = (phase: "Shooting" | "Fight", fullReRoll: "Hit" | "Wound") =>
  `When: ${phase === "Shooting" ? "Your Shooting phase" : "Fight phase"}.\n` +
  `Target: One ${LOV} INFANTRY unit from your army that hasn't been selected to ` +
  `${phase === "Shooting" ? "shoot" : "fight"} this phase.\n` +
  "Effect: You can spend 3YP. Until the end of the phase, attacks made by its models " +
  "re-roll Hit rolls of 1 and Wound rolls of 1. If you spent YP, they can instead " +
  `re-roll the whole ${fullReRoll} roll (the other roll still re-rolls only 1s).`;

const deepStrikeClose =
  "When: The Reinforcements step of your Movement phase.\n" +
  `Target: One ${LOV} unit from your army that is in Reserves and has Deep Strike.\n` +
  "Effect: Until the end of the phase, when the unit is set up using Deep Strike it can " +
  'be placed anywhere on the battlefield more than 6" horizontally from every enemy unit.\n' +
  "Restriction: The unit can't declare a charge this turn.";

const suppressed =
  "Until the start of your next turn that unit is suppressed: each time one of its " +
  "models makes an attack, subtract 1 from the Hit roll.";

const TEXT: Record<string, string> = {
  // ── Hearthfyre Arsenal ──────────────────────────────────────────────
  "wall-of-steel-hearthfyre-arsenal":
    "When: Your Charge phase, just after an IRONKIN STEELJACKS unit from your army " +
    "finishes a Charge move.\n" +
    "Target: That IRONKIN STEELJACKS unit.\n" +
    "Effect: You can spend 2YP. Pick one enemy unit (not a MONSTER or VEHICLE) within " +
    "Engagement Range of your unit and roll one D6 per model in your unit, plus two extra " +
    "dice if you spent YP. Each 4+ inflicts 1 mortal wound on that enemy unit (6 at most).",
  "unwavering-accuracy-hearthfyre-arsenal":
    "When: Your Shooting phase.\n" +
    "Target: One BRÔKHYR THUNDERKYN unit from your army that hasn't been selected to " +
    "shoot this phase.\n" +
    "Effect: Until the end of the phase, its attacks can ignore any or all modifiers to " +
    "Ballistic Skill, the Hit roll, the Wound roll and Armour Penetration.",
  "first-concern-hearthfyre-arsenal":
    "When: Your Shooting phase, just after a BRÔKHYR, IRONKIN STEELJACKS or ARKANYST " +
    "EVALUATOR unit from your army has shot.\n" +
    "Target: That unit.\n" +
    "Effect: If it Remained Stationary this turn, it can make a Normal move.",
  "preventative-purge-hearthfyre-arsenal":
    "When: Your opponent's Movement phase, just after an enemy unit finishes a Fall Back " +
    "move.\n" +
    "Target: One BRÔKHYR THUNDERKYN or IRONKIN STEELJACKS unit from your army.\n" +
    "Effect: Your unit can shoot as if it were your Shooting phase, but only at that " +
    "enemy unit (if it is an eligible target), subtracting 1 from its Hit rolls.",
  "cogitated-need-hearthfyre-arsenal":
    "When: End of your opponent's Movement phase.\n" +
    "Target: One IRONKIN STEELJACKS unit from your army.\n" +
    "Effect: It can make a Normal move, and must finish it as close as possible to the " +
    "nearest objective marker.",
  "delayed-fire-rounds-hearthfyre-arsenal":
    "When: Your Shooting phase, just after a BRÔKHYR, IRONKIN STEELJACKS or ARKANYST " +
    "EVALUATOR unit from your army has shot.\n" +
    "Target: That unit.\n" +
    "Effect: Pick one enemy unit (not a MONSTER or VEHICLE) hit by those attacks. Until " +
    "the start of your next Shooting phase, whenever it makes a Normal, Advance or Fall " +
    "Back move, roll one D6 per model in it: each 1 inflicts 1 mortal wound on it (6 at most).",
  "farstrydr-node-hearthfyre-arsenal": unitOnly(
    "IRON-MASTER or MEMNYR STRATEGIST",
    "Models in the bearer's unit have Deep Strike.",
  ),
  "farstryder-node-hearthfyre-arsenal": unitOnly(
    "IRON-MASTER or MEMNYR STRATEGIST",
    "Models in the bearer's unit have Deep Strike.",
  ),
  "calculated-tenacity-hearthfyre-arsenal": unitOnly(
    "IRON-MASTER or MEMNYR STRATEGIST",
    "While the bearer is leading a unit, models in that unit get +1 Objective Control.",
  ),
  "mantle-of-elders-hearthfyre-arsenal": unitOnly(
    "MEMNYR STRATEGIST",
    "When the bearer's unit is selected to shoot, if you spend YP on the Optimal " +
      "Application detachment rule, roll one D6: on a 2+, you gain 1YP.",
  ),
  "graviton-vault-hearthfyre-arsenal": unitOnly(
    "IRON-MASTER",
    "After the bearer shoots in your Shooting phase, and after it fights in the Fight " +
      "phase, pick one enemy MONSTER or VEHICLE unit hit by those attacks. " +
      suppressed,
  ),

  // ── Persecution Prospect ────────────────────────────────────────────
  "ranger-tactics-persecution-prospect":
    "When: Your Shooting phase.\n" +
    `Target: One ${LOV} unit from your army that hasn't been selected to shoot this phase.\n` +
    "Effect: Until the end of the phase, its models can re-roll the Hit roll for attacks " +
    "that target an assailed unit — or for every attack, if your unit is HERNKYN.",
  "frontier-momentum-persecution-prospect":
    "When: Your Movement phase.\n" +
    "Target: One HERNKYN unit from your army that hasn't been selected to move this phase.\n" +
    "Effect: Until the end of the phase, if it Advances, don't roll: add 6\" to its models' " +
    "Move characteristic instead.",
  "exposed-flaws-persecution-prospect":
    "When: Your Shooting phase.\n" +
    "Target: One HERNKYN unit from your army that hasn't been selected to shoot this phase.\n" +
    "Effect: You can spend 2YP. Until the end of the phase, its models can re-roll the " +
    "Wound roll for attacks that target an assailed unit — or for every attack, if you " +
    "spent YP.",
  "claimstaker-reflex-persecution-prospect":
    "When: Your opponent's Movement phase, just after an enemy unit finishes a Normal, " +
    "Advance or Fall Back move.\n" +
    `Target: One ${LOV} unit from your army (not ARTILLERY or VEHICLE) within 8" of that ` +
    "enemy unit.\n" +
    'Effect: You can spend 2YP. Your unit can make a Normal move of up to D6", or up to 6" ' +
    "if you spent YP.",
  "dispersed-formation-persecution-prospect":
    "When: Your opponent's Shooting phase, just after an enemy unit has selected its targets.\n" +
    `Target: One ${LOV} INFANTRY or ${LOV} MOUNTED unit from your army that was picked as ` +
    "a target of any of those attacks.\n" +
    "Effect: Until the end of the phase, your unit has Stealth and its models have the " +
    "Benefit of Cover against ranged attacks.",
  "adaptable-avarice-persecution-prospect":
    "When: Start of any phase, while units from your army have Fortify Takeover.\n" +
    `Target: One ${LOV} CHARACTER unit from your army.\n` +
    "Effect: You can spend any amount of YP. Then, if you have 6YP or fewer, units from " +
    "your army have Hostile Acquisition instead until the start of your next turn.",
  "eye-for-weakness-persecution-prospect": unitOnly(
    LOV,
    "Attacks made by models in the bearer's unit that target an assailed unit get +1 to " +
      "the Wound roll.",
  ),
  "writ-of-acquisition-persecution-prospect": unitOnly(
    LOV,
    "In your Shooting phase, after the bearer's unit has shot, gain 1YP for each " +
      "assailed enemy unit hit by those attacks (3YP at most).",
  ),
  "surgical-saboteur-persecution-prospect": unitOnly(
    LOV,
    "In your Shooting phase, after the bearer's unit has shot, pick one MONSTER or " +
      "VEHICLE unit hit by those attacks: it is pinned until the start of your next " +
      "Shooting phase.",
  ),
  "nomad-strategist-persecution-prospect": unitOnly(
    LOV,
    "Once per battle, at the end of your opponent's Fight phase, if the bearer is on the " +
      "battlefield, you can spend up to 4YP. Pick one HERNKYN unit from your army, plus one " +
      "more for every 2YP spent, and put them into Strategic Reserves. A unit within " +
      "Engagement Range of an enemy unit (other than an assailed one) can't be picked.",
  ),

  // ── Needgaârd Oathband ──────────────────────────────────────────────
  "honour-of-the-hold-needgaard-oathband":
    "When: Fight phase.\n" +
    `Target: One ${LOV} unit from your army that hasn't been selected to fight this phase.\n` +
    "Effect: You can spend 3YP. Pick one enemy unit within Engagement Range of your unit. " +
    "Until the end of the phase, your models' melee attacks against it get +1 to Armour " +
    "Penetration (+2 instead if you spent YP).",
  "ancestral-sentence-needgaard-oathband":
    "When: Your Shooting phase.\n" +
    `Target: One ${LOV} unit from your army that hasn't been selected to shoot this phase.\n` +
    "Effect: You can spend 3YP. Until the end of the phase, its ranged weapons have " +
    "[SUSTAINED HITS 1] ([SUSTAINED HITS 2] instead if you spent YP).",
  "huntrs-mark-needgaard-oathband":
    "When: Your Shooting phase.\n" +
    `Target: One ${LOV} unit from your army that hasn't been selected to shoot this phase.\n` +
    "Effect: Until the end of the phase, attacks made by its models re-roll Hit rolls of 1 " +
    "and Wound rolls of 1.",
  "ordered-retreat-needgaard-oathband": fellBack(LOV),
  "reactive-reprisal-needgaard-oathband":
    "When: Your opponent's Shooting phase, just after an enemy unit has shot, while units " +
    "from your army have Fortify Takeover.\n" +
    `Target: One ${LOV} unit from your army that was picked as a target of any of those ` +
    "attacks.\n" +
    "Effect: Your unit can shoot as if it were your Shooting phase, but only at that enemy " +
    "unit, and only if it is an eligible target.",
  "void-hardened-needgaard-oathband":
    "When: Your opponent's Shooting phase or the Fight phase, just after an enemy unit has " +
    "selected its targets, while units from your army have Fortify Takeover.\n" +
    `Target: One ${LOV} unit from your army that was picked as a target of any of those ` +
    "attacks.\n" +
    "Effect: Until that enemy unit has finished its attacks, worsen the Armour " +
    "Penetration of each attack that targets your unit by 1.",
  "oathbound-speculator-needgaard-oathband": unitOnly(
    LOV,
    "Attacks made by models in the bearer's unit re-roll Wound rolls of 1. When the " +
      "bearer's unit is selected to shoot or fight, you can spend 3YP; if you do, its " +
      "attacks get +1 to the Wound roll until the end of the phase.",
  ),
  "dead-reckoning-needgaard-oathband": unitOnly(
    LOV,
    "At the end of each turn, if the bearer is on the battlefield and you spent no YP " +
      "that turn, you can gain 1YP.",
  ),
  "iron-ambassador-needgaard-oathband": unitOnly(
    `${LOV} (equipped with an Autoch-pattern combi-bolter)`,
    "Once per battle, when the bearer's unit is selected to shoot, you can spend up to " +
      "3YP: until the end of the phase, the bearer's ranged weapons get +1 Damage per YP " +
      "spent.",
  ),
  "ancestral-crest-needgaard-oathband": unitOnly(
    LOV,
    "Once per turn, when you use the Command Re-roll Stratagem on the bearer's unit, you " +
      "can spend 1YP to make that use cost 1CP less.",
  ),

  // ── Dêlve Assault Shift ─────────────────────────────────────────────
  "cyberstimm-infusion-delve-assault-shift":
    "When: Fight phase.\n" +
    "Target: One CTHONIAN BESERKS unit from your army that hasn't been selected to fight " +
    "this phase.\n" +
    "Effect: You can spend 2YP. Until the end of the phase, attacks made by its models " +
    "re-roll Wound rolls of 1, or can re-roll the whole Wound roll if you spent YP.",
  "unstoppable-force-delve-assault-shift": pileIn,
  "augmented-assault-delve-assault-shift":
    "When: Your Movement phase.\n" +
    "Target: One CTHONIAN BESERKS unit from your army that hasn't been selected to move " +
    "this phase.\n" +
    'Effect: You can spend up to 2YP. Until the end of the turn, its models get +1" Move ' +
    "per YP spent, and it can declare a charge even though it Advanced.",
  "tectonic-fracture-delve-assault-shift":
    "When: Your Shooting phase, just after a CTHONIAN EARTHSHAKERS unit from your army " +
    "has shot.\n" +
    "Target: That CTHONIAN EARTHSHAKERS unit.\n" +
    "Effect: You can spend 2YP. Pick one enemy unit hit by your unit's attacks this phase. " +
    'Until the start of your next Shooting phase, it gets -2" Move and, if you spent YP, ' +
    "-2 to its Charge rolls.",
  "weavewerke-buttress-delve-assault-shift":
    "When: Your opponent's Shooting phase, just after an enemy unit has selected its " +
    "targets, while units from your army have Hostile Acquisition.\n" +
    `Target: One ${LOV} INFANTRY unit from your army that was picked as a target of any ` +
    "of those attacks.\n" +
    "Effect: Until the end of the phase, attacks that target your unit subtract 1 from " +
    "the Wound roll.",
  "hidden-accessways-delve-assault-shift":
    "When: End of your opponent's Fight phase.\n" +
    "Target: One CTHONIAN BESERKS, HEARTHKYN WARRIORS or HERNKYN YAEGIRS unit from your " +
    "army that isn't within Engagement Range of any enemy units.\n" +
    "Effect: Remove it from the battlefield and put it into Strategic Reserves.",
  "delvewerke-navigator-delve-assault-shift": unitOnly(
    LOV,
    "In the Reinforcements step of your Movement phase, the bearer can pick one friendly " +
      "CTHONIAN BESERKS unit it can see and spend any amount of YP. Return one destroyed " +
      "non-CHARACTER model to that unit, plus up to one more for every 2YP spent.",
  ),
  "multiwave-system-jammer-delve-assault-shift": unitOnly(
    LOV,
    "Once per battle, in your Movement phase, if the bearer is on the battlefield, pick " +
      "one friendly CTHONIAN unit in Reserves. Until the end of the phase, set it up as if " +
      "the battle round were one higher than it is.",
  ),
  "quake-supervisor-delve-assault-shift": unitOnly(
    LOV,
    `While the bearer is within 3" of any friendly ${LOV} ARTILLERY units, it has Lone ` +
      "Operative, and those ARTILLERY units get +1 to the Hit roll for ranged attacks " +
      "against enemy units the bearer can see.",
  ),
  "piledriver-delve-assault-shift": unitOnly(
    LOV,
    "When the bearer's unit is selected to fight, you can spend up to 2YP: until the end " +
      "of the phase, the bearer's melee weapons get +1 Damage per YP spent.",
  ),

  // ── Brandfast Oathband ──────────────────────────────────────────────
  "bastion-running-brandfast-oathband":
    "When: Your Movement phase.\n" +
    "Target: One HEKATON LAND FORTRESS unit from your army that hasn't been selected to " +
    "move this phase.\n" +
    "Effect: Until the end of the phase, when it makes a Normal or Advance move it can " +
    "move horizontally through terrain features.",
  "secure-positions-brandfast-oathband":
    "When: End of any of your phases.\n" +
    `Target: One ${LOV} TRANSPORT unit from your army.\n` +
    `Effect: One ${LOV} unit embarked within it can disembark, setting up anywhere wholly ` +
    'within 6" of the TRANSPORT. That unit can\'t declare a charge this turn but otherwise ' +
    "acts normally for the rest of the turn.",
  "inexorable-efficiency-brandfast-oathband":
    "When: Your Shooting phase.\n" +
    `Target: One ${LOV} unit from your army.\n` +
    "Effect: Until the end of the phase, it can shoot even though it Fell Back this turn.",
  "opportunistic-escalation-brandfast-oathband":
    "When: Your opponent's Shooting phase, just after an enemy unit has shot, while units " +
    "from your army have Hostile Acquisition.\n" +
    `Target: One ${LOV} VEHICLE unit from your army (not a HEKATON LAND FORTRESS) hit by ` +
    "any of those attacks.\n" +
    'Effect: Your unit can make a Normal move of up to D6".',
  "vengeance-flare-brandfast-oathband":
    "When: Your opponent's Shooting phase, just after an enemy unit has shot.\n" +
    `Target: One ${LOV} INFANTRY unit hit by any of those attacks.\n` +
    'Effect: You can spend 2YP. Pick one friendly KAPRICUS or SAGITAUR unit within 6" of ' +
    'your INFANTRY unit (or, if you spent YP, a friendly HEKATON LAND FORTRESS within 6" ' +
    "instead). The picked unit can shoot as if it were your Shooting phase, but only at " +
    "that enemy unit (if it is an eligible target).",
  "illuminated-priority-brandfast-oathband":
    `When: Your Shooting phase, just after a ${LOV} VEHICLE unit from your army has shot.\n` +
    "Target: That VEHICLE unit.\n" +
    "Effect: Pick one enemy unit hit by those attacks. Until the end of the phase, " +
    `attacks made by ${LOV} INFANTRY models from your army against it re-roll Hit rolls of 1.`,
  "tactical-alchemy-brandfast-oathband": unitOnly(
    "KÂHL",
    "In your Command phase, if the bearer's unit is within range of an objective marker " +
      "you control outside your deployment zone, you can spend 1YP and roll one D6: on a " +
      "4+, you gain 1CP.",
  ),
  "trivarg-cyber-implant-brandfast-oathband": unitOnly(
    LOV,
    "In your Shooting phase, when the bearer's unit is selected to shoot, if it " +
      "disembarked from a TRANSPORT this turn or you spend 2YP, its ranged weapons have " +
      "[SUSTAINED HITS 2] until the end of the phase.",
  ),
  "precursive-judgement-brandfast-oathband": unitOnly(
    "KÂHL",
    `While the bearer's unit is wholly within 6" of a friendly ${LOV} TRANSPORT, you can ` +
      "use the Fire Overwatch Stratagem on it for 0CP, and it hits on unmodified Hit rolls " +
      "of 5+ while resolving that Stratagem.",
  ),
  "signature-restoration-brandfast-oathband": unitOnly(
    "IRON-MASTER",
    `Each friendly ${LOV} model repaired by the bearer's Forgewrought Expertise ability ` +
      "regains 1 extra lost wound.",
  ),

  // ── Hearthband (Faction Pack) ───────────────────────────────────────
  "brekkeknots-hearthband":
    "When: Your opponent's Shooting phase or the Fight phase, just after an enemy unit has " +
    "selected its targets.\n" +
    "Target: One KÂHL, ÛTHAR THE DESTINED or EINHYR HEARTHGUARD unit from your army that " +
    "was picked as a target of any of those attacks.\n" +
    "Effect: Until the end of the phase, models in your unit have a 4+ invulnerable save.",
  "fury-of-the-hearth-hearthband":
    "When: Your Shooting phase.\n" +
    "Target: One EINHYR HEARTHGUARD unit from your army that hasn't been selected to " +
    "shoot this phase.\n" +
    "Effect: Until the end of the phase, its ranged weapons get +1 Strength. If you spend " +
    "1YP, they also have [SUSTAINED HITS 1] until the end of the phase.",
  "superior-craftsmanship-hearthband":
    "When: Fight phase.\n" +
    `Target: One ${LOV} unit from your army that hasn't been selected to fight this phase.\n` +
    "Effect: Until the end of the phase, its models' attacks that target a MONSTER or " +
    "VEHICLE unit get +1 Damage.",
  "sure-of-purpose-hearthband": pileIn,
  "unyielding-aggression-hearthband": fellBack(`${LOV} INFANTRY`),
  "materialisation-matrices-hearthband": deepStrikeClose,
  "bastion-shield-hearthband": unitOnly(
    LOV,
    'Ranged attacks that target the bearer\'s unit made by a model within 12" of it ' +
      "have their Armour Penetration worsened by 1. If you spend 1YP, until the end of the " +
      'phase this applies to attacking models within 18" instead.',
  ),
  "quake-multigenerator-hearthband": unitOnly(
    "KÂHL",
    "In your Shooting phase, after the bearer has shot, pick one enemy unit (not TITANIC) " +
      "hit by those attacks. " +
      suppressed,
  ),
  "ironskein-hearthband": unitOnly(LOV, "The bearer has +2 Wounds."),
  "high-kahl-hearthband": unitOnly(
    "KÂHL",
    "Each time a model in the bearer's unit is destroyed by a melee attack before it has " +
      "fought this phase, roll one D6: on a 4+, it stays in play, fights once the " +
      "attacking unit has finished its attacks, and is then removed.",
  ),

  // ── Mercenary Oathband (Faction Pack) ───────────────────────────────
  "auxiliary-contract-mercenary-oathband":
    "When: Your Shooting phase or the Fight phase.\n" +
    `Target: One ${LOV} INFANTRY or ${LOV} MOUNTED unit from your army that hasn't been ` +
    "selected to shoot or fight this phase.\n" +
    "Effect: Until the end of the phase, its weapons have [PRECISION].",
  "grand-artifice-mercenary-oathband": fellBack(LOV),
  "new-horizons-mercenary-oathband":
    "When: End of your opponent's Fight phase.\n" +
    `Target: One ${LOV} INFANTRY unit from your army that isn't within Engagement Range ` +
    "of any enemy units, plus one friendly TRANSPORT it could embark within.\n" +
    'Effect: If the unit is wholly within 6" of that TRANSPORT, it can embark within it.',
  "mobile-exploitation-mercenary-oathband":
    "When: End of your opponent's Fight phase.\n" +
    "Target: One HERNKYN unit from your army that isn't within Engagement Range of any " +
    "enemy units — or, if you spend 2YP, up to two such HERNKYN units.\n" +
    "Effect: Remove them from the battlefield and put them into Strategic Reserves.",
  "optimal-expenditure-mercenary-oathband": reRollOnes("Fight", "Wound"),
  "privateer-arsenal-mercenary-oathband": reRollOnes("Shooting", "Hit"),
  "mercenary-prospector-mercenary-oathband": unitOnly(
    "KÂHL",
    "Each time the bearer's unit destroys an enemy unit, you gain 2YP.",
  ),
  "metaphysical-brokerage-mercenary-oathband": unitOnly(
    "MEMNYR STRATEGIST",
    "At the end of your turn, if the bearer is on the battlefield and you gained less " +
      "than 3YP this turn, gain enough YP to make up the difference.",
  ),
  "etacarn-sb9-targeting-implant-mercenary-oathband": unitOnly(
    LOV,
    "Attacks made by models in the bearer's unit re-roll Hit rolls of 1. When the " +
      "bearer's unit is selected to shoot or fight, you can spend 3YP; if you do, its " +
      "attacks have [SUSTAINED HITS 1] until the end of the phase.",
  ),
  "asset-manipulator-mercenary-oathband": unitOnly(
    LOV,
    "At the start of the Command phase, you can spend 3YP. If you do, until the end of " +
      'the turn, models in enemy units within 3" of the bearer get -1 Objective Control.',
  ),

  // ── Armoured Trailblazers (Faction Pack) ────────────────────────────
  "coordinated-crossfire-armoured-trailblazers":
    "When: Start of your Shooting phase.\n" +
    "Target: Up to two friendly SAGITAUR units.\n" +
    "Effect: Pick one enemy unit. Your units' ranged attacks against it can re-roll Hit " +
    "rolls of 1 and Wound rolls of 1.",
  "outflanking-armour-armoured-trailblazers":
    "When: End of your opponent's Movement phase, from the second battle round onwards.\n" +
    "Target: Up to two friendly SAGITAUR units in Strategic Reserves.\n" +
    "Effect: Each of them makes an ingress move.",
  "built-to-last-armoured-trailblazers":
    "When: Your opponent's Shooting phase, when an enemy unit targets a friendly SAGITAUR " +
    "unit.\n" +
    "Target: That SAGITAUR unit.\n" +
    "Effect: Ranged attacks against your unit whose Strength is greater than its " +
    "Toughness get -1 to the Wound roll.",
  "saturation-rounds-upgrade-armoured-trailblazers":
    "SAGITAUR unit only. This unit's ranged attacks have [IGNORES COVER].",
  "optimised-attack-lines-upgrade-armoured-trailblazers":
    "SAGITAUR unit only. This unit has Mobile.",

  // ── Farseekers (Faction Pack) ───────────────────────────────────────
  "scornful-analysis-farseekers":
    "When: Start of your Shooting phase.\n" +
    "Target: One friendly HERNKYN unit.\n" +
    'Effect: Pick one visible enemy unit within 12" of your unit. Attacks made by ' +
    `friendly ${LOV} units against it have [IGNORES COVER].`,
  "no-shot-wasted-farseekers":
    "When: Your Shooting phase, when a friendly HERNKYN unit is selected to shoot.\n" +
    "Target: That HERNKYN unit.\n" +
    "Effect: Its ranged attacks have [LETHAL HITS].",
  "economy-of-motion-farseekers":
    "When: Your opponent's Movement phase, when an enemy unit finishes a move within 8\" " +
    "of a friendly unengaged PIONEERS unit.\n" +
    "Target: That PIONEERS unit.\n" +
    'Effect: It can make a Normal move of up to D3+3".',
  "pan-spectral-lockons-upgrade-farseekers":
    'PIONEERS unit only. In your Shooting phase, you can pick one visible enemy unit within 12" ' +
    'of this unit. It is spotted: a spotted unit\'s detection range is increased by 3".',
  "shroudwerke-talismans-upgrade-farseekers":
    'YAEGIRS unit only. This unit\'s detection range is reduced by 3".',

  // ── Hearthguard Covenant (Faction Pack) ─────────────────────────────
  "brekkeknots-hearthguard-covenant":
    "When: Your opponent's Shooting phase or the Fight phase, when an enemy unit targets a " +
    "friendly EINHYR HEARTHGUARD unit.\n" +
    "Target: That EINHYR HEARTHGUARD unit.\n" +
    "Effect: Your unit has a 4+ invulnerable save.",
  "fury-of-the-hearth-hearthguard-covenant":
    "When: Your Shooting phase, when a friendly EINHYR HEARTHGUARD unit is selected to shoot.\n" +
    "Target: That EINHYR HEARTHGUARD unit.\n" +
    "Effect: Its ranged attacks get +1 Strength. If you spend 1YP, they also have " +
    "[SUSTAINED HITS 1].",
  "materialisation-matrices-hearthguard-covenant":
    "When: Your Movement phase, when a friendly EINHYR HEARTHGUARD unit with Deep Strike is " +
    "selected to make an ingress move.\n" +
    "Target: That EINHYR HEARTHGUARD unit.\n" +
    'Effect: It can be set up anywhere on the battlefield more than 6" horizontally from ' +
    "all enemy units, even inside your opponent's deployment zone. It can't declare a " +
    "charge this turn.",
  "ironskein-hearthguard-covenant": unitOnly("KÂHL", "This model has +2 Wounds."),
  "high-kahl-hearthguard-covenant": unitOnly(
    "KÂHL",
    "In the Fight phase, if this unit hasn't been selected to fight yet, each time a model " +
      "in it is destroyed roll one D6: on a 4+, leave that model on the battlefield. Remove " +
      "it once this unit has fought or at the end of the phase, whichever comes first.",
  ),
};

/** Stratagem / enhancement id → text; overrides upstream text where linked. */
export const VOTANN_RULE_TEXT: Record<string, { text: string; override: true }> =
  Object.fromEntries(
    Object.entries(TEXT).map(([id, text]) => [id, { text, override: true as const }]),
  );

/**
 * Datasheet abilities the Faction Pack rewrote (and Berehk's, which upstream
 * renders as a free Overwatch). Keyed by ability id; paraphrased.
 */
export const VOTANN_ABILITY_TEXT: Record<string, string> = {
  "unhinged-vengeance":
    "In your opponent's Shooting phase, after an enemy unit has shot, if this model lost " +
    'one or more wounds to those attacks, this unit can make a surge move of up to D6+2".',
  "pragmatic-hunters":
    "In your opponent's Movement phase, if an enemy unit ends a move within 8\" of this " +
    "unit and this unit isn't within Engagement Range of any enemy units, this unit can " +
    'make a Normal move of up to D6".',
  "predictive-guidance":
    "Once per battle round, when you use the Fire Overwatch or Heroic Intervention " +
    "Stratagem on this unit, you can use this ability to make that use cost 1CP less.",
  "ancestral-fortune":
    "Once per turn, you can spend 1YP to change one Hit roll, Wound roll or saving throw " +
    "made for this model into an unmodified 6.",
  "relentless-avalanche":
    "You can use the Heroic Intervention Stratagem on this unit even if it has already " +
    "been used on another unit this phase. If you do, that use costs 1CP less and " +
    "doesn't stop other units using that Stratagem this phase.",
};
