/**
 * The editable codex document + gist sync state. The doc is the single source
 * of truth for hand-authored data; a cached copy persists locally (key
 * "40k-viewer-codex") so the app works offline, and gist-sync.ts pushes/pulls
 * the remote copy.
 *
 * Every mutation clones the doc (structuredClone — the doc is small), stamps
 * `updated`, and marks the store dirty; `useDataset` rebuilds the merged
 * dataset when the doc reference changes, so edits appear app-wide on Save
 * with no reload.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  CodexDoc,
  EditableDatasheet,
  EditableDetachment,
  FactionEntry,
} from "../lib/codex-model";
import { emptyCodexDoc } from "../lib/codex-model";
import { REPLACE_FACTION_IDS } from "../lib/flags";

export const CODEX_STORAGE_KEY = "40k-viewer-codex";
const CODEX_STORAGE_VERSION = 1;

export interface SyncConfig {
  gistId: string | null;
  /** GitHub token with gist scope; entered by the user, stays on this device. */
  token: string | null;
  lastSynced: string | null;
  /** The remote doc's `updated` stamp as of the last successful sync — the conflict baseline. */
  remoteUpdated: string | null;
}

interface CodexStore {
  doc: CodexDoc;
  sync: SyncConfig;
  /** Local changes not yet pushed to the gist. */
  dirty: boolean;

  upsertDatasheet(factionId: string, sheet: EditableDatasheet): void;
  deleteDatasheet(factionId: string, id: string): void;
  upsertDetachment(factionId: string, det: EditableDetachment): void;
  deleteDetachment(factionId: string, id: string): void;
  setArmyRule(factionId: string, rule: { name: string; text: string } | null): void;
  setFactionName(factionId: string, name: string): void;
  /** Replace the whole doc (remote pull, or Claude-transcribed update). */
  setDoc(doc: CodexDoc, opts?: { markClean?: boolean }): void;
  setSyncConfig(config: Partial<Pick<SyncConfig, "gistId" | "token">>): void;
  markSynced(at: string, remoteUpdated: string): void;
}

/** Which mode a faction entry gets when first edited. */
export function factionMode(factionId: string): "replace" | "patch" {
  return REPLACE_FACTION_IDS.includes(factionId) ? "replace" : "patch";
}

function ensureEntry(doc: CodexDoc, factionId: string, factionName: string): FactionEntry {
  let entry = doc.factions[factionId];
  if (!entry) {
    entry =
      factionMode(factionId) === "replace"
        ? { mode: "replace", name: factionName, armyRule: null, datasheets: [], detachments: [] }
        : { mode: "patch", datasheets: {}, detachments: {} };
    doc.factions[factionId] = entry;
  }
  return entry;
}

function mutated(doc: CodexDoc): CodexDoc {
  doc.updated = new Date().toISOString();
  return doc;
}

export const useCodex = create<CodexStore>()(
  persist(
    (set) => {
      /** Clone → mutate → stamp, as a single set() helper. */
      const update = (fn: (doc: CodexDoc) => void) =>
        set((s) => {
          const doc = structuredClone(s.doc);
          fn(doc);
          return { doc: mutated(doc), dirty: true };
        });

      return {
        doc: emptyCodexDoc(),
        sync: { gistId: null, token: null, lastSynced: null, remoteUpdated: null },
        dirty: false,

        upsertDatasheet: (factionId, sheet) =>
          update((doc) => {
            const entry = ensureEntry(doc, factionId, factionId);
            if (entry.mode === "replace") {
              const i = entry.datasheets.findIndex((d) => d.id === sheet.id);
              if (i >= 0) entry.datasheets[i] = sheet;
              else entry.datasheets.push(sheet);
            } else {
              entry.datasheets[sheet.id] = sheet;
            }
          }),

        deleteDatasheet: (factionId, id) =>
          update((doc) => {
            const entry = doc.factions[factionId];
            if (!entry) return;
            if (entry.mode === "replace") {
              entry.datasheets = entry.datasheets.filter((d) => d.id !== id);
              for (const d of entry.datasheets) d.leads = d.leads.filter((l) => l !== id);
            } else {
              delete entry.datasheets[id];
            }
          }),

        upsertDetachment: (factionId, det) =>
          update((doc) => {
            const entry = ensureEntry(doc, factionId, factionId);
            if (entry.mode === "replace") {
              const i = entry.detachments.findIndex((d) => d.id === det.id);
              if (i >= 0) entry.detachments[i] = det;
              else entry.detachments.push(det);
            } else {
              entry.detachments[det.id] = det;
            }
          }),

        deleteDetachment: (factionId, id) =>
          update((doc) => {
            const entry = doc.factions[factionId];
            if (!entry) return;
            if (entry.mode === "replace") {
              entry.detachments = entry.detachments.filter((d) => d.id !== id);
            } else {
              delete entry.detachments[id];
            }
          }),

        setArmyRule: (factionId, rule) =>
          update((doc) => {
            const entry = ensureEntry(doc, factionId, factionId);
            if (entry.mode === "replace") entry.armyRule = rule;
          }),

        setFactionName: (factionId, name) =>
          update((doc) => {
            const entry = ensureEntry(doc, factionId, name);
            if (entry.mode === "replace") entry.name = name;
          }),

        setDoc: (doc, opts) => set({ doc, dirty: !(opts?.markClean ?? false) }),

        setSyncConfig: (config) =>
          set((s) => ({ sync: { ...s.sync, ...config } })),

        markSynced: (at, remoteUpdated) =>
          set((s) => ({ sync: { ...s.sync, lastSynced: at, remoteUpdated }, dirty: false })),
      };
    },
    {
      name: CODEX_STORAGE_KEY,
      version: CODEX_STORAGE_VERSION,
    },
  ),
);

// Multi-tab sync, same rationale as store/lists.ts: persist writes the whole
// state, so re-read whenever another tab writes it.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === CODEX_STORAGE_KEY) void useCodex.persist.rehydrate();
  });
}

/** Badge state for a faction: fully replaced, patched, or untouched. */
export function codexBadge(doc: CodexDoc, factionId: string): "replace" | "patched" | null {
  const entry = doc.factions[factionId];
  if (!entry) return null;
  if (entry.mode === "replace") {
    return entry.datasheets.length > 0 || entry.detachments.length > 0 || entry.armyRule
      ? "replace"
      : null;
  }
  return Object.keys(entry.datasheets).length > 0 || Object.keys(entry.detachments).length > 0
    ? "patched"
    : null;
}
