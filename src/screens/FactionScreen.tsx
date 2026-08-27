import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import UnitListPane from "../components/UnitListPane";
import { useDataset } from "../hooks/useDataset";
import { DISPOSITIONS } from "../lib/codex-model";
import { abilityText } from "../lib/describe";
import { byId } from "../lib/lookup";
import { codexBadge, useCodex } from "../store/codex";

type Tab = "rule" | "detachments" | "units";

export default function FactionScreen() {
  const { factionId } = useParams();
  const data = useDataset();
  const doc = useCodex((s) => s.doc);
  const [tab, setTab] = useState<Tab>("units");

  if (!data) {
    return <p className="py-16 text-center text-xs text-ink-faint">Loading dataset…</p>;
  }

  const faction = factionId ? data.factions.getAny(factionId) : undefined;
  if (!faction || !factionId) {
    return (
      <p className="py-16 text-center text-sm text-ink-dim">
        Faction not found. <Link to="/explore" className="underline">Back to factions</Link>
      </p>
    );
  }

  const unitCount = data.units.byFaction(factionId).length;
  const detachments = [...data.detachments.byFaction(factionId)].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const armyRuleId = faction.raw.faction_rule_id;
  const armyRule = armyRuleId ? byId(data.abilities, armyRuleId, factionId) : undefined;

  const TABS: { id: Tab; label: string; detail?: string }[] = [
    { id: "rule", label: "Army rule" },
    { id: "detachments", label: "Detachments", detail: `${detachments.length}` },
    { id: "units", label: "Units", detail: `${unitCount}` },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2">
        <h1 className="flex-1 text-lg font-bold">{faction.name}</h1>
        {codexBadge(doc, factionId) && (
          <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent">
            {codexBadge(doc, factionId) === "replace" ? "Leaked codex" : "Edited"}
          </span>
        )}
        <Link to={`/editor/${factionId}`} className="text-xs text-accent underline">
          edit
        </Link>
        <Link to="/explore" className="text-xs text-ink-faint underline">
          all factions
        </Link>
      </div>

      <div className="sticky top-12 z-10 -mx-3 border-b border-edge bg-surface/95 px-3 py-1.5 backdrop-blur">
        <div className="flex overflow-hidden rounded-md border border-edge">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex-1 py-1.5 text-xs font-semibold transition-colors ${
                tab === t.id ? "bg-panel text-ink" : "text-ink-dim hover:text-ink"
              }`}
            >
              {t.label}
              {t.detail && <span className="ml-1 font-normal text-ink-faint">{t.detail}</span>}
            </button>
          ))}
        </div>
      </div>

      {tab === "rule" &&
        (armyRule ? (
          <div className="rounded-md border border-edge px-3 py-2">
            <p className="text-sm font-semibold">{armyRule.name}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-snug">
              {abilityText(armyRule)}
            </p>
          </div>
        ) : (
          <p className="py-8 text-center text-xs text-ink-faint">No army rule recorded.</p>
        ))}

      {tab === "detachments" &&
        (detachments.length > 0 ? (
          <ul className="divide-y divide-edge overflow-hidden rounded-md border border-edge">
            {detachments.map((d) => (
              <li key={d.id}>
                <Link
                  to={`/explore/${factionId}/detachment/${d.id}`}
                  className="flex min-h-11 items-center gap-2 px-3 py-1.5 hover:bg-panel active:bg-panel"
                >
                  <span className="min-w-0 flex-1">
                    <span className="text-sm font-medium">
                      {d.name}
                      {d.detachment_points != null && (
                        <span className="ml-1 text-xs font-normal text-ink-faint">
                          · {d.detachment_points} DP
                        </span>
                      )}
                    </span>
                    {(d.force_dispositions?.length ?? 0) > 0 && (
                      <span className="block text-xs text-ink-faint">
                        {d.force_dispositions!
                          .map((id) => DISPOSITIONS.find((x) => x.id === id)?.label ?? id)
                          .join(" · ")}
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-ink-faint">›</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-8 text-center text-xs text-ink-faint">No detachments recorded.</p>
        ))}

      {tab === "units" && (
        // Desktop two-pane: the unit list becomes a master column and the
        // datasheet opens beside it (DatasheetScreen renders the same pane).
        <div className="lg:flex lg:items-start lg:gap-4">
          <div className="lg:w-80 lg:shrink-0">
            <UnitListPane data={data} factionId={factionId} />
          </div>
          <div className="hidden min-h-64 flex-1 items-center justify-center rounded-md border border-dashed border-edge text-sm text-ink-faint lg:sticky lg:top-24 lg:flex">
            Select a unit to see its datasheet
          </div>
        </div>
      )}
    </div>
  );
}
