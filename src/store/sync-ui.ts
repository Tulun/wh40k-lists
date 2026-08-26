/**
 * Session-only sync UI state: unresolved conflicts detected by gist-sync.
 * Written by pullRemote/pushLocal, rendered by the global SyncManager banner,
 * cleared when the user picks a side. Never persisted.
 */
import { create } from "zustand";
import type { CodexDoc } from "../lib/codex-model";
import type { RemoteLists } from "./schema";

interface SyncUiStore {
  codexConflict: CodexDoc | null;
  listsConflict: RemoteLists | null;
  setCodexConflict(doc: CodexDoc | null): void;
  setListsConflict(remote: RemoteLists | null): void;
}

export const useSyncUi = create<SyncUiStore>()((set) => ({
  codexConflict: null,
  listsConflict: null,
  setCodexConflict: (codexConflict) => set({ codexConflict }),
  setListsConflict: (listsConflict) => set({ listsConflict }),
}));
