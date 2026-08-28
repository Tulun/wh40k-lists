import { useState } from "react";
import { Link } from "react-router-dom";
import { renderSVG } from "uqr";
import { Field, SectionCard, SmallButton, TextInput } from "../components/editor/fields";
import { useDataset } from "../hooks/useDataset";
import { getCodexBuildError } from "../lib/data";
import { EXPLORE_FACTION_IDS, QR_SYNC_SETUP_ENABLED } from "../lib/flags";
import { pullRemote, pushLocal, setUpSync } from "../lib/gist-sync";
import { codexBadge, factionMode, useCodex } from "../store/codex";
import { useLists } from "../store/lists";

type SyncNote = { tone: "ok" | "error"; text: string } | null;

export default function EditorHomeScreen() {
  const data = useDataset();
  const doc = useCodex((s) => s.doc);
  const sync = useCodex((s) => s.sync);
  const codexDirty = useCodex((s) => s.dirty);
  const listsDirty = useLists((s) => s.dirty);
  const dirty = codexDirty || listsDirty;

  const [note, setNote] = useState<SyncNote>(null);
  const [busy, setBusy] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [tokenDraft, setTokenDraft] = useState("");
  const [gistDraft, setGistDraft] = useState("");

  const connected = Boolean(sync.gistId && sync.token);
  const buildError = getCodexBuildError();

  // Conflicts surface in the app-wide SyncManager banner, not here.
  async function syncNow() {
    setBusy(true);
    setNote(null);
    const pulled = await pullRemote();
    if (pulled.status === "conflict") {
      setNote({ tone: "error", text: "Both sides changed — resolve the conflict above." });
    } else if (pulled.status === "error") {
      setNote({ tone: "error", text: pulled.error.message });
    } else if (useCodex.getState().dirty || useLists.getState().dirty) {
      const pushed = await pushLocal();
      if (pushed.status === "conflict") {
        setNote({ tone: "error", text: "Both sides changed — resolve the conflict above." });
      } else if (pushed.status === "error") {
        setNote({ tone: "error", text: pushed.error.message });
      } else {
        setNote({ tone: "ok", text: "Pushed local changes." });
      }
    } else {
      setNote({ tone: "ok", text: pulled.status === "pulled" ? "Pulled latest from gist." : "Up to date." });
    }
    setBusy(false);
  }

  async function connect() {
    if (!tokenDraft.trim()) return;
    setBusy(true);
    setNote(null);
    const result = await setUpSync(tokenDraft.trim(), gistDraft.trim() || null);
    if (result.status === "error") setNote({ tone: "error", text: result.error.message });
    else {
      setNote({ tone: "ok", text: result.status === "created" ? "Created a new secret gist." : "Connected." });
      setShowSetup(false);
      setTokenDraft("");
      setGistDraft("");
    }
    setBusy(false);
  }

  return (
    <div className="space-y-3 pb-8">
      <h1 className="text-lg font-bold">Codex editor</h1>
      <p className="text-xs text-ink-dim">
        Build the new Ork codex by hand and patch stale records in the other armies. Data syncs
        through your private gist to every device signed into it. Rules text you type must be
        paraphrased — never copied verbatim from the book.
      </p>

      {buildError && (
        <p className="rounded-md border border-opponent/40 bg-opponent/10 p-2 text-xs text-opponent">
          The codex data failed to compile — the app is showing stock data: {buildError}
        </p>
      )}

      <SectionCard
        title="Sync"
        actions={
          connected ? (
            <SmallButton onClick={() => void syncNow()} tone="primary">
              {busy ? "Syncing…" : "Sync now"}
            </SmallButton>
          ) : undefined
        }
      >
        {connected ? (
          <div className="text-xs text-ink-dim">
            Gist <code className="text-ink">{sync.gistId}</code>
            {sync.lastSynced && <> · last synced {new Date(sync.lastSynced).toLocaleString()}</>}
            {dirty && <span className="ml-1 font-semibold text-accent">· unsynced edits</span>}
            <button
              type="button"
              onClick={() => setShowSetup((v) => !v)}
              className="ml-2 text-ink-faint underline"
            >
              change
            </button>
          </div>
        ) : (
          <p className="text-xs text-ink-dim">
            Not connected — codex edits and saved lists stay on this device until you connect a
            gist.{" "}
            <button type="button" onClick={() => setShowSetup((v) => !v)} className="text-accent underline">
              Set up sync
            </button>
          </p>
        )}
        {QR_SYNC_SETUP_ENABLED && connected && (
          <div className="border-t border-edge pt-2">
            <button
              type="button"
              onClick={() => setShowQr((v) => !v)}
              className="text-xs text-accent underline"
            >
              {showQr ? "Hide QR" : "Show QR to connect another device"}
            </button>
            {showQr && sync.gistId && sync.token && (
              <div className="mt-2 space-y-2">
                <div
                  className="w-56 max-w-full rounded-md bg-white p-3 [&_svg]:h-auto [&_svg]:w-full"
                  dangerouslySetInnerHTML={{
                    __html: renderSVG(
                      `${window.location.origin}${import.meta.env.BASE_URL}#/sync-setup?token=${encodeURIComponent(sync.token)}&gist=${encodeURIComponent(sync.gistId)}`,
                    ),
                  }}
                />
                <p className="text-[10px] leading-snug text-ink-faint">
                  Scan with the other device's camera — it opens the app and connects on its own.
                  The token rides in the URL fragment, which never leaves the two devices. Anyone
                  who can photograph this code gets your token, so keep it on screen only while
                  scanning.
                </p>
              </div>
            )}
          </div>
        )}
        {showSetup && (
          <div className="space-y-2 border-t border-edge pt-2">
            <Field label="GitHub token (gist scope)">
              <TextInput
                type="password"
                value={tokenDraft}
                onChange={(e) => setTokenDraft(e.target.value)}
                placeholder="github_pat_… or ghp_…"
                autoComplete="off"
              />
            </Field>
            <Field label="Existing gist id or URL (leave empty to create one)">
              <TextInput
                value={gistDraft}
                onChange={(e) => setGistDraft(e.target.value)}
                placeholder="e.g. from another device's Sync card"
              />
            </Field>
            <p className="text-[10px] leading-snug text-ink-faint">
              Create a <em>classic</em> token with only the "gist" scope at github.com → Settings
              → Developer settings → Tokens (classic). Fine-grained tokens don't work with gists.
              The token stays in this browser and is sent only to api.github.com.
            </p>
            <SmallButton tone="primary" onClick={() => void connect()}>
              {busy ? "Connecting…" : "Connect"}
            </SmallButton>
          </div>
        )}
        {note && (
          <p className={`text-xs ${note.tone === "error" ? "text-opponent" : "text-ink-faint"}`}>{note.text}</p>
        )}
      </SectionCard>

      <ul className="space-y-2">
        {(EXPLORE_FACTION_IDS ?? []).map((id) => {
          const name = data?.factions.getAny(id)?.name ?? id;
          const badge = codexBadge(doc, id);
          const mode = factionMode(id);
          return (
            <li key={id} className="overflow-hidden rounded-lg border border-edge">
              <Link to={`/editor/${id}`} className="flex min-h-11 items-center gap-2 px-3 py-2 hover:bg-panel active:bg-panel">
                <span className="flex-1 text-sm font-medium">{name}</span>
                {badge && (
                  <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent">
                    {badge === "replace" ? "In progress" : "Edited"}
                  </span>
                )}
                <span className="text-xs text-ink-faint">
                  {mode === "replace" ? "full codex ›" : "patch ›"}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
