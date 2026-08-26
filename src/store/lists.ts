import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  STORAGE_KEY,
  STORAGE_VERSION,
  migrate,
  type PersistedState,
  type RemoteLists,
  type SavedList,
  type Slot,
} from "./schema";

interface ListsStore extends PersistedState {
  saveList(list: SavedList): void;
  deleteList(id: string): void;
  renameList(id: string, name: string): void;
  assignSlot(slot: Slot, listId: string | null): void;
  setActiveSlot(slot: Slot): void;
  setNote(listId: string, entityId: string, note: string): void;
  /** Declare/clear which unit a character (by roster index) is attached to. */
  setAttachment(listId: string, leaderIndex: number, bodyguardIndex: number | null): void;

  /** Replace lists/slots wholesale from the remote copy; keeps activeSlot. */
  adoptRemote(remote: RemoteLists): void;
  /**
   * First-sync merge: union of both sides, remote winning id collisions.
   * Leaves the store dirty so the merged result gets pushed back.
   */
  mergeRemote(remote: RemoteLists): void;
  markSynced(at: string, remoteUpdated: string): void;
}

export const useLists = create<ListsStore>()(
  persist(
    (set) => {
      /** Apply a content mutation, stamping the sync token — unless it was a no-op. */
      const update = (fn: (s: ListsStore) => Partial<PersistedState> | ListsStore) =>
        set((s) => {
          const patch = fn(s);
          if (patch === s) return s;
          return { ...patch, updated: new Date().toISOString(), dirty: true };
        });

      return {
        lists: {},
        slots: { mine: null, opponent: null },
        activeSlot: "mine" as Slot,
        updated: null,
        dirty: false,
        sync: { lastSynced: null, remoteUpdated: null },

        saveList: (list) =>
          update((s) => ({ lists: { ...s.lists, [list.id]: list } })),

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
          update((s) => {
            const list = s.lists[id];
            if (!list) return s;
            return { lists: { ...s.lists, [id]: { ...list, name } } };
          }),

        assignSlot: (slot, listId) =>
          update((s) => ({ slots: { ...s.slots, [slot]: listId } })),

        setActiveSlot: (slot) => set({ activeSlot: slot }),

        setNote: (listId, entityId, note) =>
          update((s) => {
            const list = s.lists[listId];
            if (!list) return s;
            const notes = { ...list.notes };
            if (note.trim()) notes[entityId] = note;
            else delete notes[entityId];
            return { lists: { ...s.lists, [listId]: { ...list, notes } } };
          }),

        setAttachment: (listId, leaderIndex, bodyguardIndex) =>
          update((s) => {
            const list = s.lists[listId];
            if (!list) return s;
            const attachments = { ...list.attachments };
            if (bodyguardIndex == null) delete attachments[String(leaderIndex)];
            else attachments[String(leaderIndex)] = bodyguardIndex;
            return { lists: { ...s.lists, [listId]: { ...list, attachments } } };
          }),

        adoptRemote: (remote) =>
          set({
            lists: remote.lists,
            slots: remote.slots,
            updated: remote.updated,
            dirty: false,
          }),

        mergeRemote: (remote) =>
          set((s) => ({
            lists: { ...s.lists, ...remote.lists },
            slots: {
              mine: remote.slots.mine ?? s.slots.mine,
              opponent: remote.slots.opponent ?? s.slots.opponent,
            },
            updated: new Date().toISOString(),
            dirty: true,
          })),

        markSynced: (at, remoteUpdated) =>
          set(() => ({ sync: { lastSynced: at, remoteUpdated }, dirty: false })),
      };
    },
    {
      name: STORAGE_KEY,
      version: STORAGE_VERSION,
      migrate,
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
