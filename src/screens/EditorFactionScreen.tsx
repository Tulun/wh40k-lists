import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Field, SectionCard, SmallButton, TextArea, TextInput } from "../components/editor/fields";
import { useDataset } from "../hooks/useDataset";
import { factionMode, useCodex } from "../store/codex";

/**
 * Editing hub for one faction. Replace mode (the new Ork codex): army rule +
 * hand-built detachments and datasheets. Patch mode (other factions): the
 * upstream records, searchable, with edited copies listed on top.
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

  if (!data) {
    return <p className="py-16 text-center text-xs text-ink-faint">Loading dataset…</p>;
  }

  const armyRule = entry?.mode === "replace" ? entry.armyRule : null;

  const replaceEntry = entry?.mode === "replace" ? entry : null;
  const patchEntry = entry?.mode === "patch" ? entry : null;

  const q = query.trim().toLowerCase();
  const upstreamUnits =
    mode === "patch"
      ? data.units
          .byFaction(factionId)
          .filter((u) => !q || u.name.toLowerCase().includes(q))
          .sort((a, b) => a.name.localeCompare(b.name))
      : [];
  const upstreamDetachments =
    mode === "patch"
      ? data.detachments.byFaction(factionId).filter((d) => !q || d.name.toLowerCase().includes(q))
      : [];

  const editedSheets = patchEntry ? Object.values(patchEntry.datasheets) : [];
  const editedDets = patchEntry ? Object.values(patchEntry.detachments) : [];
  const editedSheetIds = new Set(editedSheets.map((s) => s.id));
  const editedDetIds = new Set(editedDets.map((d) => d.id));

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

      {mode === "replace" && (
        <>
          <SectionCard
            title={`Detachments (${replaceEntry?.detachments.length ?? 0})`}
            actions={
              <Link to={`/editor/${factionId}/detachment/new`} className="text-xs font-semibold text-accent">
                + add
              </Link>
            }
          >
            {(replaceEntry?.detachments ?? []).map((d) => (
              <Link
                key={d.id}
                to={`/editor/${factionId}/detachment/${d.id}`}
                className="flex min-h-10 items-center gap-2 border-t border-edge text-sm first:border-t-0"
              >
                <span className="flex-1 font-medium">{d.name}</span>
                <span className="text-xs text-ink-faint">
                  {d.enhancements.length} enh · {d.stratagems.length} strat ›
                </span>
              </Link>
            ))}
            {(replaceEntry?.detachments.length ?? 0) === 0 && (
              <p className="text-xs text-ink-faint">None yet.</p>
            )}
          </SectionCard>

          <SectionCard
            title={`Datasheets (${replaceEntry?.datasheets.length ?? 0})`}
            actions={
              <Link to={`/editor/${factionId}/datasheet/new`} className="text-xs font-semibold text-accent">
                + add
              </Link>
            }
          >
            {(replaceEntry?.datasheets ?? [])
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((d) => (
                <Link
                  key={d.id}
                  to={`/editor/${factionId}/datasheet/${d.id}`}
                  className="flex min-h-10 items-center gap-2 border-t border-edge text-sm first:border-t-0"
                >
                  <span className="flex-1 font-medium">{d.name}</span>
                  <span className="text-xs text-ink-faint">
                    {d.points.map((p) => `${p.models}×${p.cost}`).join(" / ")} ›
                  </span>
                </Link>
              ))}
            {(replaceEntry?.datasheets.length ?? 0) === 0 && (
              <p className="text-xs text-ink-faint">None yet.</p>
            )}
          </SectionCard>
        </>
      )}

      {mode === "patch" && (
        <>
          {(editedSheets.length > 0 || editedDets.length > 0) && (
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

          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search upstream records…"
            className="w-full rounded-md border border-edge bg-panel px-3 py-2 text-sm"
          />

          <SectionCard title="Upstream detachments">
            {upstreamDetachments.map((d) => (
              <Link
                key={d.id}
                to={`/editor/${factionId}/detachment/${d.id}`}
                className="flex min-h-10 items-center gap-2 border-t border-edge text-sm first:border-t-0"
              >
                <span className="flex-1">{d.name}</span>
                {editedDetIds.has(d.id) && (
                  <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent">
                    edited
                  </span>
                )}
                <span className="text-xs text-ink-faint">edit ›</span>
              </Link>
            ))}
          </SectionCard>

          <SectionCard title="Upstream datasheets">
            {upstreamUnits.map((u) => (
              <Link
                key={u.id}
                to={`/editor/${factionId}/datasheet/${u.id}`}
                className="flex min-h-10 items-center gap-2 border-t border-edge text-sm first:border-t-0"
              >
                <span className="flex-1">{u.name}</span>
                {editedSheetIds.has(u.id) && (
                  <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent">
                    edited
                  </span>
                )}
                <span className="text-xs text-ink-faint">edit ›</span>
              </Link>
            ))}
          </SectionCard>
        </>
      )}
    </div>
  );
}
