/**
 * Gist sync against a mocked GitHub API: load/save/create plumbing, error
 * typing, the per-file pull/push divergence baselines held in the codex and
 * lists stores, and the per-list auto-merge.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CodexDoc } from "../codex-model";
import { emptyCodexDoc } from "../codex-model";
import {
  GIST_FILE,
  LISTS_FILE,
  createRemoteGist,
  loadRemoteDoc,
  normalizeGistId,
  pullRemote,
  pushLocal,
  saveRemoteDoc,
} from "../gist-sync";
import { useCodex } from "../../store/codex";
import { useLists } from "../../store/lists";
import { useSyncUi } from "../../store/sync-ui";
import type { RemoteLists, SavedList } from "../../store/schema";

const CFG = { gistId: "abc123abc123abc123", token: "ghp_test" };

function doc(updated: string, factions: CodexDoc["factions"] = {}): CodexDoc {
  return { version: 1, updated, factions };
}

/** Distinct codex content, so stamp divergence doesn't short-circuit as equal. */
function distinctFactions(name: string): CodexDoc["factions"] {
  return { [name]: { name } } as unknown as CodexDoc["factions"];
}

function savedList(id: string, name = id, updated?: string): SavedList {
  return { id, name, updated } as SavedList;
}

function remoteLists(updated: string, lists: Record<string, SavedList>): RemoteLists {
  return { version: 1, updated, lists, slots: { mine: null, opponent: null } };
}

function gistResponse(content: string, extraFiles: Record<string, string> = {}) {
  const files: Record<string, { content: string }> = { [GIST_FILE]: { content } };
  for (const [name, c] of Object.entries(extraFiles)) files[name] = { content: c };
  return new Response(JSON.stringify({ files }), { status: 200 });
}

const initialState = useCodex.getState();
const initialLists = useLists.getState();

beforeEach(() => {
  useCodex.setState({
    ...initialState,
    doc: emptyCodexDoc(),
    sync: { gistId: null, token: null, lastSynced: null, remoteUpdated: null },
    dirty: false,
  });
  useLists.setState({
    ...initialLists,
    lists: {},
    slots: { mine: null, opponent: null },
    activeSlot: "mine",
    updated: null,
    dirty: false,
    sync: { lastSynced: null, remoteUpdated: null, knownIds: [] },
  });
  useSyncUi.setState({ codexConflict: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("normalizeGistId", () => {
  it("accepts bare ids and full URLs", () => {
    expect(normalizeGistId("abc123abc123abc123")).toBe("abc123abc123abc123");
    expect(normalizeGistId("https://gist.github.com/user/abc123abc123abc123")).toBe(
      "abc123abc123abc123",
    );
  });
});

describe("loadRemoteDoc", () => {
  it("parses the doc out of the gist file", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(gistResponse(JSON.stringify(doc("T1")))));
    const result = await loadRemoteDoc(CFG);
    expect(result.ok && result.doc.updated).toBe("T1");
  });

  it("types auth and missing-gist failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 401 })));
    let result = await loadRemoteDoc(CFG);
    expect(!result.ok && result.error.kind).toBe("auth");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 404 })));
    result = await loadRemoteDoc(CFG);
    expect(!result.ok && result.error.kind).toBe("not-found");

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    result = await loadRemoteDoc(CFG);
    expect(!result.ok && result.error.kind).toBe("network");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(gistResponse("not json{")));
    result = await loadRemoteDoc(CFG);
    expect(!result.ok && result.error.kind).toBe("invalid");
  });
});

describe("saveRemoteDoc / createRemoteGist", () => {
  it("PATCHes the doc into the gist file", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await saveRemoteDoc(CFG, doc("T2"));
    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(CFG.gistId);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string).files[GIST_FILE].content).toContain('"updated": "T2"');
  });

  it("POSTs a secret gist and returns its id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "newgist" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await createRemoteGist("tok", doc("T0"));
    expect(result.ok && result.gistId).toBe("newgist");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).public).toBe(false);
  });
});

describe("pullRemote / pushLocal", () => {
  it("pulls a newer remote when local is clean", async () => {
    useCodex.setState({
      sync: { gistId: CFG.gistId, token: CFG.token, lastSynced: null, remoteUpdated: "T0" },
      dirty: false,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(gistResponse(JSON.stringify(doc("T5")))));
    const result = await pullRemote();
    expect(result.status).toBe("pulled");
    expect(useCodex.getState().doc.updated).toBe("T5");
    expect(useCodex.getState().sync.remoteUpdated).toBe("T5");
  });

  it("reports a conflict when remote moved and local is dirty with different content", async () => {
    useCodex.setState({
      doc: doc("LOCAL", distinctFactions("orks")),
      sync: { gistId: CFG.gistId, token: CFG.token, lastSynced: null, remoteUpdated: "T0" },
      dirty: true,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(gistResponse(JSON.stringify(doc("T5", distinctFactions("aeldari"))))),
    );
    const result = await pullRemote();
    expect(result.status).toBe("conflict");
    expect(useCodex.getState().doc.updated).toBe("LOCAL");
    expect(useSyncUi.getState().codexConflict?.updated).toBe("T5");
  });

  it("adopts the remote stamp silently when a 'conflict' has identical content", async () => {
    useCodex.setState({
      doc: doc("LOCAL", distinctFactions("orks")),
      sync: { gistId: CFG.gistId, token: CFG.token, lastSynced: null, remoteUpdated: "T0" },
      dirty: true,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(gistResponse(JSON.stringify(doc("T5", distinctFactions("orks"))))),
    );
    const result = await pullRemote();
    expect(result.status).toBe("up-to-date");
    expect(useCodex.getState().doc.updated).toBe("T5");
    expect(useCodex.getState().dirty).toBe(false);
    expect(useSyncUi.getState().codexConflict).toBeNull();
  });

  it("pushes when the remote matches the baseline, refuses when it moved", async () => {
    useCodex.setState({
      doc: doc("LOCAL"),
      sync: { gistId: CFG.gistId, token: CFG.token, lastSynced: null, remoteUpdated: "T0" },
      dirty: true,
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(gistResponse(JSON.stringify(doc("T0"))))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    let result = await pushLocal();
    expect(result.status).toBe("pushed");
    expect(useCodex.getState().dirty).toBe(false);
    expect(useCodex.getState().sync.remoteUpdated).toBe("LOCAL");

    useCodex.setState({
      doc: doc("LOCAL2", distinctFactions("orks")),
      sync: { gistId: CFG.gistId, token: CFG.token, lastSynced: null, remoteUpdated: "T0" },
      dirty: true,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(gistResponse(JSON.stringify(doc("SOMEONE-ELSE", distinctFactions("aeldari"))))),
    );
    result = await pushLocal();
    expect(result.status).toBe("conflict");
  });
});

describe("lists sync", () => {
  /** Codex side pinned up-to-date at T0 so only the lists behavior varies. */
  function connect() {
    useCodex.setState({
      sync: { gistId: CFG.gistId, token: CFG.token, lastSynced: null, remoteUpdated: "T0" },
      dirty: false,
    });
  }
  const codexJson = JSON.stringify(doc("T0"));

  it("first sync with empty local lists adopts the remote copy", async () => {
    connect();
    const remote = remoteLists("L1", { a: savedList("a") });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(gistResponse(codexJson, { [LISTS_FILE]: JSON.stringify(remote) })),
    );
    const result = await pullRemote();
    expect(result.status).toBe("pulled");
    const s = useLists.getState();
    expect(Object.keys(s.lists)).toEqual(["a"]);
    expect(s.dirty).toBe(false);
    expect(s.sync.remoteUpdated).toBe("L1");
  });

  it("first sync with lists on both sides merges losslessly, remote winning collisions", async () => {
    connect();
    useLists.setState({
      lists: { a: savedList("a", "local a"), b: savedList("b") },
      updated: "LOCAL",
    });
    const remote = remoteLists("L1", { a: savedList("a", "remote a"), c: savedList("c") });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(gistResponse(codexJson, { [LISTS_FILE]: JSON.stringify(remote) })),
    );
    await pullRemote();
    const s = useLists.getState();
    expect(Object.keys(s.lists).sort()).toEqual(["a", "b", "c"]);
    expect(s.lists.a.name).toBe("remote a");
    expect(s.dirty).toBe(true); // merged result queued for push
  });

  it("creates lists.json on push when the gist predates lists sync", async () => {
    connect();
    useLists.setState({ lists: { a: savedList("a") }, updated: "LOCAL" });
    // Pull sees no lists.json and stamps local dirty for the push.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(gistResponse(codexJson)));
    await pullRemote();
    expect(useLists.getState().dirty).toBe(true);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(gistResponse(codexJson))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await pushLocal();
    expect(result.status).toBe("pushed");
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { files: Record<string, { content: string }> };
    expect(Object.keys(body.files)).toEqual([LISTS_FILE]); // codex clean — not re-pushed
    expect(body.files[LISTS_FILE].content).toContain('"a"');
    expect(useLists.getState().dirty).toBe(false);
    expect(useLists.getState().sync.remoteUpdated).not.toBeNull();
  });

  it("merges per list when remote moved and local is dirty — newest copy of each wins", async () => {
    connect();
    useLists.setState({
      lists: { a: savedList("a", "a edited here", "T9"), b: savedList("b", "b new here", "T8") },
      updated: "T9",
      dirty: true,
      sync: { lastSynced: "T5", remoteUpdated: "L0", knownIds: ["a"] },
    });
    // Remote kept an older copy of `a` and added `z`.
    const remote = remoteLists("L5", { a: savedList("a", "a stale", "T2"), z: savedList("z", "z", "T7") });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(gistResponse(codexJson, { [LISTS_FILE]: JSON.stringify(remote) })),
    );
    const pulled = await pullRemote();
    expect(pulled.status).toBe("pulled");
    const s = useLists.getState();
    expect(Object.keys(s.lists).sort()).toEqual(["a", "b", "z"]);
    expect(s.lists.a.name).toBe("a edited here"); // newer local copy won
    expect(s.dirty).toBe(true); // merge queued for push
    expect(s.sync.remoteUpdated).toBe("L5"); // baseline adopted so the push isn't refused
    expect(useSyncUi.getState().codexConflict).toBeNull();
  });

  it("propagates a remote deletion through the merge, but an edit beats it", async () => {
    connect();
    useLists.setState({
      lists: {
        // Synced before, untouched since → the remote deletion wins.
        stale: savedList("stale", "stale", "T2"),
        // Synced before, edited after lastSynced → survives the remote deletion.
        edited: savedList("edited", "edited", "T9"),
      },
      updated: "T9",
      dirty: true,
      sync: { lastSynced: "T5", remoteUpdated: "L0", knownIds: ["stale", "edited"] },
    });
    const remote = remoteLists("L5", {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(gistResponse(codexJson, { [LISTS_FILE]: JSON.stringify(remote) })),
    );
    await pullRemote();
    expect(Object.keys(useLists.getState().lists)).toEqual(["edited"]);
    expect(useLists.getState().dirty).toBe(true);
  });

  it("adopts the remote copy cleanly when the merge keeps exactly it", async () => {
    connect();
    // Local dirty edit is an older copy of `a` than the remote's — the merge
    // resolves entirely to the remote side, so nothing needs pushing.
    useLists.setState({
      lists: { a: savedList("a", "a old", "T2") },
      updated: "T2",
      dirty: true,
      sync: { lastSynced: "T1", remoteUpdated: "L0", knownIds: ["a"] },
    });
    const remote = remoteLists("L5", { a: savedList("a", "a newer", "T8") });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(gistResponse(codexJson, { [LISTS_FILE]: JSON.stringify(remote) })),
    );
    const pulled = await pullRemote();
    expect(pulled.status).toBe("pulled");
    const s = useLists.getState();
    expect(s.lists.a.name).toBe("a newer");
    expect(s.dirty).toBe(false);
    expect(s.sync.remoteUpdated).toBe("L5");
  });

  it("push merges diverged lists and sends the merge alongside dirty codex edits", async () => {
    connect();
    useCodex.setState({ doc: doc("T0"), dirty: true });
    useLists.setState({
      lists: { a: savedList("a", "a", "T9") },
      updated: "T9",
      dirty: true,
      sync: { lastSynced: "T5", remoteUpdated: "L0", knownIds: ["a"] },
    });
    const remote = remoteLists("L5", { a: savedList("a", "a", "T1"), z: savedList("z", "z", "T7") });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(gistResponse(codexJson, { [LISTS_FILE]: JSON.stringify(remote) }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await pushLocal();
    expect(result.status).toBe("pushed");
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { files: Record<string, { content: string }> };
    expect(Object.keys(body.files).sort()).toEqual([GIST_FILE, LISTS_FILE].sort());
    const pushedLists = JSON.parse(body.files[LISTS_FILE].content) as RemoteLists;
    expect(Object.keys(pushedLists.lists).sort()).toEqual(["a", "z"]);
    expect(useCodex.getState().dirty).toBe(false);
    expect(useLists.getState().dirty).toBe(false);
  });
});
