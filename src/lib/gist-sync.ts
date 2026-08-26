/**
 * Syncs local data with one secret GitHub Gist — the single source of truth
 * shared between devices (and writable by Claude via the `gh` CLI when
 * transcribing screenshots).
 *
 * The gist holds two files: `codex.json` (the hand-authored codex doc) and
 * `lists.json` (saved lists + slot assignments). Conflict detection is per
 * file, by each doc's own `updated` stamp: a push is refused when the remote
 * copy changed since this device last synced, and the UI asks which side wins
 * (conflicts land in the sync-ui store for the global banner). Single-user
 * last-write-wins beyond that.
 *
 * The token is entered by the user and stays in their browser storage; it is
 * sent only to api.github.com and never logged.
 */
import type { CodexDoc } from "./codex-model";
import { emptyCodexDoc } from "./codex-model";
import { useCodex } from "../store/codex";
import { useLists } from "../store/lists";
import { useSyncUi } from "../store/sync-ui";
import type { RemoteLists } from "../store/schema";

export const GIST_FILE = "codex.json";
export const LISTS_FILE = "lists.json";
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

// ---------------------------------------------------------------------------
// Raw gist I/O

/** One GET for the whole gist; returns the text content of every present file. */
async function fetchGistFiles(cfg: GistConfig): Promise<Result<{ files: Record<string, string> }>> {
  let res: Response;
  try {
    res = await fetch(`${API}/gists/${cfg.gistId}`, { headers: headers(cfg.token) });
  } catch {
    return { ok: false, error: { kind: "network", message: "Could not reach GitHub (offline?)." } };
  }
  if (!res.ok) return { ok: false, error: failureFrom(res.status) };
  const body = (await res.json()) as { files?: Record<string, { content?: string }> };
  const files: Record<string, string> = {};
  for (const [name, file] of Object.entries(body.files ?? {})) {
    if (file?.content) files[name] = file.content;
  }
  return { ok: true, files };
}

async function saveRemoteFiles(cfg: GistConfig, files: Record<string, string>): Promise<Result<object>> {
  const payload: Record<string, { content: string }> = {};
  for (const [name, content] of Object.entries(files)) payload[name] = { content };
  let res: Response;
  try {
    res = await fetch(`${API}/gists/${cfg.gistId}`, {
      method: "PATCH",
      headers: { ...headers(cfg.token), "Content-Type": "application/json" },
      body: JSON.stringify({ files: payload }),
    });
  } catch {
    return { ok: false, error: { kind: "network", message: "Could not reach GitHub (offline?)." } };
  }
  if (!res.ok) return { ok: false, error: failureFrom(res.status) };
  return { ok: true };
}

function parseCodexDoc(content: string): CodexDoc | null {
  try {
    const doc = JSON.parse(content) as CodexDoc;
    if (doc.version !== 1 || typeof doc.factions !== "object") return null;
    return doc;
  } catch {
    return null;
  }
}

function parseRemoteLists(content: string): RemoteLists | null {
  try {
    const doc = JSON.parse(content) as RemoteLists;
    if (doc.version !== 1 || typeof doc.updated !== "string" || typeof doc.lists !== "object") {
      return null;
    }
    return doc;
  } catch {
    return null;
  }
}

/** Snapshot the local lists state in the remote-file shape. */
function localListsSnapshot(): RemoteLists {
  const s = useLists.getState();
  return {
    version: 1,
    updated: s.updated ?? new Date().toISOString(),
    lists: s.lists,
    slots: s.slots,
  };
}

export async function loadRemoteDoc(cfg: GistConfig): Promise<Result<{ doc: CodexDoc }>> {
  const gist = await fetchGistFiles(cfg);
  if (!gist.ok) return gist;
  const content = gist.files[GIST_FILE];
  if (!content) {
    return { ok: false, error: { kind: "invalid", message: `Gist has no ${GIST_FILE} file.` } };
  }
  const doc = parseCodexDoc(content);
  if (!doc) {
    return { ok: false, error: { kind: "invalid", message: `${GIST_FILE} is not a valid codex doc.` } };
  }
  return { ok: true, doc };
}

export async function saveRemoteDoc(cfg: GistConfig, doc: CodexDoc): Promise<Result<object>> {
  return saveRemoteFiles(cfg, { [GIST_FILE]: JSON.stringify(doc, null, 2) });
}

export async function createRemoteGist(
  token: string,
  doc: CodexDoc,
  lists?: RemoteLists,
): Promise<Result<{ gistId: string }>> {
  const files: Record<string, { content: string }> = {
    [GIST_FILE]: { content: JSON.stringify(doc, null, 2) },
  };
  if (lists) files[LISTS_FILE] = { content: JSON.stringify(lists, null, 2) };
  let res: Response;
  try {
    res = await fetch(`${API}/gists`, {
      method: "POST",
      headers: { ...headers(token), "Content-Type": "application/json" },
      body: JSON.stringify({
        description: "40k viewer codex data",
        public: false,
        files,
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

// ---------------------------------------------------------------------------
// Lists reconciliation (shared by pull and setup)

type ListsPullStatus = "up-to-date" | "pulled" | "conflict" | "push-needed" | "invalid";

/**
 * Reconcile local lists against the remote lists.json content (`undefined`
 * when the gist predates lists sync and has no such file yet).
 *
 * A null baseline means this device has never synced lists: adopt the remote
 * copy when local is empty, otherwise merge the two sides losslessly (union by
 * list id, remote winning collisions) and leave the store dirty so the merge
 * gets pushed back. With a baseline, it's the same three-way logic as the
 * codex doc: unchanged → keep local, moved + clean → adopt, moved + dirty →
 * conflict.
 */
function reconcileLists(remoteContent: string | undefined): { status: ListsPullStatus; remote?: RemoteLists } {
  const state = useLists.getState();
  const now = new Date().toISOString();
  const hasLocal = Object.keys(state.lists).length > 0;

  if (remoteContent === undefined) {
    if (!hasLocal) return { status: "up-to-date" };
    // Remote file doesn't exist yet — stamp local dirty so auto-push creates it.
    if (!state.dirty || state.updated === null) {
      useLists.setState({ updated: now, dirty: true });
    }
    return { status: "push-needed" };
  }

  const remote = parseRemoteLists(remoteContent);
  if (!remote) return { status: "invalid" };

  if (state.sync.remoteUpdated === null) {
    if (!hasLocal) {
      state.adoptRemote(remote);
      useLists.getState().markSynced(now, remote.updated);
      return { status: "pulled" };
    }
    useLists.getState().mergeRemote(remote);
    return { status: "push-needed" };
  }

  if (remote.updated === state.sync.remoteUpdated || remote.updated === state.updated) {
    if (!state.dirty) useLists.getState().markSynced(now, remote.updated);
    return { status: "up-to-date" };
  }
  if (state.dirty) return { status: "conflict", remote };
  state.adoptRemote(remote);
  useLists.getState().markSynced(now, remote.updated);
  return { status: "pulled" };
}

// ---------------------------------------------------------------------------
// Pull / push

export type PullResult =
  | { status: "up-to-date" | "pulled" | "conflict"; remoteDoc?: CodexDoc; listsConflict?: RemoteLists }
  | { status: "error"; error: SyncFailure };

/**
 * Pull both files into their stores. Per file:
 * - Remote unchanged since our baseline → keep local (it may carry edits).
 * - Remote changed and local is clean → take remote.
 * - Remote changed and local is dirty → conflict; recorded for the banner.
 */
export async function pullRemote(): Promise<PullResult> {
  const { sync, dirty } = useCodex.getState();
  if (!sync.gistId || !sync.token) return { status: "up-to-date" };
  const gist = await fetchGistFiles({ gistId: sync.gistId, token: sync.token });
  if (!gist.ok) return { status: "error", error: gist.error };

  const codexContent = gist.files[GIST_FILE];
  if (!codexContent) {
    return { status: "error", error: { kind: "invalid", message: `Gist has no ${GIST_FILE} file.` } };
  }
  const remote = parseCodexDoc(codexContent);
  if (!remote) {
    return { status: "error", error: { kind: "invalid", message: `${GIST_FILE} is not a valid codex doc.` } };
  }

  const now = new Date().toISOString();
  let codexStatus: "up-to-date" | "pulled" | "conflict" = "up-to-date";
  if (remote.updated === sync.remoteUpdated || remote.updated === useCodex.getState().doc.updated) {
    if (!dirty) useCodex.getState().markSynced(now, remote.updated);
  } else if (dirty) {
    codexStatus = "conflict";
  } else {
    useCodex.getState().setDoc(remote, { markClean: true });
    useCodex.getState().markSynced(now, remote.updated);
    codexStatus = "pulled";
  }

  const lists = reconcileLists(gist.files[LISTS_FILE]);
  if (lists.status === "invalid") {
    return { status: "error", error: { kind: "invalid", message: `${LISTS_FILE} is not a valid lists doc.` } };
  }

  if (codexStatus === "conflict") useSyncUi.getState().setCodexConflict(remote);
  if (lists.status === "conflict" && lists.remote) useSyncUi.getState().setListsConflict(lists.remote);

  if (codexStatus === "conflict" || lists.status === "conflict") {
    return {
      status: "conflict",
      remoteDoc: codexStatus === "conflict" ? remote : undefined,
      listsConflict: lists.status === "conflict" ? lists.remote : undefined,
    };
  }
  if (codexStatus === "pulled" || lists.status === "pulled") return { status: "pulled" };
  return { status: "up-to-date" };
}

export type PushResult =
  | { status: "pushed" | "up-to-date" | "conflict"; remoteDoc?: CodexDoc; listsConflict?: RemoteLists }
  | { status: "error"; error: SyncFailure };

/**
 * Push whatever is dirty, refusing per file when the remote moved since our
 * baseline (someone else — the phone, or Claude — wrote in between). A
 * conflict on one file doesn't block pushing the other.
 */
export async function pushLocal(): Promise<PushResult> {
  const { sync, doc, dirty: codexDirty } = useCodex.getState();
  if (!sync.gistId || !sync.token) {
    return { status: "error", error: { kind: "invalid", message: "Sync is not configured." } };
  }
  const cfg = { gistId: sync.gistId, token: sync.token };
  const gist = await fetchGistFiles(cfg);
  if (!gist.ok) return { status: "error", error: gist.error };

  const files: Record<string, string> = {};
  let codexConflict: CodexDoc | undefined;
  let listsConflict: RemoteLists | undefined;

  if (codexDirty) {
    const content = gist.files[GIST_FILE];
    const remote = content ? parseCodexDoc(content) : null;
    if (content && !remote) {
      return { status: "error", error: { kind: "invalid", message: `${GIST_FILE} is not a valid codex doc.` } };
    }
    if (remote && sync.remoteUpdated !== null && remote.updated !== sync.remoteUpdated) {
      codexConflict = remote;
    } else {
      files[GIST_FILE] = JSON.stringify(doc, null, 2);
    }
  }

  let listsPushed: RemoteLists | undefined;
  if (useLists.getState().dirty) {
    const content = gist.files[LISTS_FILE];
    if (content !== undefined) {
      const remote = parseRemoteLists(content);
      if (!remote) {
        return { status: "error", error: { kind: "invalid", message: `${LISTS_FILE} is not a valid lists doc.` } };
      }
      const baseline = useLists.getState().sync.remoteUpdated;
      if (baseline === null) {
        // Never synced but the remote file exists (e.g. offline edits before
        // the first pull): merge losslessly instead of clobbering it.
        useLists.getState().mergeRemote(remote);
      } else if (remote.updated !== baseline && remote.updated !== useLists.getState().updated) {
        listsConflict = remote;
      }
    }
    if (!listsConflict) {
      listsPushed = localListsSnapshot();
      files[LISTS_FILE] = JSON.stringify(listsPushed, null, 2);
    }
  }

  if (Object.keys(files).length > 0) {
    const saved = await saveRemoteFiles(cfg, files);
    if (!saved.ok) return { status: "error", error: saved.error };
    const now = new Date().toISOString();
    if (files[GIST_FILE]) useCodex.getState().markSynced(now, doc.updated);
    if (listsPushed) useLists.getState().markSynced(now, listsPushed.updated);
  }

  if (codexConflict) useSyncUi.getState().setCodexConflict(codexConflict);
  if (listsConflict) useSyncUi.getState().setListsConflict(listsConflict);
  if (codexConflict || listsConflict) {
    return { status: "conflict", remoteDoc: codexConflict, listsConflict };
  }
  return { status: Object.keys(files).length > 0 ? "pushed" : "up-to-date" };
}

// ---------------------------------------------------------------------------
// Conflict resolution

/** Resolve a codex conflict by keeping one side. */
export async function resolveConflict(keep: "local" | "remote", remoteDoc: CodexDoc) {
  useSyncUi.getState().setCodexConflict(null);
  if (keep === "remote") {
    useCodex.getState().setDoc(remoteDoc, { markClean: true });
    useCodex.getState().markSynced(new Date().toISOString(), remoteDoc.updated);
    return { status: "pulled" as const };
  }
  // Keep local: adopt the remote stamp as baseline, then overwrite it.
  useCodex.setState((s) => ({ sync: { ...s.sync, remoteUpdated: remoteDoc.updated } }));
  return pushLocal();
}

/** Resolve a lists conflict by keeping one side. */
export async function resolveListsConflict(keep: "local" | "remote", remote: RemoteLists) {
  useSyncUi.getState().setListsConflict(null);
  if (keep === "remote") {
    useLists.getState().adoptRemote(remote);
    useLists.getState().markSynced(new Date().toISOString(), remote.updated);
    return { status: "pulled" as const };
  }
  useLists.setState((s) => ({ sync: { ...s.sync, remoteUpdated: remote.updated } }));
  return pushLocal();
}

// ---------------------------------------------------------------------------
// Setup

/** First-time setup: create the gist (or adopt an existing one) and seed it. */
export async function setUpSync(token: string, gistIdInput: string | null) {
  const store = useCodex.getState();
  if (gistIdInput) {
    const gistId = normalizeGistId(gistIdInput);
    const gist = await fetchGistFiles({ gistId, token });
    if (!gist.ok) return { status: "error" as const, error: gist.error };
    const codexContent = gist.files[GIST_FILE];
    if (!codexContent) {
      return {
        status: "error" as const,
        error: { kind: "invalid", message: `Gist has no ${GIST_FILE} file.` } satisfies SyncFailure,
      };
    }
    const remoteDoc = parseCodexDoc(codexContent);
    if (!remoteDoc) {
      return {
        status: "error" as const,
        error: { kind: "invalid", message: `${GIST_FILE} is not a valid codex doc.` } satisfies SyncFailure,
      };
    }
    store.setSyncConfig({ gistId, token });
    // Lists reconcile first (adopt/merge/queue a push); conflicts can't happen
    // here — a fresh connection has no baseline.
    reconcileLists(gist.files[LISTS_FILE]);
    // Codex: adopt whichever side has content; remote wins when both do.
    const localEmpty = store.doc.updated === emptyCodexDoc().updated && !store.dirty;
    if (!localEmpty && remoteDoc.updated === emptyCodexDoc().updated) {
      return pushLocalWithBaseline(remoteDoc.updated);
    }
    useCodex.getState().setDoc(remoteDoc, { markClean: true });
    useCodex.getState().markSynced(new Date().toISOString(), remoteDoc.updated);
    return { status: "connected" as const };
  }
  const hasLists = Object.keys(useLists.getState().lists).length > 0;
  const listsSeed = hasLists ? localListsSnapshot() : undefined;
  const created = await createRemoteGist(token, store.doc, listsSeed);
  if (!created.ok) return { status: "error" as const, error: created.error };
  store.setSyncConfig({ gistId: created.gistId, token });
  const now = new Date().toISOString();
  useCodex.getState().markSynced(now, store.doc.updated);
  if (listsSeed) useLists.getState().markSynced(now, listsSeed.updated);
  return { status: "created" as const, gistId: created.gistId };
}

async function pushLocalWithBaseline(remoteUpdated: string) {
  useCodex.setState((s) => ({ sync: { ...s.sync, remoteUpdated } }));
  const pushed = await pushLocal();
  return pushed.status === "pushed" ? { status: "connected" as const } : pushed;
}

// ---------------------------------------------------------------------------
// Debounced auto-push: any codex or lists mutation schedules a push a few
// seconds out. Conflicts it hits land in the sync-ui store for the banner.

let autoPushTimer: ReturnType<typeof setTimeout> | null = null;
let started = false;

/** Call once from app bootstrap. Safe to call repeatedly. */
export function startAutoSync(): void {
  if (started) return;
  started = true;
  const schedule = () => {
    if (autoPushTimer) clearTimeout(autoPushTimer);
    autoPushTimer = setTimeout(() => {
      void pushLocal();
    }, 2500);
  };
  useCodex.subscribe((state, prev) => {
    if (!state.dirty || state.doc === prev.doc) return;
    if (!state.sync.gistId || !state.sync.token) return;
    schedule();
  });
  useLists.subscribe((state, prev) => {
    if (!state.dirty || state.updated === prev.updated) return;
    const { sync } = useCodex.getState();
    if (!sync.gistId || !sync.token) return;
    schedule();
  });
}
