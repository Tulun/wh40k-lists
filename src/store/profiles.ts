/**
 * Saved Math-calculator attacker profiles — a whole attacker setup (unit, size,
 * loadout, attached leader + their loadout, detachment, ability toggles and
 * manual modifiers) under a name, e.g. "Libby + 10 Paladins".
 *
 * Persists locally (key "40k-viewer-profiles") and syncs through the gist as
 * `profiles.json`, merged per profile exactly like saved lists: each profile
 * is an independent document, newest copy wins, deletions tracked through the
 * known-ids baseline. The same cross-tab write guard as store/lists.ts applies.
 */
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type { ModifierState } from "../lib/crunch";

export interface CrunchProfile {
  id: string;
  name: string;
  factionId: string | null;
  unitId: string;
  models: number;
  /** Weapon id → squad-wide count. */
  counts: Record<string, number>;
  leaderId: string | null;
  leaderCounts: Record<string, number>;
  detachmentId: string | null;
  /** Ability/stratagem lever overrides (lever id → on/off). */
  levers: Record<string, boolean>;
  modifiers: ModifierState;
  /** Stamp of the last edit to THIS profile — the per-profile merge key. */
  updated: string;
}

export const PROFILES_STORAGE_KEY = "40k-viewer-profiles";
const PROFILES_STORAGE_VERSION = 2;

export interface ProfilesSyncState {
  lastSynced: string | null;
  /** Remote profiles.json `updated` stamp as of the last successful sync. */
  remoteUpdated: string | null;
  /** Profile ids present at the last sync — tells deletions from creations. */
  knownIds: string[];
}

/** The shape of `profiles.json` in the sync gist. */
export interface RemoteProfiles {
  version: 1;
  updated: string;
  profiles: Record<string, CrunchProfile>;
}

interface PersistedProfiles {
  profiles: Record<string, CrunchProfile>;
  /** Stamp of the last profile mutation on this device — the sync conflict token. */
  updated: string | null;
  /** Local changes not yet pushed to the gist. */
  dirty: boolean;
  sync: ProfilesSyncState;
}

interface ProfilesStore extends PersistedProfiles {
  saveProfile(profile: Omit<CrunchProfile, "updated">): void;
  deleteProfile(id: string): void;
  /** Replace profiles wholesale from the remote copy. */
  adoptRemote(remote: RemoteProfiles): void;
  /** Install a local+remote merge, adopting the remote baseline; stays dirty so it pushes. */
  adoptMerged(profiles: Record<string, CrunchProfile>, remoteUpdated: string): void;
  /** Record a completed sync of exactly `synced` (see store/lists.ts markSynced). */
  markSynced(
    at: string,
    remoteUpdated: string,
    synced: { ids: string[]; localUpdated: string | null },
  ): void;
}

let lastSeenRaw: string | null = null;

const trackedStorage: StateStorage = {
  getItem: (name) => {
    const value = globalThis.localStorage?.getItem(name) ?? null;
    lastSeenRaw = value;
    return value;
  },
  setItem: (name, value) => {
    globalThis.localStorage?.setItem(name, value);
    lastSeenRaw = value;
  },
  removeItem: (name) => {
    globalThis.localStorage?.removeItem(name);
    lastSeenRaw = null;
  },
};

/** Rehydrate before writing when another tab wrote since we last saw storage. */
export function absorbForeignProfileWrites(): void {
  try {
    const raw = globalThis.localStorage?.getItem(PROFILES_STORAGE_KEY) ?? null;
    if (raw !== null && raw !== lastSeenRaw) void useProfiles.persist.rehydrate();
  } catch {
    // Storage unavailable (private mode) — then no other tab can write either.
  }
}

export const useProfiles = create<ProfilesStore>()(
  persist(
    (set) => {
      const update = (fn: (s: ProfilesStore, now: string) => Partial<PersistedProfiles>) => {
        absorbForeignProfileWrites();
        set((s) => {
          const now = new Date().toISOString();
          return { ...fn(s, now), updated: now, dirty: true };
        });
      };

      return {
        profiles: {},
        updated: null,
        dirty: false,
        sync: { lastSynced: null, remoteUpdated: null, knownIds: [] },

        saveProfile: (profile) =>
          update((s, now) => ({
            profiles: { ...s.profiles, [profile.id]: { ...profile, updated: now } },
          })),

        deleteProfile: (id) =>
          update((s) => {
            const profiles = { ...s.profiles };
            delete profiles[id];
            return { profiles };
          }),

        adoptRemote: (remote) =>
          set({ profiles: remote.profiles, updated: remote.updated, dirty: false }),

        adoptMerged: (profiles, remoteUpdated) =>
          set((s) => ({
            profiles,
            updated: new Date().toISOString(),
            dirty: true,
            sync: { ...s.sync, remoteUpdated },
          })),

        markSynced: (at, remoteUpdated, synced) => {
          absorbForeignProfileWrites();
          set((s) => ({
            sync: { lastSynced: at, remoteUpdated, knownIds: synced.ids },
            dirty: s.updated === synced.localUpdated ? false : s.dirty,
          }));
        },
      };
    },
    {
      name: PROFILES_STORAGE_KEY,
      version: PROFILES_STORAGE_VERSION,
      storage: createJSONStorage(() => trackedStorage),
      migrate: (state, fromVersion) => {
        const s = state as PersistedProfiles;
        if (fromVersion < 2) {
          // v1 was device-local only: everything it holds is unsynced.
          const hasAny = Object.keys(s.profiles ?? {}).length > 0;
          s.updated ??= hasAny ? new Date().toISOString() : null;
          s.dirty ??= hasAny;
          s.sync ??= { lastSynced: null, remoteUpdated: null, knownIds: [] };
        }
        return s;
      },
    },
  ),
);

// Keep a live tab fresh when another tab writes.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === PROFILES_STORAGE_KEY) void useProfiles.persist.rehydrate();
  });
}
