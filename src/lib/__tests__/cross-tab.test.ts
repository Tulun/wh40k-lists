/**
 * Cross-tab write safety: persist writes the WHOLE lists state, so a tab
 * holding stale state (a frozen background tab misses `storage` events and
 * never gets them replayed) used to clobber lists saved in another tab — the
 * "imported list vanishes / deleted blank list resurrects" bug. Every writer
 * now re-reads storage before writing over a copy it hasn't seen, and
 * markSynced only baselines the exact copy that was pushed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GIST_FILE, LISTS_FILE, pullRemote } from "../gist-sync";
import { useCodex } from "../../store/codex";
import { useLists } from "../../store/lists";
import { STORAGE_KEY, STORAGE_VERSION } from "../../store/schema";
import type { PersistedState, RemoteLists, SavedList } from "../../store/schema";

const CFG = { gistId: "abc123abc123abc123", token: "ghp_test" };

function savedList(id: string, name = id, updated?: string): SavedList {
  return { id, name, updated } as SavedList;
}

/** Serialize a lists state the way zustand persist stores it. */
function persistedRaw(state: Partial<PersistedState>): string {
  return JSON.stringify({ state, version: STORAGE_VERSION });
}

function storageStub() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: () => null,
    get length() {
      return data.size;
    },
  };
}

const initialCodex = useCodex.getState();
const initialLists = useLists.getState();
let stub: ReturnType<typeof storageStub>;

beforeEach(() => {
  stub = storageStub();
  vi.stubGlobal("localStorage", stub);
  useCodex.setState({
    ...initialCodex,
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
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("absorbing foreign storage writes", () => {
  it("a mutation absorbs a newer copy another tab wrote instead of erasing it", () => {
    useLists.setState({ lists: { a: savedList("a") }, updated: "T1" });
    // Another tab imported `b` and persisted the whole state (this tab was
    // frozen and never saw the `storage` event).
    stub.setItem(
      STORAGE_KEY,
      persistedRaw({
        lists: { a: savedList("a"), b: savedList("b", "imported elsewhere", "T2") },
        slots: { mine: "b", opponent: null },
        activeSlot: "mine",
        updated: "T2",
        dirty: true,
        sync: { lastSynced: null, remoteUpdated: null, knownIds: [] },
      }),
    );

    useLists.getState().saveList(savedList("c", "saved here"));

    const s = useLists.getState();
    expect(Object.keys(s.lists).sort()).toEqual(["a", "b", "c"]);
    expect(s.slots.mine).toBe("b"); // the foreign slot assignment survives too
    // And the persisted copy carries the union, not this tab's stale view.
    const written = JSON.parse(stub.getItem(STORAGE_KEY)!) as { state: PersistedState };
    expect(Object.keys(written.state.lists).sort()).toEqual(["a", "b", "c"]);
  });

  it("a clean pull cannot drop a list another tab saved but has not pushed yet", async () => {
    // This (frozen) tab's memory: clean, synced at baseline L0, only `a`.
    useLists.setState({
      lists: { a: savedList("a", "a", "T1") },
      updated: "T1",
      dirty: false,
      sync: { lastSynced: "T1", remoteUpdated: "L0", knownIds: ["a"] },
    });
    // Another tab imported `b` (not yet pushed) and persisted it.
    stub.setItem(
      STORAGE_KEY,
      persistedRaw({
        lists: { a: savedList("a", "a", "T1"), b: savedList("b", "fresh import", "T9") },
        slots: { mine: "b", opponent: null },
        activeSlot: "mine",
        updated: "T9",
        dirty: true,
        sync: { lastSynced: "T1", remoteUpdated: "L0", knownIds: ["a"] },
      }),
    );
    // Remote moved (any other device); the stale clean tab would have adopted
    // it wholesale and erased `b` everywhere.
    useCodex.setState({
      sync: { ...CFG, lastSynced: null, remoteUpdated: "T0" },
      dirty: false,
    });
    const remote: RemoteLists = {
      version: 1,
      updated: "L5",
      lists: { a: savedList("a", "a", "T1") },
      slots: { mine: "a", opponent: null },
    };
    const files = {
      [GIST_FILE]: { content: JSON.stringify({ version: 1, updated: "T0", factions: {} }) },
      [LISTS_FILE]: { content: JSON.stringify(remote) },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ files }), { status: 200 })),
    );

    await pullRemote();

    const s = useLists.getState();
    expect(Object.keys(s.lists).sort()).toEqual(["a", "b"]);
    expect(s.dirty).toBe(true); // the merge keeps `b` queued for push
  });
});

describe("markSynced baselines only the pushed copy", () => {
  it("keeps a save that landed mid-push dirty and out of knownIds", () => {
    // Push snapshotted {a} at T5; while the PATCH was in flight, `b` was saved.
    useLists.setState({
      lists: { a: savedList("a", "a", "T5"), b: savedList("b", "raced save", "T9") },
      updated: "T9",
      dirty: true,
    });
    useLists.getState().markSynced("NOW", "T5", { ids: ["a"], localUpdated: "T5" });
    const s = useLists.getState();
    expect(s.dirty).toBe(true); // `b` still needs pushing
    expect(s.sync.knownIds).toEqual(["a"]); // `b` is a creation, not remote-deleted
  });

  it("clears dirty when the store still matches the pushed copy", () => {
    useLists.setState({ lists: { a: savedList("a", "a", "T5") }, updated: "T5", dirty: true });
    useLists.getState().markSynced("NOW", "T5", { ids: ["a"], localUpdated: "T5" });
    expect(useLists.getState().dirty).toBe(false);
    expect(useLists.getState().sync.knownIds).toEqual(["a"]);
  });

  it("codex: an edit that landed mid-push stays dirty", () => {
    useCodex.setState({
      doc: { version: 1, updated: "T9", factions: {} },
      dirty: true,
    });
    useCodex.getState().markSynced("NOW", "T5", "T5"); // pushed copy was T5
    expect(useCodex.getState().dirty).toBe(true);
    useCodex.getState().markSynced("NOW", "T9", "T9");
    expect(useCodex.getState().dirty).toBe(false);
  });
});
