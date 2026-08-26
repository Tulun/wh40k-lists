import type { Roster } from "@alpaca-software/40kdc-data";
import type { RoleHints } from "../lib/normalize";
import type { Overrides } from "../lib/overrides";

export const STORAGE_KEY = "40k-viewer";
export const STORAGE_VERSION = 4;

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
  /**
   * Stamp of the last edit to THIS list, letting sync merge diverged devices
   * per list (newest copy of each wins) instead of all-or-nothing. Optional
   * because remote files written by older app versions lack it; merging falls
   * back to `importedAt`.
   */
  updated?: string;
}

export interface ListsSyncState {
  lastSynced: string | null;
  /** Remote lists.json `updated` stamp as of the last successful sync — the conflict baseline. */
  remoteUpdated: string | null;
  /**
   * List ids present at the last successful sync. Lets the merge tell a list
   * deleted on one side (id known, missing there) from a list newly created on
   * the other (id unknown), so deletions propagate without resurrections.
   */
  knownIds: string[];
}

export interface PersistedState {
  lists: Record<string, SavedList>;
  slots: Record<Slot, string | null>;
  activeSlot: Slot;
  /** Stamp of the last list/slot mutation on this device — the sync conflict token. */
  updated: string | null;
  /** Local changes not yet pushed to the gist. */
  dirty: boolean;
  sync: ListsSyncState;
}

/**
 * The shape of `lists.json` in the sync gist (same gist as the codex doc).
 * `activeSlot` stays device-local; lists and slot assignments travel.
 */
export interface RemoteLists {
  version: 1;
  updated: string;
  lists: Record<string, SavedList>;
  slots: Record<Slot, string | null>;
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
  if (fromVersion < 3) {
    s.updated ??= null;
    s.dirty ??= false;
    s.sync ??= { lastSynced: null, remoteUpdated: null, knownIds: [] };
  }
  if (fromVersion < 4) {
    for (const list of Object.values(s.lists ?? {})) list.updated ??= list.importedAt;
    // Best available baseline: if this device has synced before, everything it
    // holds now was part of that sync.
    s.sync.knownIds ??= s.sync.remoteUpdated !== null ? Object.keys(s.lists ?? {}) : [];
  }
  return s;
}
