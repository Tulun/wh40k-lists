/**
 * QR sync hand-off, receiving side. A connected device shows a QR encoding
 * `#/sync-setup?token=…&gist=…` (see the Sync card in EditorHomeScreen); the
 * token travels only inside the URL fragment, which never reaches any server.
 * This screen grabs the credentials, immediately replaces the token-bearing
 * URL in history, connects, and bounces to the saved lists.
 */
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { setUpSync } from "../lib/gist-sync";
import { QR_SYNC_SETUP_ENABLED } from "../lib/flags";

type Phase =
  | { status: "connecting" }
  | { status: "done" }
  | { status: "error"; message: string };

export default function SyncSetupScreen() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>({ status: "connecting" });
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const token = params.get("token");
    const gist = params.get("gist");
    // Scrub the token from the address bar and history before anything else.
    navigate("/sync-setup", { replace: true });
    if (!QR_SYNC_SETUP_ENABLED || !token || !gist) {
      setPhase({
        status: "error",
        message: !QR_SYNC_SETUP_ENABLED
          ? "QR setup is currently switched off."
          : "This link is missing its setup data — re-scan the QR code from the other device's Sync card.",
      });
      return;
    }
    void setUpSync(token, gist).then((result) => {
      if (result.status === "error") setPhase({ status: "error", message: result.error.message });
      else {
        setPhase({ status: "done" });
        navigate("/lists", { replace: true });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3 pb-8">
      <h1 className="text-lg font-bold">Device sync setup</h1>
      {phase.status === "connecting" && <p className="text-sm text-ink-dim">Connecting to the gist…</p>}
      {phase.status === "done" && <p className="text-sm text-ink-dim">Connected.</p>}
      {phase.status === "error" && (
        <>
          <p className="rounded-md border border-opponent/40 bg-opponent/10 p-2 text-xs text-opponent">
            {phase.message}
          </p>
          <p className="text-xs text-ink-dim">
            You can also connect manually from the{" "}
            <Link to="/editor" className="text-accent underline">
              editor's Sync card
            </Link>
            .
          </p>
        </>
      )}
    </div>
  );
}
