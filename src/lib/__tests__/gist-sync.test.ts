/**
 * Gist sync against a mocked GitHub API: load/save/create plumbing, error
 * typing, and the pull/push conflict baseline held in the codex store.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CodexDoc } from "../codex-model";
import { emptyCodexDoc } from "../codex-model";
import {
  GIST_FILE,
  createRemoteGist,
  loadRemoteDoc,
  normalizeGistId,
  pullRemote,
  pushLocal,
  saveRemoteDoc,
} from "../gist-sync";
import { useCodex } from "../../store/codex";

const CFG = { gistId: "abc123abc123abc123", token: "ghp_test" };

function doc(updated: string): CodexDoc {
  return { version: 1, updated, factions: {} };
}

function gistResponse(content: string) {
  return new Response(JSON.stringify({ files: { [GIST_FILE]: { content } } }), { status: 200 });
}

const initialState = useCodex.getState();

beforeEach(() => {
  useCodex.setState({
    ...initialState,
    doc: emptyCodexDoc(),
    sync: { gistId: null, token: null, lastSynced: null, remoteUpdated: null },
    dirty: false,
  });
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

  it("reports a conflict when remote moved and local is dirty", async () => {
    useCodex.setState({
      doc: doc("LOCAL"),
      sync: { gistId: CFG.gistId, token: CFG.token, lastSynced: null, remoteUpdated: "T0" },
      dirty: true,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(gistResponse(JSON.stringify(doc("T5")))));
    const result = await pullRemote();
    expect(result.status).toBe("conflict");
    expect(useCodex.getState().doc.updated).toBe("LOCAL");
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
      doc: doc("LOCAL2"),
      sync: { gistId: CFG.gistId, token: CFG.token, lastSynced: null, remoteUpdated: "T0" },
      dirty: true,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(gistResponse(JSON.stringify(doc("SOMEONE-ELSE")))));
    result = await pushLocal();
    expect(result.status).toBe("conflict");
  });
});
