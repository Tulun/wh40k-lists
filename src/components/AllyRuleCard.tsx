import type { AlliedRule } from "@alpaca-software/40kdc-data";
import type { AllyCapUsage } from "../lib/list-edit";

const SIZES = [
  { id: "incursion", label: "Incursion" },
  { id: "strike-force", label: "Strike Force" },
  { id: "onslaught", label: "Onslaught" },
] as const;

/**
 * Riders the allied-rule records don't carry, keyed by the pool's source
 * faction. Paraphrased — never GW wording.
 */
const EXTRA_RIDERS: Record<string, string> = {
  "agents-of-the-imperium":
    "Dedicated Transports don't count toward these limits, but each must start the battle with a unit embarked — otherwise it can't deploy and counts as destroyed in the first battle round.",
};

/**
 * An allied-rule pool rendered as a rules block, generated from its
 * structured limits (the dataset carries no prose for it). With `usage`
 * it shows the roster's live counts for its battle size; without, the
 * full per-battle-size table.
 */
export default function AllyRuleCard({
  rule,
  usage,
  gate,
  availableTo,
}: {
  rule: AlliedRule;
  usage?: AllyCapUsage[];
  /** Detachment names the rule is gated on, when it is. */
  gate?: string[];
  /** Show which armies may take this pool (on the source faction's page). */
  availableTo?: boolean;
}) {
  const label = rule.label ?? rule.name;
  const riders = [
    rule.cannot_be_warlord && "Can't be your Warlord.",
    rule.cannot_take_enhancements && "Can't take Enhancements.",
    rule.max_units != null && `At most ${rule.max_units} units in total.`,
    rule.source_faction_id && EXTRA_RIDERS[rule.source_faction_id],
  ].filter((r): r is string => !!r);
  const capsAt = (size: string) =>
    [
      ...(rule.keyword_limits ?? [])
        .filter((l) => l.battle_size === size)
        .map((l) => `${l.max_count} ${l.keyword}`),
      ...(rule.points_limits ?? [])
        .filter((l) => l.battle_size === size)
        .map((l) => `${l.max_points} pts`),
    ].join(" · ");
  const sizes = SIZES.filter((s) => capsAt(s.id));

  return (
    <div className="rounded-lg border border-edge px-3 py-2.5 text-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-accent">
        {label}
        {label !== rule.name && (
          <span className="ml-1 font-normal normal-case text-ink-faint">({rule.name})</span>
        )}
      </p>
      {availableTo && (rule.army_keywords_any?.length ?? 0) > 0 && (
        <p className="mt-1 text-xs text-ink-dim">
          Can join any army with: {rule.army_keywords_any!.join(", ")}.
        </p>
      )}
      {gate && gate.length > 0 && (
        <p className="mt-1 text-xs text-ink-dim">Only with the {gate.join(" or ")} detachment.</p>
      )}
      {usage ? (
        usage.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {usage.map((c) => (
              <span
                key={c.keyword}
                className={`rounded px-1.5 py-0.5 text-xs tabular-nums ${
                  c.used > c.max ? "bg-opponent/20 text-opponent" : "bg-panel text-ink-dim"
                }`}
              >
                {c.keyword} {c.used}/{c.max}
              </span>
            ))}
          </div>
        )
      ) : (
        sizes.length > 0 && (
          <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            {sizes.map((s) => (
              <div key={s.id} className="contents">
                <dt className="text-ink-faint">{s.label}</dt>
                <dd className="text-ink-dim">up to {capsAt(s.id)}</dd>
              </div>
            ))}
          </dl>
        )
      )}
      {riders.length > 0 && (
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs text-ink-dim">
          {riders.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
