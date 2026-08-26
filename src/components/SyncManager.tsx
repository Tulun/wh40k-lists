/**
 * App-wide sync bootstrap + conflict banner. Mounted once in App so lists and
 * codex data sync on every launch, not just when the editor is opened: pulls
 * the gist on startup and whenever the tab regains focus (throttled), and
 * starts the debounced auto-push. Lists divergence heals itself with a
 * per-list merge; only an unmergeable codex conflict renders here as a banner
 * on every screen.
 */
import { useEffect } from "react";
import { pullRemote, resolveConflict, startAutoSync } from "../lib/gist-sync";
import { useCodex } from "../store/codex";
import { useSyncUi } from "../store/sync-ui";
import { SmallButton } from "./editor/fields";

/** Don't re-pull on focus more often than this. */
const FOCUS_PULL_INTERVAL_MS = 60_000;

export default function SyncManager() {
  const codexConflict = useSyncUi((s) => s.codexConflict);

  useEffect(() => {
    startAutoSync();
    const pull = () => {
      const { gistId, token } = useCodex.getState().sync;
      if (gistId && token) void pullRemote();
    };
    pull();

    // A long-lived tab that never pulls again turns every remote edit into a
    // conflict; absorbing them while local is still clean avoids most of that.
    let lastPull = Date.now();
    const onActive = () => {
      if (document.visibilityState === "hidden") return;
      if (Date.now() - lastPull < FOCUS_PULL_INTERVAL_MS) return;
      lastPull = Date.now();
      pull();
    };
    window.addEventListener("focus", onActive);
    document.addEventListener("visibilitychange", onActive);
    return () => {
      window.removeEventListener("focus", onActive);
      document.removeEventListener("visibilitychange", onActive);
    };
  }, []);

  if (!codexConflict) return null;

  return (
    <div className="space-y-2 pb-3">
      <div className="space-y-2 rounded-md border border-opponent/40 bg-opponent/10 p-3">
        <p className="text-xs text-opponent">
          The codex in the gist changed since this device last synced (edited on another device,
          or by Claude), and you also have local edits. Which copy wins?
        </p>
        <div className="flex gap-2">
          <SmallButton tone="primary" onClick={() => void resolveConflict("local", codexConflict)}>
            Keep this device's
          </SmallButton>
          <SmallButton tone="danger" onClick={() => void resolveConflict("remote", codexConflict)}>
            Take the gist's
          </SmallButton>
        </div>
      </div>
    </div>
  );
}
