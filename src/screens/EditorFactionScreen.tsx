import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  Field,
  SectionCard,
  SmallButton,
  TabBar,
  TextArea,
  TextInput,
} from "../components/editor/fields";
import { useDataset } from "../hooks/useDataset";
import { factionMode, useCodex } from "../store/codex";

/** Compact disposition labels for one-line list rows. */
const DISPOSITION_SHORT: Record<string, string> = {
  "take-and-hold": "Take & Hold",
  disruption: "Disruption",
  "purge-the-foe": "Purge",
  "priority-assets": "Priority",
  reconnaissance: "Recon",
};

/**
 * Editing hub for one faction. Replace mode (the new Ork codex): army rule +
 * hand-built detachments and datasheets. Patch mode (other factions): the
 * upstream records, searchable, with edited copies listed on top.
 * Datasheets and detachments live on separate tabs (tab kept in the URL so
 * back-navigation restores it).
 */
export default function EditorFactionScreen() {
  const { factionId = "" } = useParams();
  const data = useDataset();
  const doc = useCodex((s) => s.doc);
  const setArmyRule = useCodex((s) => s.setArmyRule);
  const resetDatasheet = useCodex((s) => s.deleteDatasheet);
  const resetDetachment = useCodex((s) => s.deleteDetachment);

  const mode = factionMode(factionId);
  const entry = doc.factions[factionId];
  // The merged dataset already resolves the display name (compile falls back
  // to the upstream faction name when the entry carries a placeholder).
  const factionName = data?.factions.getAny(factionId)?.name ?? factionId;

  const [ruleDraft, setRuleDraft] = useState<{ name: string; text: string } | null>(null);
  const [query, setQuery] = useState("");
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "detachments" ? "detachments" : "datasheets";
  const setTab = (t: string) =>
    setParams(t === "detachments" ? { tab: t } : {}, { replace: true });

  if (!data) {
    return <p className="py-16 text-center text-xs text-ink-faint">Loading dataset…</p>;
  }

  const armyRule = entry?.mode === "replace" ? entry.armyRule : null;

  const replaceEntry = entry?.mode === "replace" ? entry : null;
  const patchEntry = entry?.mode === "patch" ? entry : null;

  const q = query.trim().toLowerCase();
  const matches = (name: string) => !q || name.toLowerCase().includes(q);

  const ownSheets = (replaceEntry?.datasheets ?? [])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  const ownDets = (replaceEntry?.detachments ?? [])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  const upstreamUnits =
    mode === "patch"
      ? data.units
          .byFaction(factionId)
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
      : [];
  const upstreamDetachments =
    mode === "patch"
      ? data.detachments
          .byFaction(factionId)
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
      : [];

  const editedSheets = patchEntry ? Object.values(patchEntry.datasheets) : [];
  const editedDets = patchEntry ? Object.values(patchEntry.detachments) : [];
  const editedSheetIds = new Set(editedSheets.map((s) => s.id));
  const editedDetIds = new Set(editedDets.map((d) => d.id));

  const tabs = [
    {
      id: "datasheets",
      label: `Datasheets (${mode === "replace" ? ownSheets.length : upstreamUnits.length})`,
    },
    {
      id: "detachments",
      label: `Detachments (${mode === "replace" ? ownDets.length : upstreamDetachments.length})`,
    },
  ];

  return (
    <div className="space-y-3 pb-8">
      <div className="flex items-baseline gap-2">
        <h1 className="flex-1 text-lg font-bold">Edit · {factionName}</h1>
        <Link to="/editor" className="text-xs text-ink-faint underline">
          all factions
        </Link>
      </div>
      <p className="text-xs text-ink-dim">
        {mode === "replace"
          ? "Full codex mode — what you build here replaces the upstream faction entirely."
          : "Patch mode — edit individual upstream records; everything else stays as upstream ships it."}
      </p>

      {mode === "replace" && (
        <SectionCard
          title="Army rule"
          actions={
            ruleDraft === null ? (
              <SmallButton onClick={() => setRuleDraft(armyRule ?? { name: "", text: "" })}>
                {armyRule ? "Edit" : "+ add"}
              </SmallButton>
            ) : undefined
          }
        >
          {ruleDraft === null ? (
            armyRule ? (
              <div>
                <div className="text-sm font-semibold">{armyRule.name}</div>
                <p className="whitespace-pre-wrap text-sm leading-snug text-ink-dim">{armyRule.text}</p>
              </div>
            ) : (
              <p className="text-xs text-ink-faint">No army rule yet.</p>
            )
          ) : (
            <div className="space-y-2">
              <Field label="Rule name">
                <TextInput
                  value={ruleDraft.name}
                  onChange={(e) => setRuleDraft({ ...ruleDraft, name: e.target.value })}
                />
              </Field>
              <Field label="Rule text">
                <TextArea
                  rows={5}
                  value={ruleDraft.text}
                  placeholder="Paraphrased rule text — never verbatim from the book."
                  onChange={(e) => setRuleDraft({ ...ruleDraft, text: e.target.value })}
                />
              </Field>
              <div className="flex gap-2">
                <SmallButton
                  tone="primary"
                  onClick={() => {
                    setArmyRule(factionId, ruleDraft.name.trim() ? ruleDraft : null);
                    setRuleDraft(null);
                  }}
                >
                  Save rule
                </SmallButton>
                <SmallButton onClick={() => setRuleDraft(null)}>Cancel</SmallButton>
                {armyRule && (
                  <SmallButton
                    tone="danger"
                    onClick={() => {
                      setArmyRule(factionId, null);
                      setRuleDraft(null);
                    }}
                  >
                    Remove
                  </SmallButton>
                )}
              </div>
            </div>
          )}
        </SectionCard>
      )}

      {mode === "patch" && (editedSheets.length > 0 || editedDets.length > 0) && (
        <SectionCard title="Edited records">
          {editedDets.map((d) => (
            <div key={d.id} className="flex min-h-10 items-center gap-2 border-t border-edge text-sm first:border-t-0">
              <Link to={`/editor/${factionId}/detachment/${d.id}`} className="flex-1 font-medium">
                {d.name} <span className="text-xs font-normal text-ink-faint">detachment ›</span>
              </Link>
              <SmallButton tone="danger" onClick={() => resetDetachment(factionId, d.id)}>
                Reset
              </SmallButton>
            </div>
          ))}
          {editedSheets.map((s) => (
            <div key={s.id} className="flex min-h-10 items-center gap-2 border-t border-edge text-sm first:border-t-0">
              <Link to={`/editor/${factionId}/datasheet/${s.id}`} className="flex-1 font-medium">
                {s.name} <span className="text-xs font-normal text-ink-faint">datasheet ›</span>
              </Link>
              <SmallButton tone="danger" onClick={() => resetDatasheet(factionId, s.id)}>
                Reset
              </SmallButton>
            </div>
          ))}
          <p className="text-[10px] text-ink-faint">Reset removes your copy and restores the upstream record.</p>
        </SectionCard>
      )}

      <TabBar tabs={tabs} active={tab} onSelect={setTab} />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search ${tab}…`}
        className="w-full rounded-md border border-edge bg-panel px-3 py-2 text-sm"
      />

      {mode === "replace" && tab === "datasheets" && (
        <div className="overflow-hidden rounded-md border border-edge">
          <Link
            to={`/editor/${factionId}/datasheet/new`}
            className="flex min-h-11 items-center justify-center border-b border-edge bg-panel/50 text-sm font-semibold text-accent hover:bg-panel active:bg-panel"
          >
            + New datasheet
          </Link>
          <div className="divide-y divide-edge px-3">
            {ownSheets.filter((d) => matches(d.name)).map((d) => (
              <Link
                key={d.id}
                to={`/editor/${factionId}/datasheet/${d.id}`}
                className="flex min-h-11 items-center gap-2 text-sm hover:bg-panel active:bg-panel"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{d.name}</span>
                <span className="shrink-0 text-xs text-ink-faint">›</span>
              </Link>
            ))}
            {ownSheets.filter((d) => matches(d.name)).length === 0 && (
              <p className="py-3 text-xs text-ink-faint">{q ? "No matches." : "None yet."}</p>
            )}
          </div>
        </div>
      )}

      {mode === "replace" && tab === "detachments" && (
        <div className="overflow-hidden rounded-md border border-edge">
          <Link
            to={`/editor/${factionId}/detachment/new`}
            className="flex min-h-11 items-center justify-center border-b border-edge bg-panel/50 text-sm font-semibold text-accent hover:bg-panel active:bg-panel"
          >
            + New detachment
          </Link>
          <div className="divide-y divide-edge px-3">
            {ownDets.filter((d) => matches(d.name)).map((d) => (
              <Link
                key={d.id}
                to={`/editor/${factionId}/detachment/${d.id}`}
                className="flex min-h-11 items-center gap-2 py-1.5 text-sm hover:bg-panel active:bg-panel"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{d.name}</span>
                  <span className="block text-[10px] text-ink-faint">
                    {d.points != null ? `${d.points} DP` : "? DP"}
                    {d.dispositions.length > 0 &&
                      ` · ${d.dispositions.map((x) => DISPOSITION_SHORT[x] ?? x).join(", ")}`}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-ink-faint">›</span>
              </Link>
            ))}
            {ownDets.filter((d) => matches(d.name)).length === 0 && (
              <p className="py-3 text-xs text-ink-faint">{q ? "No matches." : "None yet."}</p>
            )}
          </div>
        </div>
      )}

      {mode === "patch" && tab === "datasheets" && (
        <div className="overflow-hidden rounded-md border border-edge">
          <div className="divide-y divide-edge px-3">
            {upstreamUnits.filter((u) => matches(u.name)).map((u) => (
              <Link
                key={u.id}
                to={`/editor/${factionId}/datasheet/${u.id}`}
                className="flex min-h-11 items-center gap-2 text-sm hover:bg-panel active:bg-panel"
              >
                <span className="min-w-0 flex-1 truncate">{u.name}</span>
                {editedSheetIds.has(u.id) && (
                  <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent">
                    edited
                  </span>
                )}
                <span className="shrink-0 text-xs text-ink-faint">edit ›</span>
              </Link>
            ))}
            {upstreamUnits.filter((u) => matches(u.name)).length === 0 && (
              <p className="py-3 text-xs text-ink-faint">No matches.</p>
            )}
          </div>
        </div>
      )}

      {mode === "patch" && tab === "detachments" && (
        <div className="overflow-hidden rounded-md border border-edge">
          <div className="divide-y divide-edge px-3">
            {upstreamDetachments.filter((d) => matches(d.name)).map((d) => (
              <Link
                key={d.id}
                to={`/editor/${factionId}/detachment/${d.id}`}
                className="flex min-h-11 items-center gap-2 text-sm hover:bg-panel active:bg-panel"
              >
                <span className="min-w-0 flex-1 truncate">{d.name}</span>
                {editedDetIds.has(d.id) && (
                  <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent">
                    edited
                  </span>
                )}
                <span className="shrink-0 text-xs text-ink-faint">edit ›</span>
              </Link>
            ))}
            {upstreamDetachments.filter((d) => matches(d.name)).length === 0 && (
              <p className="py-3 text-xs text-ink-faint">No matches.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
