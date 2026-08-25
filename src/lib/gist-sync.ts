/**
 * Syncs the codex doc with one secret GitHub Gist — the single source of
 * truth shared between devices (and writable by Claude via the `gh` CLI when
 * transcribing screenshots).
 *
 * The gist holds one file, `codex.json`. Conflict detection is by the doc's
 * own `updated` stamp: a push is refused when the remote doc changed since
 * this device last synced, and the UI asks which copy wins. Single-user
 * last-write-wins beyond that.
 *
 * The token is entered by the user and stays in their browser storage; it is
 * sent only to api.github.com and never logged.
 */
import type { CodexDoc } from "./codex-model";
import { emptyCodexDoc } from "./codex-model";
import { useCodex } from "../store/codex";

export const GIST_FILE = "codex.json";
const API = "https://api.github.com";

export interface GistConfig {
  gistId: string;
  token: string;
}

export type SyncFailure = {
  kind: "auth" | "not-found" | "network" | "invalid" | "conflict";
  message: string;
};

type Result<T> = ({ ok: true } & T) | { ok: false; error: SyncFailure };

function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function failureFrom(status: number): SyncFailure {
  if (status === 401 || status === 403) {
    return { kind: "auth", message: "GitHub rejected the token (needs the gist scope)." };
  }
  if (status === 404) {
    return { kind: "not-found", message: "Gist not found — check the gist id (or the token's access)." };
  }
  return { kind: "network", message: `GitHub API error (HTTP ${status}).` };
}

/** Accepts a bare gist id or a full gist URL. */
export function normalizeGistId(input: string): string {
  const match = /([0-9a-f]{16,})\s*$/i.exec(input.trim());
  return match ? match[1] : input.trim();
}

export async function loadRemoteDoc(cfg: GistConfig): Promise<Result<{ doc: CodexDoc }>> {
  let res: Response;
  try {
    res = await fetch(`${API}/gists/${cfg.gistId}`, { headers: headers(cfg.token) });
  } catch {
    return { ok: false, error: { kind: "network", message: "Could not reach GitHub (offline?)." } };
  }
  if (!res.ok) return { ok: false, error: failureFrom(res.status) };
  const body = (await res.json()) as { files?: Record<string, { content?: string; truncated?: boolean }> };
  const file = body.files?.[GIST_FILE];
  if (!file?.content) {
    return { ok: false, error: { kind: "invalid", message: `Gist has no ${GIST_FILE} file.` } };
  }
  try {
    const doc = JSON.parse(file.content) as CodexDoc;
    if (doc.version !== 1 || typeof doc.factions !== "object") throw new Error("bad shape");
    return { ok: true, doc };
  } catch {
    return { ok: false, error: { kind: "invalid", message: `${GIST_FILE} is not a valid codex doc.` } };
  }
}

export async function saveRemoteDoc(cfg: GistConfig, doc: CodexDoc): Promise<Result<object>> {
  let res: Response;
  try {
    res = await fetch(`${API}/gists/${cfg.gistId}`, {
      method: "PATCH",
      headers: { ...headers(cfg.token), "Content-Type": "application/json" },
      body: JSON.stringify({ files: { [GIST_FILE]: { content: JSON.stringify(doc, null, 2) } } }),
    });
  } catch {
    return { ok: false, error: { kind: "network", message: "Could not reach GitHub (offline?)." } };
  }
  if (!res.ok) return { ok: false, error: failureFrom(res.status) };
  return { ok: true };
}

export async function createRemoteGist(token: string, doc: CodexDoc): Promise<Result<{ gistId: string }>> {
  let res: Response;
  try {
    res = await fetch(`${API}/gists`, {
      method: "POST",
      headers: { ...headers(token), "Content-Type": "application/json" },
      body: JSON.stringify({
        description: "40k viewer codex data",
        public: false,
        files: { [GIST_FILE]: { content: JSON.stringify(doc, null, 2) } },
      }),
    });
  } catch {
    return { ok: false, error: { kind: "network", message: "Could not reach GitHub (offline?)." } };
  }
  if (!res.ok) return { ok: false, error: failureFrom(res.status) };
  const body = (await res.json()) as { id?: string };
  if (!body.id) return { ok: false, error: { kind: "invalid", message: "GitHub returned no gist id." } };
  return { ok: true, gistId: body.id };
}

/**
 * Pull the remote doc into the store.
 * - Remote unchanged since our baseline → keep local (it may carry edits).
 * - Remote changed and local is clean → take remote.
 * - Remote changed and local is dirty → conflict; the caller asks the user.
 */
export async function pullRemote(): Promise<
  | { status: "up-to-date" | "pulled" | "conflict"; remoteDoc?: CodexDoc }
  | { status: "error"; error: SyncFailure }
> {
  const { sync, dirty } = useCodex.getState();
  if (!sync.gistId || !sync.token) return { status: "up-to-date" };
  const result = await loadRemoteDoc({ gistId: sync.gistId, token: sync.token });
  if (!result.ok) return { status: "error", error: result.error };
  const remote = result.doc;
  const now = new Date().toISOString();
  if (remote.updated === sync.remoteUpdated || remote.updated === useCodex.getState().doc.updated) {
    if (!dirty) useCodex.getState().markSynced(now, remote.updated);
    return { status: "up-to-date" };
  }
  if (dirty) return { status: "conflict", remoteDoc: remote };
  useCodex.getState().setDoc(remote, { markClean: true });
  useCodex.getState().markSynced(now, remote.updated);
  return { status: "pulled" };
}

/**
 * Push the local doc, refusing when the remote moved since our baseline
 * (someone else — the phone, or Claude — wrote in between).
 */
export async function pushLocal(): Promise<
  { status: "pushed" | "conflict"; remoteDoc?: CodexDoc } | { status: "error"; error: SyncFailure }
> {
  const { sync, doc } = useCodex.getState();
  if (!sync.gistId || !sync.token) {
    return { status: "error", error: { kind: "invalid", message: "Sync is not configured." } };
  }
  const cfg = { gistId: sync.gistId, token: sync.token };
  const remote = await loadRemoteDoc(cfg);
  if (!remote.ok) return { status: "error", error: remote.error };
  if (sync.remoteUpdated !== null && remote.doc.updated !== sync.remoteUpdated) {
    return { status: "conflict", remoteDoc: remote.doc };
  }
  const saved = await saveRemoteDoc(cfg, doc);
  if (!saved.ok) return { status: "error", error: saved.error };
  useCodex.getState().markSynced(new Date().toISOString(), doc.updated);
  return { status: "pushed" };
}

/** Resolve a conflict by keeping one side. */
export async function resolveConflict(keep: "local" | "remote", remoteDoc: CodexDoc) {
  if (keep === "remote") {
    useCodex.getState().setDoc(remoteDoc, { markClean: true });
    useCodex.getState().markSynced(new Date().toISOString(), remoteDoc.updated);
    return { status: "pulled" as const };
  }
  // Keep local: adopt the remote stamp as baseline, then overwrite it.
  useCodex.setState((s) => ({ sync: { ...s.sync, remoteUpdated: remoteDoc.updated } }));
  return pushLocal();
}

/** First-time setup: create the gist (or adopt an existing one) and seed it. */
export async function setUpSync(token: string, gistIdInput: string | null) {
  const store = useCodex.getState();
  if (gistIdInput) {
    const gistId = normalizeGistId(gistIdInput);
    const result = await loadRemoteDoc({ gistId, token });
    if (!result.ok) return { status: "error" as const, error: result.error };
    store.setSyncConfig({ gistId, token });
    // Adopt whichever side has content; remote wins when both do.
    const localEmpty = store.doc.updated === emptyCodexDoc().updated && !store.dirty;
    if (!localEmpty && result.doc.updated === emptyCodexDoc().updated) {
      return pushLocalWithBaseline(result.doc.updated);
    }
    useCodex.getState().setDoc(result.doc, { markClean: true });
    useCodex.getState().markSynced(new Date().toISOString(), result.doc.updated);
    return { status: "connected" as const };
  }
  const created = await createRemoteGist(token, store.doc);
  if (!created.ok) return { status: "error" as const, error: created.error };
  store.setSyncConfig({ gistId: created.gistId, token });
  useCodex.getState().markSynced(new Date().toISOString(), store.doc.updated);
  return { status: "created" as const, gistId: created.gistId };
}

async function pushLocalWithBaseline(remoteUpdated: string) {
  useCodex.setState((s) => ({ sync: { ...s.sync, remoteUpdated } }));
  const pushed = await pushLocal();
  return pushed.status === "pushed" ? { status: "connected" as const } : pushed;
}

// ---------------------------------------------------------------------------
// Debounced auto-push: any doc mutation schedules a push a few seconds out.

let autoPushTimer: ReturnType<typeof setTimeout> | null = null;
let started = false;

/** Call once from app bootstrap. Safe to call repeatedly. */
export function startAutoSync(onConflict: (remoteDoc: CodexDoc) => void): void {
  if (started) return;
  started = true;
  useCodex.subscribe((state, prev) => {
    if (!state.dirty || state.doc === prev.doc) return;
    if (!state.sync.gistId || !state.sync.token) return;
    if (autoPushTimer) clearTimeout(autoPushTimer);
    autoPushTimer = setTimeout(() => {
      void pushLocal().then((r) => {
        if (r.status === "conflict" && r.remoteDoc) onConflict(r.remoteDoc);
      });
    }, 2500);
  });
}
