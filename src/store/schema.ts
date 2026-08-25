import type { Roster } from "@alpaca-software/40kdc-data";
import type { RoleHints } from "../lib/normalize";
import type { Overrides } from "../lib/overrides";

export const STORAGE_KEY = "40k-viewer";
export const STORAGE_VERSION = 2;

export type Slot = "mine" | "opponent";

export interface SavedList {
  id: string;
  name: string;
  /** Original pasted text, kept so the list can be re-imported after dataset updates. */
  rawText: string;
  /** Resolved roster JSON — small; dataset views are re-derived each session. */
  roster: Roster;
  overrides: Overrides;
  /** User notes keyed by stratagem/enhancement id — fills the gap where the dataset has no effect text. */
  notes: Record<string, string>;
  /** Leader/support/bodyguard markers recovered from the import. Keyed by roster unit index. */
  roleHints: RoleHints;
  /**
   * Declared character attachments: leader roster-unit index → bodyguard
   * roster-unit index. Seeded from the import where the source declares them,
   * editable in the UI. The bodyguard's sheet surfaces the leader's buffs.
   */
  attachments: Record<string, number>;
  importedAt: string;
  dataVersion: { edition: string; dataslate: string; pkg: string };
}

export interface PersistedState {
  lists: Record<string, SavedList>;
  slots: Record<Slot, string | null>;
  activeSlot: Slot;
}

/** Zustand persist migration hook; versions bump when the shape changes. */
export function migrate(state: unknown, fromVersion: number): PersistedState {
  const s = state as PersistedState;
  if (fromVersion < 2) {
    for (const list of Object.values(s.lists ?? {})) {
      list.roleHints ??= {};
      list.attachments ??= {};
    }
  }
  return s;
}
