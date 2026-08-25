import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  STORAGE_KEY,
  STORAGE_VERSION,
  migrate,
  type PersistedState,
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
}

export const useLists = create<ListsStore>()(
  persist(
    (set) => ({
      lists: {},
      slots: { mine: null, opponent: null },
      activeSlot: "mine",

      saveList: (list) =>
        set((s) => ({ lists: { ...s.lists, [list.id]: list } })),

      deleteList: (id) =>
        set((s) => {
          const lists = { ...s.lists };
          delete lists[id];
          const slots = { ...s.slots };
          for (const slot of ["mine", "opponent"] as const) {
            if (slots[slot] === id) slots[slot] = null;
          }
          return { lists, slots };
        }),

      renameList: (id, name) =>
        set((s) => {
          const list = s.lists[id];
          if (!list) return s;
          return { lists: { ...s.lists, [id]: { ...list, name } } };
        }),

      assignSlot: (slot, listId) =>
        set((s) => ({ slots: { ...s.slots, [slot]: listId } })),

      setActiveSlot: (slot) => set({ activeSlot: slot }),

      setNote: (listId, entityId, note) =>
        set((s) => {
          const list = s.lists[listId];
          if (!list) return s;
          const notes = { ...list.notes };
          if (note.trim()) notes[entityId] = note;
          else delete notes[entityId];
          return { lists: { ...s.lists, [listId]: { ...list, notes } } };
        }),

      setAttachment: (listId, leaderIndex, bodyguardIndex) =>
        set((s) => {
          const list = s.lists[listId];
          if (!list) return s;
          const attachments = { ...list.attachments };
          if (bodyguardIndex == null) delete attachments[String(leaderIndex)];
          else attachments[String(leaderIndex)] = bodyguardIndex;
          return { lists: { ...s.lists, [listId]: { ...list, attachments } } };
        }),
    }),
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
