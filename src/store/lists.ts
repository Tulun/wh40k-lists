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
  markSynced(at: string, remoteUpdated: string): void;
}

export const useLists = create<ListsStore>()(
  persist(
    (set) => {
      /** Apply a content mutation, stamping the sync token — unless it was a no-op. */
      const update = (fn: (s: ListsStore, now: string) => Partial<PersistedState> | ListsStore) =>
        set((s) => {
          const now = new Date().toISOString();
          const patch = fn(s, now);
          if (patch === s) return s;
          return { ...patch, updated: now, dirty: true };
        });

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

        setActiveSlot: (slot) => set({ activeSlot: slot }),

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

        markSynced: (at, remoteUpdated) =>
          set((s) => ({
            sync: { lastSynced: at, remoteUpdated, knownIds: Object.keys(s.lists) },
            dirty: false,
          })),
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
