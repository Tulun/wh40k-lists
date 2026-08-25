import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ChipListInput,
  Field,
  NumberInput,
  SectionCard,
  SmallButton,
  StatInput,
  TextArea,
  TextInput,
} from "../components/editor/fields";
import RefImagePanel from "../components/editor/RefImagePanel";
import { useDataset } from "../hooks/useDataset";
import type {
  EditableDatasheet,
  EditableWeapon,
  EditableWeaponProfile,
} from "../lib/codex-model";
import { seedDatasheetFromUpstream, uniqueSlug } from "../lib/codex-model";
import { refImageKey } from "../lib/ref-images";
import { useCodex } from "../store/codex";

const ROLES: { value: EditableDatasheet["role"]; label: string }[] = [
  { value: "", label: "Other" },
  { value: "epic-hero", label: "Epic Hero" },
  { value: "character", label: "Character" },
  { value: "battleline", label: "Battleline" },
  { value: "dedicated-transport", label: "Dedicated Transport" },
  { value: "fortification", label: "Fortification" },
];

function blankSheet(factionKeyword: string): EditableDatasheet {
  return {
    id: "",
    name: "",
    role: "",
    profiles: [{ M: 6, T: 4, W: 1, Sv: 4, invuln: null, Ld: 7, OC: 1 }],
    keywords: ["Infantry"],
    factionKeywords: factionKeyword ? [factionKeyword] : [],
    points: [{ models: 1, cost: 0 }],
    weapons: [],
    abilities: [],
    leads: [],
  };
}

function blankWeaponProfile(): EditableWeaponProfile {
  return { range: 12, A: 1, skill: 4, S: 4, AP: 0, D: 1, keywords: [] };
}

export default function DatasheetEditScreen() {
  const { factionId = "", sheetId = "new" } = useParams();
  const navigate = useNavigate();
  const data = useDataset();
  const doc = useCodex((s) => s.doc);
  const upsertDatasheet = useCodex((s) => s.upsertDatasheet);
  const deleteDatasheet = useCodex((s) => s.deleteDatasheet);

  const entry = doc.factions[factionId];
  const existing = useMemo(() => {
    if (!entry) return null;
    if (entry.mode === "replace") return entry.datasheets.find((d) => d.id === sheetId) ?? null;
    return entry.datasheets[sheetId] ?? null;
  }, [entry, sheetId]);

  const factionName = data?.factions.getAny(factionId)?.name ?? factionId;

  // Editing an untouched upstream record in patch mode seeds an editable copy.
  const seeded = useMemo(() => {
    if (existing || sheetId === "new" || !data) return null;
    const view = data.units.getInFaction(sheetId, factionId);
    if (!view) return null;
    const leads = data.dataset.bodyguardsAttachableFrom(sheetId).map((u) => u.id);
    return seedDatasheetFromUpstream(view, leads);
  }, [existing, sheetId, data, factionId]);

  const [sheet, setSheet] = useState<EditableDatasheet | null>(existing ?? seeded);
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (sheet === null) {
    if (sheetId === "new") {
      setSheet(blankSheet(factionName));
    } else if (seeded) {
      setSheet(seeded);
    } else if (data) {
      return (
        <p className="py-16 text-center text-sm text-ink-dim">
          Datasheet not found.{" "}
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

  const patch = (p: Partial<EditableDatasheet>) => setSheet((s) => (s ? { ...s, ...p } : s));
  const patchWeapon = (i: number, p: Partial<EditableWeapon>) =>
    patch({ weapons: sheet.weapons.map((w, j) => (j === i ? { ...w, ...p } : w)) });

  const isCharacter = sheet.role === "character" || sheet.role === "epic-hero";
  const factionSheets =
    data?.units
      .byFaction(factionId)
      .map((u) => ({ id: u.id, name: u.name }))
      .filter((u) => u.id !== sheet.id) ?? [];

  function save() {
    if (!sheet || !sheet.name.trim()) return;
    let id = sheet.id;
    if (!id) {
      const taken =
        entry?.mode === "replace"
          ? entry.datasheets.map((d) => d.id)
          : Object.keys(entry?.datasheets ?? {});
      id = uniqueSlug(sheet.name, taken);
    }
    upsertDatasheet(factionId, { ...sheet, id });
    navigate(`/editor/${factionId}`);
  }

  return (
    <div className="space-y-3 pb-8">
      <div className="flex items-baseline gap-2">
        <h1 className="flex-1 text-lg font-bold">
          {sheetId === "new" ? "New datasheet" : `Edit · ${sheet.name || sheetId}`}
        </h1>
        <Link to={`/editor/${factionId}`} className="text-xs text-ink-faint underline">
          cancel
        </Link>
      </div>

      {sheetId !== "new" && <RefImagePanel entityKey={refImageKey(factionId, "datasheet", sheetId)} />}

      <SectionCard title="Basics">
        <div className="grid grid-cols-[1fr_10rem] gap-2">
          <Field label="Name">
            <TextInput value={sheet.name} onChange={(e) => patch({ name: e.target.value })} />
          </Field>
          <Field label="Role">
            <select
              value={sheet.role}
              onChange={(e) => patch({ role: e.target.value as EditableDatasheet["role"] })}
              className="w-full rounded-md border border-edge bg-panel px-2 py-1.5 text-sm"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Keywords">
          <ChipListInput
            value={sheet.keywords}
            onChange={(keywords) => patch({ keywords })}
            placeholder="Infantry, Mob, Grenades…"
          />
        </Field>
        <Field label="Faction keywords">
          <ChipListInput
            value={sheet.factionKeywords}
            onChange={(factionKeywords) => patch({ factionKeywords })}
            placeholder={factionName}
          />
        </Field>
      </SectionCard>

      <SectionCard
        title="Statlines"
        actions={
          <SmallButton
            onClick={() =>
              patch({ profiles: [...sheet.profiles, { ...sheet.profiles[sheet.profiles.length - 1] }] })
            }
          >
            + profile
          </SmallButton>
        }
      >
        {sheet.profiles.map((p, i) => (
          <div key={i} className="space-y-1 border-t border-edge pt-2 first:border-t-0 first:pt-0">
            <div className="flex items-center gap-2">
              <TextInput
                value={p.name ?? ""}
                placeholder={sheet.profiles.length > 1 ? "Model name" : "Model name (optional)"}
                onChange={(e) =>
                  patch({
                    profiles: sheet.profiles.map((q, j) =>
                      j === i ? { ...q, name: e.target.value || undefined } : q,
                    ),
                  })
                }
              />
              {sheet.profiles.length > 1 && (
                <SmallButton tone="danger" onClick={() => patch({ profiles: sheet.profiles.filter((_, j) => j !== i) })}>
                  ✕
                </SmallButton>
              )}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {(
                [
                  ["M", "M"],
                  ["T", "T"],
                  ["W", "W"],
                  ["Sv", "SV"],
                  ["invuln", "INV"],
                  ["Ld", "LD"],
                  ["OC", "OC"],
                ] as const
              ).map(([key, label]) => (
                <Field key={key} label={label}>
                  {key === "M" ? (
                    <StatInput
                      value={p.M}
                      onValue={(M) =>
                        patch({ profiles: sheet.profiles.map((q, j) => (j === i ? { ...q, M } : q)) })
                      }
                    />
                  ) : key === "invuln" ? (
                    <TextInput
                      value={p.invuln ?? ""}
                      placeholder="—"
                      inputMode="numeric"
                      onChange={(e) =>
                        patch({
                          profiles: sheet.profiles.map((q, j) =>
                            j === i
                              ? { ...q, invuln: e.target.value.trim() === "" ? null : Number(e.target.value) }
                              : q,
                          ),
                        })
                      }
                    />
                  ) : (
                    <NumberInput
                      value={p[key]}
                      onValue={(n) =>
                        patch({ profiles: sheet.profiles.map((q, j) => (j === i ? { ...q, [key]: n } : q)) })
                      }
                    />
                  )}
                </Field>
              ))}
            </div>
          </div>
        ))}
      </SectionCard>

      <SectionCard
        title="Points"
        actions={
          <SmallButton
            onClick={() => {
              const last = sheet.points[sheet.points.length - 1];
              patch({ points: [...sheet.points, { models: (last?.models ?? 0) * 2 || 1, cost: (last?.cost ?? 0) * 2 }] });
            }}
          >
            + tier
          </SmallButton>
        }
      >
        {sheet.points.map((tier, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
            <Field label="Models">
              <NumberInput
                value={tier.models}
                fallback={1}
                onValue={(models) =>
                  patch({ points: sheet.points.map((t, j) => (j === i ? { ...t, models } : t)) })
                }
              />
            </Field>
            <Field label="Cost (pts)">
              <NumberInput
                value={tier.cost}
                onValue={(cost) =>
                  patch({ points: sheet.points.map((t, j) => (j === i ? { ...t, cost } : t)) })
                }
              />
            </Field>
            <SmallButton tone="danger" onClick={() => patch({ points: sheet.points.filter((_, j) => j !== i) })}>
              ✕
            </SmallButton>
          </div>
        ))}
      </SectionCard>

      <SectionCard
        title="Weapons"
        actions={
          <SmallButton
            onClick={() =>
              patch({ weapons: [...sheet.weapons, { name: "", type: "ranged", profiles: [blankWeaponProfile()] }] })
            }
          >
            + weapon
          </SmallButton>
        }
      >
        {sheet.weapons.length === 0 && <p className="text-xs text-ink-faint">No weapons yet.</p>}
        {sheet.weapons.map((w, i) => (
          <div key={i} className="space-y-2 rounded-md border border-edge p-2">
            <div className="grid grid-cols-[1fr_7rem_auto] items-end gap-2">
              <Field label="Weapon name">
                <TextInput value={w.name} onChange={(e) => patchWeapon(i, { name: e.target.value })} />
              </Field>
              <Field label="Type">
                <select
                  value={w.type}
                  onChange={(e) => patchWeapon(i, { type: e.target.value as EditableWeapon["type"] })}
                  className="w-full rounded-md border border-edge bg-panel px-2 py-1.5 text-sm"
                >
                  <option value="ranged">Ranged</option>
                  <option value="melee">Melee</option>
                </select>
              </Field>
              <SmallButton tone="danger" onClick={() => patch({ weapons: sheet.weapons.filter((_, j) => j !== i) })}>
                ✕
              </SmallButton>
            </div>
            {w.profiles.map((p, pi) => (
              <div key={pi} className="space-y-1 border-t border-edge pt-2">
                {w.profiles.length > 1 && (
                  <div className="flex items-center gap-2">
                    <TextInput
                      value={p.name ?? ""}
                      placeholder="Profile name (e.g. strike / sweep)"
                      onChange={(e) =>
                        patchWeapon(i, {
                          profiles: w.profiles.map((q, j) => (j === pi ? { ...q, name: e.target.value || undefined } : q)),
                        })
                      }
                    />
                    <SmallButton
                      tone="danger"
                      onClick={() => patchWeapon(i, { profiles: w.profiles.filter((_, j) => j !== pi) })}
                    >
                      ✕
                    </SmallButton>
                  </div>
                )}
                <div className="grid grid-cols-6 gap-1">
                  {w.type === "ranged" && (
                    <Field label="Range">
                      <StatInput
                        value={p.range === "Melee" ? "" : p.range}
                        onValue={(v) =>
                          patchWeapon(i, {
                            profiles: w.profiles.map((q, j) =>
                              j === pi ? { ...q, range: typeof v === "number" ? v : 12 } : q,
                            ),
                          })
                        }
                      />
                    </Field>
                  )}
                  {(
                    [
                      ["A", "A"],
                      ["skill", w.type === "melee" ? "WS" : "BS"],
                      ["S", "S"],
                      ["AP", "AP"],
                      ["D", "D"],
                    ] as const
                  ).map(([key, label]) => (
                    <Field key={key} label={label}>
                      {key === "skill" ? (
                        <TextInput
                          value={p.skill ?? ""}
                          placeholder="—"
                          inputMode="numeric"
                          onChange={(e) =>
                            patchWeapon(i, {
                              profiles: w.profiles.map((q, j) =>
                                j === pi
                                  ? { ...q, skill: e.target.value.trim() === "" ? null : Number(e.target.value) }
                                  : q,
                              ),
                            })
                          }
                        />
                      ) : key === "AP" ? (
                        <NumberInput
                          value={p.AP}
                          onValue={(n) =>
                            patchWeapon(i, {
                              profiles: w.profiles.map((q, j) => (j === pi ? { ...q, AP: n } : q)),
                            })
                          }
                        />
                      ) : (
                        <StatInput
                          value={p[key]}
                          onValue={(v) =>
                            patchWeapon(i, {
                              profiles: w.profiles.map((q, j) => (j === pi ? { ...q, [key]: v } : q)),
                            })
                          }
                        />
                      )}
                    </Field>
                  ))}
                </div>
                <Field label="Weapon keywords">
                  <ChipListInput
                    value={p.keywords}
                    onChange={(keywords) =>
                      patchWeapon(i, {
                        profiles: w.profiles.map((q, j) => (j === pi ? { ...q, keywords } : q)),
                      })
                    }
                    placeholder="Sustained Hits 1, Anti-Vehicle 4+…"
                  />
                </Field>
              </div>
            ))}
            <SmallButton onClick={() => patchWeapon(i, { profiles: [...w.profiles, blankWeaponProfile()] })}>
              + profile
            </SmallButton>
          </div>
        ))}
      </SectionCard>

      <SectionCard
        title="Abilities"
        actions={
          <SmallButton onClick={() => patch({ abilities: [...sheet.abilities, { name: "", text: "" }] })}>
            + ability
          </SmallButton>
        }
      >
        {sheet.abilities.length === 0 && <p className="text-xs text-ink-faint">No abilities yet.</p>}
        {sheet.abilities.map((a, i) => (
          <div key={i} className="space-y-1 border-t border-edge pt-2 first:border-t-0 first:pt-0">
            <div className="flex items-center gap-2">
              <TextInput
                value={a.name}
                placeholder="Ability name"
                onChange={(e) =>
                  patch({ abilities: sheet.abilities.map((q, j) => (j === i ? { ...q, name: e.target.value } : q)) })
                }
              />
              <label className="flex shrink-0 items-center gap-1 text-xs text-ink-dim">
                <input
                  type="checkbox"
                  checked={a.core ?? false}
                  onChange={(e) =>
                    patch({
                      abilities: sheet.abilities.map((q, j) =>
                        j === i ? { ...q, core: e.target.checked || undefined } : q,
                      ),
                    })
                  }
                />
                core
              </label>
              <SmallButton tone="danger" onClick={() => patch({ abilities: sheet.abilities.filter((_, j) => j !== i) })}>
                ✕
              </SmallButton>
            </div>
            {!a.core && (
              <TextArea
                value={a.text}
                placeholder="Paraphrased rule text — never verbatim from the book."
                onChange={(e) =>
                  patch({ abilities: sheet.abilities.map((q, j) => (j === i ? { ...q, text: e.target.value } : q)) })
                }
              />
            )}
          </div>
        ))}
      </SectionCard>

      {isCharacter && (
        <SectionCard title="Can lead">
          {factionSheets.length === 0 ? (
            <p className="text-xs text-ink-faint">No other datasheets in this faction yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-1">
              {factionSheets.map((u) => (
                <label key={u.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={sheet.leads.includes(u.id)}
                    onChange={(e) =>
                      patch({
                        leads: e.target.checked
                          ? [...sheet.leads, u.id]
                          : sheet.leads.filter((l) => l !== u.id),
                      })
                    }
                  />
                  <span className="truncate">{u.name}</span>
                </label>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={!sheet.name.trim()}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Save datasheet
        </button>
        {existing &&
          (confirmDelete ? (
            <SmallButton
              tone="danger"
              onClick={() => {
                deleteDatasheet(factionId, sheet.id);
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
