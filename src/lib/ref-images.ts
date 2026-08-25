/**
 * Reference images for the codex editor: leak-page screenshots attached to an
 * entity so its data can be typed in side-by-side. Stored in IndexedDB on
 * this device only — images never sync to the gist and never leave the
 * browser.
 */

const DB_NAME = "40k-viewer-ref-images";
const STORE = "images";

export interface RefImage {
  id: string;
  /** `${factionId}:${kind}:${entityId}` — see refImageKey. */
  entityKey: string;
  blob: Blob;
  addedAt: string;
}

export function refImageKey(factionId: string, kind: "datasheet" | "detachment" | "faction", id: string) {
  return `${factionId}:${kind}:${id}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("entityKey", "entityKey");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB unavailable"));
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
        t.oncomplete = () => db.close();
      }),
  );
}

export async function addRefImage(entityKey: string, blob: Blob): Promise<RefImage> {
  const image: RefImage = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    entityKey,
    blob,
    addedAt: new Date().toISOString(),
  };
  await tx("readwrite", (store) => store.add(image));
  return image;
}

export function listRefImages(entityKey: string): Promise<RefImage[]> {
  return tx("readonly", (store) => store.index("entityKey").getAll(entityKey));
}

export async function deleteRefImage(id: string): Promise<void> {
  await tx("readwrite", (store) => store.delete(id));
}
