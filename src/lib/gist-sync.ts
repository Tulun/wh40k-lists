/**
 * Syncs local data with one secret GitHub Gist — the single source of truth
 * shared between devices (and writable by Claude via the `gh` CLI when
 * transcribing screenshots).
 *
 * The gist holds two files: `codex.json` (the hand-authored codex doc) and
 * `lists.json` (saved lists + slot assignments). Divergence detection is per
 * file, by each doc's own `updated` stamp. When both sides moved, lists heal
 * themselves: each list is an independent document, so they merge per id
 * (newest copy wins, deletions tracked via the known-ids baseline) and the
 * merge is pushed back — no user interaction. Only the codex doc, one big
 * hand-edited document that can't be merged safely, still asks which side
 * wins (via the sync-ui store's global banner), and only when the two copies
 * actually differ in content.
 *
 * The token is entered by the user and stays in their browser storage; it is
 * sent only to api.github.com and never logged.
 */
import type { CodexDoc } from "./codex-model";
import { emptyCodexDoc } from "./codex-model";
import { useCodex } from "../store/codex";
import { useLists } from "../store/lists";
import { useSyncUi } from "../store/sync-ui";
import type { ListsSyncState, RemoteLists, SavedList, Slot } from "../store/schema";

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
// Lists merging + reconciliation (shared by pull, push, and setup)

/** A list's own edit stamp; remote files from older app versions lack it. */
function listStamp(l: SavedList): string {
  return l.updated ?? l.importedAt ?? "";
}

type LocalLists = {
  lists: Record<string, SavedList>;
  slots: Record<Slot, string | null>;
  updated: string | null;
  sync: ListsSyncState;
};

/**
 * Merge diverged local and remote lists. Each list is an independent document,
 * so per id the newer copy wins (remote on a tie). An id present on only one
 * side is a deletion when it was part of the last sync (though edits made
 * since still beat the deletion) and a creation otherwise. Slot pointers
 * follow the side whose overall stamp is newer, falling back to the other
 * side's pointer, then null, when the pointed-at list didn't survive.
 */
export function mergeLists(local: LocalLists, remote: RemoteLists): Pick<RemoteLists, "lists" | "slots"> {
  const known = new Set(local.sync.knownIds);
  const lists: Record<string, SavedList> = {};
  const ids = [...new Set([...Object.keys(remote.lists), ...Object.keys(local.lists)])].sort();
  for (const id of ids) {
    const mine = local.lists[id];
    const theirs = remote.lists[id];
    if (mine && theirs) {
      lists[id] = listStamp(mine) > listStamp(theirs) ? mine : theirs;
    } else if (mine) {
      const editedSinceSync = local.sync.lastSynced !== null && listStamp(mine) > local.sync.lastSynced;
      if (!known.has(id) || editedSinceSync) lists[id] = mine;
    } else if (theirs) {
      const editedSinceSync = local.sync.remoteUpdated !== null && listStamp(theirs) > local.sync.remoteUpdated;
      if (!known.has(id) || editedSinceSync) lists[id] = theirs;
    }
  }
  const sides =
    (local.updated ?? "") > remote.updated ? [local.slots, remote.slots] : [remote.slots, local.slots];
  const slots: Record<Slot, string | null> = { mine: null, opponent: null };
  for (const slot of ["mine", "opponent"] as const) {
    slots[slot] = sides.map((side) => side[slot]).find((id) => id && lists[id]) ?? null;
  }
  return { lists, slots };
}

/** True when the merge kept exactly the remote copy — nothing left to push. */
function mergeEqualsRemote(merged: Pick<RemoteLists, "lists" | "slots">, remote: RemoteLists): boolean {
  const ids = Object.keys(merged.lists);
  return (
    ids.length === Object.keys(remote.lists).length &&
    ids.every((id) => merged.lists[id] === remote.lists[id]) &&
    merged.slots.mine === remote.slots.mine &&
    merged.slots.opponent === remote.slots.opponent
  );
}

type ListsPullStatus = "up-to-date" | "pulled" | "merged" | "push-needed" | "invalid";

/**
 * Reconcile local lists against the remote lists.json content (`undefined`
 * when the gist predates lists sync and has no such file yet): unchanged →
 * keep local, moved + clean → adopt remote, moved + dirty (or never synced
 * with local content) → merge per list and queue the merge for push.
 */
function reconcileLists(remoteContent: string | undefined): { status: ListsPullStatus } {
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

  if (state.sync.remoteUpdated === null && !hasLocal) {
    state.adoptRemote(remote);
    useLists.getState().markSynced(now, remote.updated);
    return { status: "pulled" };
  }

  if (remote.updated === state.sync.remoteUpdated || remote.updated === state.updated) {
    if (!state.dirty) useLists.getState().markSynced(now, remote.updated);
    return { status: "up-to-date" };
  }
  if (!state.dirty && state.sync.remoteUpdated !== null) {
    state.adoptRemote(remote);
    useLists.getState().markSynced(now, remote.updated);
    return { status: "pulled" };
  }

  // Both sides moved (or this device never synced): merge instead of asking.
  const merged = mergeLists(state, remote);
  if (mergeEqualsRemote(merged, remote)) {
    state.adoptRemote(remote);
    useLists.getState().markSynced(now, remote.updated);
    return { status: "pulled" };
  }
  useLists.getState().adoptMerged(merged, remote.updated);
  return { status: "merged" };
}

// ---------------------------------------------------------------------------
// Pull / push

export type PullResult =
  | { status: "up-to-date" | "pulled" | "conflict"; remoteDoc?: CodexDoc }
  | { status: "error"; error: SyncFailure };

/** Content equality ignoring the `updated` stamp (best effort — key order matters). */
function sameDocContent(a: CodexDoc, b: CodexDoc): boolean {
  return JSON.stringify({ ...a, updated: "" }) === JSON.stringify({ ...b, updated: "" });
}

let pullInFlight: Promise<PullResult> | null = null;

/**
 * Pull both files into their stores (coalescing overlapping calls). Per file:
 * - Remote unchanged since our baseline → keep local (it may carry edits).
 * - Remote changed and local is clean → take remote.
 * - Remote changed and local is dirty → lists merge per list and queue a
 *   push; the codex doc adopts the remote stamp silently when the contents
 *   match, and otherwise records a conflict for the banner.
 */
export function pullRemote(): Promise<PullResult> {
  pullInFlight ??= doPullRemote().finally(() => {
    pullInFlight = null;
  });
  return pullInFlight;
}

async function doPullRemote(): Promise<PullResult> {
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
    if (sameDocContent(remote, useCodex.getState().doc)) {
      // Same content, different stamps (e.g. both devices resolved the same
      // way) — adopt the remote copy silently instead of raising a conflict.
      useCodex.getState().setDoc(remote, { markClean: true });
      useCodex.getState().markSynced(now, remote.updated);
    } else {
      codexStatus = "conflict";
    }
  } else {
    useCodex.getState().setDoc(remote, { markClean: true });
    useCodex.getState().markSynced(now, remote.updated);
    codexStatus = "pulled";
  }

  const lists = reconcileLists(gist.files[LISTS_FILE]);
  if (lists.status === "invalid") {
    return { status: "error", error: { kind: "invalid", message: `${LISTS_FILE} is not a valid lists doc.` } };
  }

  if (codexStatus === "conflict") {
    useSyncUi.getState().setCodexConflict(remote);
    return { status: "conflict", remoteDoc: remote };
  }
  if (codexStatus === "pulled" || lists.status === "pulled" || lists.status === "merged") {
    return { status: "pulled" };
  }
  return { status: "up-to-date" };
}

export type PushResult =
  | { status: "pushed" | "up-to-date" | "conflict"; remoteDoc?: CodexDoc }
  | { status: "error"; error: SyncFailure };

/**
 * Push whatever is dirty. When the remote moved since our baseline (someone
 * else — the phone, or Claude — wrote in between), lists merge per list and
 * the merge is pushed; the codex doc is refused only when the contents truly
 * differ, and that conflict doesn't block pushing the lists file.
 */
export async function pushLocal(): Promise<PushResult> {
  const { sync, doc, dirty: codexDirty } = useCodex.getState();
  if (!sync.gistId || !sync.token) {
    return { status: "error", error: { kind: "invalid", message: "Sync is not configured." } };
  }
  if (!codexDirty && !useLists.getState().dirty) return { status: "up-to-date" };
  const cfg = { gistId: sync.gistId, token: sync.token };
  const gist = await fetchGistFiles(cfg);
  if (!gist.ok) return { status: "error", error: gist.error };

  const files: Record<string, string> = {};
  let codexConflict: CodexDoc | undefined;

  if (codexDirty) {
    const content = gist.files[GIST_FILE];
    const remote = content ? parseCodexDoc(content) : null;
    if (content && !remote) {
      return { status: "error", error: { kind: "invalid", message: `${GIST_FILE} is not a valid codex doc.` } };
    }
    if (remote && sync.remoteUpdated !== null && remote.updated !== sync.remoteUpdated) {
      if (sameDocContent(remote, doc)) {
        useCodex.getState().setDoc(remote, { markClean: true });
        useCodex.getState().markSynced(new Date().toISOString(), remote.updated);
      } else {
        codexConflict = remote;
      }
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
      const state = useLists.getState();
      if (remote.updated !== state.sync.remoteUpdated && remote.updated !== state.updated) {
        // Remote moved under us (or this device never synced): merge per list
        // and push the merge — or just adopt the remote copy when the merge
        // kept exactly it.
        const merged = mergeLists(state, remote);
        if (mergeEqualsRemote(merged, remote)) {
          state.adoptRemote(remote);
          useLists.getState().markSynced(new Date().toISOString(), remote.updated);
        } else {
          useLists.getState().adoptMerged(merged, remote.updated);
        }
      }
    }
    if (useLists.getState().dirty) {
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

  if (codexConflict) {
    useSyncUi.getState().setCodexConflict(codexConflict);
    return { status: "conflict", remoteDoc: codexConflict };
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
    // Lists reconcile first (adopt, or merge and queue a push).
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
