import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import DetachmentCard from "../components/DetachmentCard";
import {
  ChipListInput,
  Field,
  ModeToggle,
  NumberInput,
  SectionCard,
  SmallButton,
  TextArea,
  TextInput,
} from "../components/editor/fields";
import RefImagePanel from "../components/editor/RefImagePanel";
import { useDataset } from "../hooks/useDataset";
import type { EditableDetachment, EditableStratagem } from "../lib/codex-model";
import { DISPOSITIONS, slugify, uniqueSlug } from "../lib/codex-model";
import { detachmentView } from "../lib/detachment-view";
import { refImageKey } from "../lib/ref-images";
import { useCodex } from "../store/codex";

const PHASES = ["command", "movement", "shooting", "charge", "fight"] as const;
const TIMINGS: EditableStratagem["timing"][] = [
  "once-per-phase",
  "once-per-turn",
  "once-per-battle",
  "unlimited",
];

function blankDetachment(): EditableDetachment {
  return {
    id: "",
    name: "",
    points: 1,
    dispositions: [],
    ruleName: "",
    ruleText: "",
    enhancements: [],
    stratagems: [],
  };
}

export default function DetachmentEditScreen() {
  const { factionId = "", detId = "new" } = useParams();
  const navigate = useNavigate();
  const data = useDataset();
  const doc = useCodex((s) => s.doc);
  const upsertDetachment = useCodex((s) => s.upsertDetachment);
  const deleteDetachment = useCodex((s) => s.deleteDetachment);

  const entry = doc.factions[factionId];
  const existing = useMemo(() => {
    if (!entry) return null;
    if (entry.mode === "replace") return entry.detachments.find((d) => d.id === detId) ?? null;
    return entry.detachments[detId] ?? null;
  }, [entry, detId]);

  // Editing an untouched upstream detachment in patch mode seeds a copy —
  // including its enhancements and stratagems with their rendered rule text.
  const seeded = useMemo(() => {
    if (existing || detId === "new" || !data) return null;
    return detachmentView(data, factionId, detId);
  }, [existing, detId, data, factionId]);

  const [det, setDet] = useState<EditableDetachment | null>(existing ?? seeded);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">(detId === "new" ? "edit" : "view");
  if (det === null) {
    if (detId === "new") {
      setDet(blankDetachment());
    } else if (seeded) {
      setDet(seeded);
    } else if (data) {
      return (
        <p className="py-16 text-center text-sm text-ink-dim">
          Detachment not found.{" "}
          <Link to={`/editor/${factionId}`} className="underline">
            Back to editor
          </Link>
        </p>
      );
    } else {
      return <p className="py-16 text-center text-xs text-ink-faint">Loading dataset…</p>;
    }
    return null;
  }

  const patch = (p: Partial<EditableDetachment>) => setDet((s) => (s ? { ...s, ...p } : s));

  function save() {
    if (!det || !det.name.trim()) return;
    const taken =
      entry?.mode === "replace" ? entry.detachments.map((d) => d.id) : Object.keys(entry?.detachments ?? {});
    const id = det.id || uniqueSlug(det.name, taken);
    // Give unnamed enhancement/stratagem rows stable detachment-scoped ids.
    const withIds: EditableDetachment = {
      ...det,
      id,
      enhancements: det.enhancements.map((e) => ({ ...e, id: e.id || `${id}--${slugify(e.name)}` })),
      stratagems: det.stratagems.map((s) => ({ ...s, id: s.id || `${id}--${slugify(s.name)}` })),
    };
    upsertDetachment(factionId, withIds);
    navigate(`/editor/${factionId}`);
  }

  return (
    <div className="space-y-3 pb-8">
      <div className="flex items-center gap-2">
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold">
          {detId === "new" ? "New detachment" : det.name || detId}
        </h1>
        <ModeToggle mode={mode} onChange={setMode} />
        <Link to={`/editor/${factionId}`} className="text-xs text-ink-faint underline">
          cancel
        </Link>
      </div>

      {mode === "view" && <DetachmentCard det={det} />}

      {mode === "edit" && (
      <>
      {detId !== "new" && <RefImagePanel entityKey={refImageKey(factionId, "detachment", detId)} />}

      <SectionCard title="Detachment">
        <div className="grid grid-cols-[1fr_8rem] gap-2">
          <Field label="Name">
            <TextInput value={det.name} onChange={(e) => patch({ name: e.target.value })} />
          </Field>
          <Field label="Cost (DP)">
            <TextInput
              value={det.points ?? ""}
              placeholder="?"
              inputMode="numeric"
              onChange={(e) =>
                patch({ points: e.target.value.trim() === "" ? null : Number(e.target.value) })
              }
            />
          </Field>
        </div>
        <Field label="Force disposition">
          <div className="flex flex-wrap gap-3 rounded-md border border-edge bg-panel px-2 py-1.5">
            {DISPOSITIONS.map((d) => (
              <label key={d.id} className="flex items-center gap-1 text-xs text-ink-dim">
                <input
                  type="checkbox"
                  checked={det.dispositions?.includes(d.id) ?? false}
                  onChange={(e) =>
                    patch({
                      dispositions: e.target.checked
                        ? [...(det.dispositions ?? []), d.id]
                        : (det.dispositions ?? []).filter((x) => x !== d.id),
                    })
                  }
                />
                {d.label}
              </label>
            ))}
          </div>
        </Field>
        <Field label="Rule name">
          <TextInput value={det.ruleName} onChange={(e) => patch({ ruleName: e.target.value })} />
        </Field>
        <Field label="Rule text">
          <TextArea
            rows={4}
            value={det.ruleText}
            placeholder="Paraphrased rule text — never verbatim from the book."
            onChange={(e) => patch({ ruleText: e.target.value })}
          />
        </Field>
      </SectionCard>

      <SectionCard
        title="Enhancements"
        actions={
          <SmallButton
            onClick={() =>
              patch({ enhancements: [...det.enhancements, { id: "", name: "", cost: 0, text: "", restrictions: ["Character"] }] })
            }
          >
            + enhancement
          </SmallButton>
        }
      >
        {det.enhancements.length === 0 && <p className="text-xs text-ink-faint">No enhancements yet.</p>}
        {det.enhancements.map((enh, i) => (
          <div key={i} className="space-y-1 border-t border-edge pt-2 first:border-t-0 first:pt-0">
            <div className="grid grid-cols-[1fr_6rem_auto] items-end gap-2">
              <Field label="Name">
                <TextInput
                  value={enh.name}
                  onChange={(e) =>
                    patch({ enhancements: det.enhancements.map((q, j) => (j === i ? { ...q, name: e.target.value } : q)) })
                  }
                />
              </Field>
              <Field label="Cost (pts)">
                <NumberInput
                  value={enh.cost}
                  onValue={(cost) =>
                    patch({ enhancements: det.enhancements.map((q, j) => (j === i ? { ...q, cost } : q)) })
                  }
                />
              </Field>
              <SmallButton
                tone="danger"
                onClick={() => patch({ enhancements: det.enhancements.filter((_, j) => j !== i) })}
              >
                ✕
              </SmallButton>
            </div>
            <Field label="Restricted to">
              <ChipListInput
                value={enh.restrictions}
                onChange={(restrictions) =>
                  patch({ enhancements: det.enhancements.map((q, j) => (j === i ? { ...q, restrictions } : q)) })
                }
                placeholder="Character…"
              />
            </Field>
            <Field label="Excluded keywords">
              <ChipListInput
                value={enh.exclusions ?? []}
                onChange={(exclusions) =>
                  patch({
                    enhancements: det.enhancements.map((q, j) =>
                      j === i ? { ...q, exclusions: exclusions.length ? exclusions : undefined } : q,
                    ),
                  })
                }
                placeholder="Aircraft…"
              />
            </Field>
            <label className="flex items-center gap-2 text-xs text-ink-dim">
              <input
                type="checkbox"
                checked={enh.upgrade ?? false}
                onChange={(e) =>
                  patch({
                    enhancements: det.enhancements.map((q, j) =>
                      j === i ? { ...q, upgrade: e.target.checked || undefined } : q,
                    ),
                  })
                }
              />
              Upgrade — taken by a non-character unit
            </label>
            <TextArea
              value={enh.text}
              placeholder="Paraphrased effect."
              onChange={(e) =>
                patch({ enhancements: det.enhancements.map((q, j) => (j === i ? { ...q, text: e.target.value } : q)) })
              }
            />
          </div>
        ))}
      </SectionCard>

      <SectionCard
        title="Stratagems"
        actions={
          <SmallButton
            onClick={() =>
              patch({
                stratagems: [
                  ...det.stratagems,
                  { id: "", name: "", cpCost: 1, phases: [], playerTurn: "your-turn", timing: "once-per-turn", text: "", requiredKeywords: [] },
                ],
              })
            }
          >
            + stratagem
          </SmallButton>
        }
      >
        {det.stratagems.length === 0 && <p className="text-xs text-ink-faint">No stratagems yet.</p>}
        {det.stratagems.map((strat, i) => {
          const patchStrat = (p: Partial<EditableStratagem>) =>
            patch({ stratagems: det.stratagems.map((q, j) => (j === i ? { ...q, ...p } : q)) });
          return (
            <div key={i} className="space-y-1 border-t border-edge pt-2 first:border-t-0 first:pt-0">
              <div className="grid grid-cols-[1fr_5rem_auto] items-end gap-2">
                <Field label="Name">
                  <TextInput value={strat.name} onChange={(e) => patchStrat({ name: e.target.value })} />
                </Field>
                <Field label="CP">
                  <NumberInput value={strat.cpCost} onValue={(cpCost) => patchStrat({ cpCost })} />
                </Field>
                <SmallButton
                  tone="danger"
                  onClick={() => patch({ stratagems: det.stratagems.filter((_, j) => j !== i) })}
                >
                  ✕
                </SmallButton>
              </div>
              <div className="flex flex-wrap gap-2">
                {PHASES.map((phase) => (
                  <label key={phase} className="flex items-center gap-1 text-xs text-ink-dim">
                    <input
                      type="checkbox"
                      checked={strat.phases.includes(phase)}
                      onChange={(e) =>
                        patchStrat({
                          phases: e.target.checked
                            ? [...strat.phases, phase]
                            : strat.phases.filter((p) => p !== phase),
                        })
                      }
                    />
                    {phase}
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Turn">
                  <select
                    value={strat.playerTurn}
                    onChange={(e) => patchStrat({ playerTurn: e.target.value as EditableStratagem["playerTurn"] })}
                    className="w-full rounded-md border border-edge bg-panel px-2 py-1.5 text-sm"
                  >
                    <option value="your-turn">Your turn</option>
                    <option value="opponent-turn">Opponent's turn</option>
                    <option value="either">Either</option>
                  </select>
                </Field>
                <Field label="Timing">
                  <select
                    value={strat.timing}
                    onChange={(e) => patchStrat({ timing: e.target.value as EditableStratagem["timing"] })}
                    className="w-full rounded-md border border-edge bg-panel px-2 py-1.5 text-sm"
                  >
                    {TIMINGS.map((t) => (
                      <option key={t} value={t}>
                        {t.replace(/-/g, " ")}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Targets (required keywords)">
                <ChipListInput
                  value={strat.requiredKeywords}
                  onChange={(requiredKeywords) => patchStrat({ requiredKeywords })}
                  placeholder="Orks, Infantry…"
                />
              </Field>
              <TextArea
                value={strat.text}
                placeholder="Paraphrased effect."
                onChange={(e) => patchStrat({ text: e.target.value })}
              />
            </div>
          );
        })}
      </SectionCard>
      </>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={!det.name.trim()}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Save detachment
        </button>
        {existing &&
          (confirmDelete ? (
            <SmallButton
              tone="danger"
              onClick={() => {
                deleteDetachment(factionId, det.id);
                navigate(`/editor/${factionId}`);
              }}
            >
              Really delete?
            </SmallButton>
          ) : (
            <SmallButton tone="danger" onClick={() => setConfirmDelete(true)}>
              Delete
            </SmallButton>
          ))}
      </div>
    </div>
  );
}
