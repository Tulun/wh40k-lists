/**
 * Session-only sync UI state: the unresolved codex conflict detected by
 * gist-sync (lists divergence auto-merges and never lands here). Written by
 * pullRemote/pushLocal, rendered by the global SyncManager banner, cleared
 * when the user picks a side. Never persisted.
 */
import { create } from "zustand";
import type { CodexDoc } from "../lib/codex-model";

interface SyncUiStore {
  codexConflict: CodexDoc | null;
  setCodexConflict(doc: CodexDoc | null): void;
}

export const useSyncUi = create<SyncUiStore>()((set) => ({
  codexConflict: null,
  setCodexConflict: (codexConflict) => set({ codexConflict }),
}));
