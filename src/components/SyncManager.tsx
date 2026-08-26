/**
 * App-wide sync bootstrap + conflict banner. Mounted once in App so lists and
 * codex data sync on every launch, not just when the editor is opened: pulls
 * the gist on startup and starts the debounced auto-push. Unresolved
 * conflicts (from any pull or push) render here as a banner on every screen.
 */
import { useEffect } from "react";
import { pullRemote, resolveConflict, resolveListsConflict, startAutoSync } from "../lib/gist-sync";
import { useCodex } from "../store/codex";
import { useSyncUi } from "../store/sync-ui";
import { SmallButton } from "./editor/fields";

export default function SyncManager() {
  const codexConflict = useSyncUi((s) => s.codexConflict);
  const listsConflict = useSyncUi((s) => s.listsConflict);

  useEffect(() => {
    startAutoSync();
    const { gistId, token } = useCodex.getState().sync;
    if (gistId && token) void pullRemote();
  }, []);

  if (!codexConflict && !listsConflict) return null;

  return (
    <div className="space-y-2 pb-3">
      {codexConflict && (
        <div className="space-y-2 rounded-md border border-opponent/40 bg-opponent/10 p-3">
          <p className="text-xs text-opponent">
            The codex in the gist changed since this device last synced (edited on another device,
            or by Claude), and you also have local edits. Which copy wins?
          </p>
          <div className="flex gap-2">
            <SmallButton
              tone="primary"
              onClick={() => void resolveConflict("local", codexConflict)}
            >
              Keep this device's
            </SmallButton>
            <SmallButton
              tone="danger"
              onClick={() => void resolveConflict("remote", codexConflict)}
            >
              Take the gist's
            </SmallButton>
          </div>
        </div>
      )}
      {listsConflict && (
        <div className="space-y-2 rounded-md border border-opponent/40 bg-opponent/10 p-3">
          <p className="text-xs text-opponent">
            Your lists changed in the gist (edited on another device) and on this device since the
            last sync. Which copy wins?
          </p>
          <div className="flex gap-2">
            <SmallButton
              tone="primary"
              onClick={() => void resolveListsConflict("local", listsConflict)}
            >
              Keep this device's
            </SmallButton>
            <SmallButton
              tone="danger"
              onClick={() => void resolveListsConflict("remote", listsConflict)}
            >
              Take the gist's
            </SmallButton>
          </div>
        </div>
      )}
    </div>
  );
}
