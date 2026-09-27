/**
 * Reference images: leak-page screenshots attached to a codex editor entity
 * so its data can be typed in side-by-side, and photos of the player's own
 * mission cards. Stored in IndexedDB on this device only — images never sync
 * to the gist and never leave the browser.
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

export function refImageKey(
  factionId: string,
  kind: "datasheet" | "detachment" | "faction",
  id: string,
) {
  return `${factionId}:${kind}:${id}`;
}

/** Photos of a printed primary mission card (front, back…). */
export function missionPhotoKey(missionId: string) {
  return `core:mission:${missionId}`;
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

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        // Settle on the transaction: a write can still abort (e.g. over quota)
        // after its request succeeds.
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        t.oncomplete = () => {
          db.close();
          resolve(req.result);
        };
        const fail = () => {
          db.close();
          reject(t.error ?? req.error ?? new Error("IndexedDB transaction failed"));
        };
        t.onabort = fail;
        t.onerror = fail;
      }),
  );
}

/** Longest side kept on import — plenty to read a card, far smaller than a phone photo. */
const MAX_SIDE = 2400;

/**
 * Downscale big photos to a JPEG and always return a plain in-memory Blob:
 * iOS Safari can fail to persist a File from <input type="file"> in IndexedDB.
 */
async function prepareImage(file: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale < 1) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const jpeg = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
      if (jpeg) return jpeg;
    } else {
      bitmap.close();
    }
  } catch {
    // Undecodable here (e.g. HEIC on desktop) — store the original bytes.
  }
  return new Blob([await file.arrayBuffer()], { type: file.type });
}

export async function addRefImage(entityKey: string, file: Blob): Promise<RefImage> {
  const image: RefImage = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    entityKey,
    blob: await prepareImage(file),
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
