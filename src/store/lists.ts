import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import {
  STORAGE_KEY,
  STORAGE_VERSION,
  migrate,
  type PersistedState,
  type RemoteLists,
  type SavedList,
  type Slot,
} from "./schema";

// ---------------------------------------------------------------------------
// Cross-tab write safety. zustand persist writes the WHOLE state on every
// change, so a tab holding stale state would silently clobber a list imported
// in another tab. The `storage` event listener at the bottom keeps a live tab
// fresh, but a frozen background tab (Chrome tab freezing, a suspended PWA
// window) misses those events entirely and they are NOT replayed on unfreeze —
// its next write (even sync bookkeeping like markSynced) would erase newer
// lists. So every writer also re-reads storage right before writing whenever
// some other tab wrote since this one last touched it.

/** The last raw persisted string this tab read or wrote; anything else in storage came from another tab. */
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

/**
 * Rehydrate first when another tab wrote storage since we last saw it, so the
 * upcoming write builds on that tab's state instead of erasing it. Rehydration
 * is synchronous (localStorage), so callers may mutate right after. Called
 * before every store mutation, and by gist-sync before it reads store state
 * to make pull/push decisions.
 */
export function absorbForeignWrites(): void {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
    if (raw !== null && raw !== lastSeenRaw) void useLists.persist.rehydrate();
  } catch {
    // Storage unavailable (private mode) — then no other tab can write either.
  }
}

interface ListsStore extends PersistedState {
  saveList(list: SavedList): void;
  deleteList(id: string): void;
  renameList(id: string, name: string): void;
  /** Patch a list's editable content (roster/roleHints/attachments/rawText/name) in place. */
  updateListContent(
    id: string,
    patch: Partial<Pick<SavedList, "roster" | "roleHints" | "attachments" | "rawText" | "name">>,
  ): void;
  assignSlot(slot: Slot, listId: string | null): void;
  setActiveSlot(slot: Slot): void;
  setNote(listId: string, entityId: string, note: string): void;
  /** Declare/clear which unit a character (by roster index) is attached to. */
  setAttachment(listId: string, leaderIndex: number, bodyguardIndex: number | null): void;

  /** Replace lists/slots wholesale from the remote copy; keeps activeSlot. */
  adoptRemote(remote: RemoteLists): void;
  /**
   * Install a merge of local + remote (computed by gist-sync), adopting the
   * remote stamp as the new baseline and leaving the store dirty so the merged
   * result gets pushed back.
   */
  adoptMerged(
    merged: Pick<RemoteLists, "lists" | "slots">,
    remoteUpdated: string,
  ): void;
  /**
   * Record a completed sync. `synced` describes the exact copy that was pushed
   * or adopted — its list ids become the deletion baseline, and the dirty flag
   * only clears while the store still matches that copy (a mutation that
   * landed while the push was in flight keeps the store dirty so it pushes
   * again; marking it clean-and-known would let the next clean pull delete it).
   */
  markSynced(
    at: string,
    remoteUpdated: string,
    synced: { ids: string[]; localUpdated: string | null },
  ): void;
}

export const useLists = create<ListsStore>()(
  persist(
    (set) => {
      /** Apply a content mutation, stamping the sync token — unless it was a no-op. */
      const update = (fn: (s: ListsStore, now: string) => Partial<PersistedState> | ListsStore) => {
        absorbForeignWrites();
        set((s) => {
          const now = new Date().toISOString();
          const patch = fn(s, now);
          if (patch === s) return s;
          return { ...patch, updated: now, dirty: true };
        });
      };

      return {
        lists: {},
        slots: { mine: null, opponent: null },
        activeSlot: "mine" as Slot,
        updated: null,
        dirty: false,
        sync: { lastSynced: null, remoteUpdated: null, knownIds: [] },

        saveList: (list) =>
          update((s, now) => ({ lists: { ...s.lists, [list.id]: { ...list, updated: now } } })),

        deleteList: (id) =>
          update((s) => {
            const lists = { ...s.lists };
            delete lists[id];
            const slots = { ...s.slots };
            for (const slot of ["mine", "opponent"] as const) {
              if (slots[slot] === id) slots[slot] = null;
            }
            return { lists, slots };
          }),

        renameList: (id, name) =>
          update((s, now) => {
            const list = s.lists[id];
            if (!list) return s;
            return { lists: { ...s.lists, [id]: { ...list, name, updated: now } } };
          }),

        updateListContent: (id, patch) =>
          update((s, now) => {
            const list = s.lists[id];
            if (!list) return s;
            return { lists: { ...s.lists, [id]: { ...list, ...patch, updated: now } } };
          }),

        assignSlot: (slot, listId) =>
          update((s) => ({ slots: { ...s.slots, [slot]: listId } })),

        setActiveSlot: (slot) => {
          absorbForeignWrites();
          set({ activeSlot: slot });
        },

        setNote: (listId, entityId, note) =>
          update((s, now) => {
            const list = s.lists[listId];
            if (!list) return s;
            const notes = { ...list.notes };
            if (note.trim()) notes[entityId] = note;
            else delete notes[entityId];
            return { lists: { ...s.lists, [listId]: { ...list, notes, updated: now } } };
          }),

        setAttachment: (listId, leaderIndex, bodyguardIndex) =>
          update((s, now) => {
            const list = s.lists[listId];
            if (!list) return s;
            const attachments = { ...list.attachments };
            if (bodyguardIndex == null) delete attachments[String(leaderIndex)];
            else attachments[String(leaderIndex)] = bodyguardIndex;
            return { lists: { ...s.lists, [listId]: { ...list, attachments, updated: now } } };
          }),

        adoptRemote: (remote) =>
          set({
            lists: remote.lists,
            slots: remote.slots,
            updated: remote.updated,
            dirty: false,
          }),

        adoptMerged: (merged, remoteUpdated) =>
          set((s) => ({
            lists: merged.lists,
            slots: merged.slots,
            updated: new Date().toISOString(),
            dirty: true,
            sync: { ...s.sync, remoteUpdated },
          })),

        markSynced: (at, remoteUpdated, synced) => {
          absorbForeignWrites();
          set((s) => ({
            sync: { lastSynced: at, remoteUpdated, knownIds: synced.ids },
            // A mutation that landed after the synced copy was snapshotted
            // still needs pushing — only a store that matches the copy is clean.
            dirty: s.updated === synced.localUpdated ? false : s.dirty,
          }));
        },
      };
    },
    {
      name: STORAGE_KEY,
      version: STORAGE_VERSION,
      migrate,
      storage: createJSONStorage(() => trackedStorage),
    },
  ),
);

// Multi-tab sync: zustand persist writes the WHOLE state on every change, so a
// tab holding stale state would silently clobber a list imported in another
// tab. Re-read storage whenever any other tab writes it.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) void useLists.persist.rehydrate();
  });
}

/** The list in the currently active slot, if any. */
export function useActiveList(): SavedList | null {
  return useLists((s) => {
    const id = s.slots[s.activeSlot];
    return id ? (s.lists[id] ?? null) : null;
  });
}
