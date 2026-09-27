/**
 * Mission layout maps from GW's Warhammer Event Companion PDF. The PDF is
 * imported per device and kept in IndexedDB; it never ships with the app or
 * syncs to the gist. pdf.js (legacy build, for older iOS Safari) is loaded
 * only when a map is shown.
 */
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { Data40k } from "./data";
import { DISPOSITIONS } from "./codex-model";

export const EVENT_COMPANION_URL =
  "https://assets.warhammer-community.com/eng_wh40k_event_companion-pl87i44rzn-a7ieny8i9x.pdf";

export const LAYOUTS = ["A", "B", "C"] as const;
export type Layout = (typeof LAYOUTS)[number];

/** Pairing key → 1-based page number. Key: sorted disposition ids + layout. */
export type MissionPageIndex = Record<string, number>;

export interface MissionPack {
  id: "event-companion";
  fileName: string;
  blob: Blob;
  index: MissionPageIndex;
  importedAt: string;
}

export function pageKey(a: string, b: string, layout: Layout): string {
  const [x, y] = [a, b].sort();
  return `${x}|${y}|${layout}`;
}

/** One cell pair of the matrix: dispositions and the primary each side plays. */
export interface Pairing {
  a: string;
  b: string;
  /** Mission names, as the dataset spells them. */
  missions: string[];
}

/** The primary a player with `mine` plays against `theirs`, by name. */
export function primaryFor(data: Data40k, mine: string, theirs: string): string | undefined {
  const id = data.missionMatchups.all.find(
    (m) => m.disposition === mine && m.opponent_disposition === theirs,
  )?.mission_id;
  return id ? (data.missions.all.find((m) => m.id === id)?.name ?? id) : undefined;
}

/** The 15 unordered disposition pairings with both sides' primaries. */
export function missionPairings(data: Data40k): Pairing[] {
  const ids = DISPOSITIONS.map((d) => d.id);
  return ids.flatMap((a, i) =>
    ids.slice(i).map((b) => {
      const names = [primaryFor(data, a, b), primaryFor(data, b, a)].filter((n) => n != null);
      return { a, b, missions: [...new Set(names)] };
    }),
  );
}

/** Uppercase letters only, so PDF text splits and curly quotes don't matter. */
const squash = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, "");

/**
 * Which pairing + layout one page of text shows, or null. A map page names
 * both sides' primaries (once for a mirror matchup) and "LAYOUT A/B/C"; the
 * intro page lists layouts but no mission names, so it never matches.
 */
export function matchMissionPage(text: string, pairings: Pairing[]): string | null {
  const layout = /\bLAYOUT\s+([ABC])\b/.exec(text.toUpperCase().replace(/\s+/g, " "))?.[1];
  if (!layout) return null;
  const flat = squash(text);
  const allNames = new Set(pairings.flatMap((p) => p.missions.map(squash)));
  const present = [...allNames].filter((n) => flat.includes(n));
  const hit = pairings.find((p) => {
    const want = new Set(p.missions.map(squash));
    return present.length === want.size && present.every((n) => want.has(n));
  });
  return hit ? pageKey(hit.a, hit.b, layout as Layout) : null;
}

type PdfJs = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfJs> | null = null;

function loadPdfjs(): Promise<PdfJs> {
  pdfjsPromise ??= Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
  ]).then(([lib, worker]) => {
    const pdfjs = lib as PdfJs;
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  });
  return pdfjsPromise;
}

async function openPdf(bytes: ArrayBuffer): Promise<PDFDocumentProxy> {
  const pdfjs = await loadPdfjs();
  return pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
}

/** Scan every page and map each pairing + layout to its page. */
export async function indexMissionPdf(
  bytes: ArrayBuffer,
  pairings: Pairing[],
  onProgress?: (done: number, total: number) => void,
): Promise<MissionPageIndex> {
  const doc = await openPdf(bytes);
  const index: MissionPageIndex = {};
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const text = content.items.map((it) => ("str" in it ? it.str : "")).join(" ");
      const key = matchMissionPage(text, pairings);
      if (key && !(key in index)) index[key] = n;
      onProgress?.(n, doc.numPages);
    }
  } finally {
    await doc.loadingTask.destroy();
  }
  return index;
}

// ---- IndexedDB -------------------------------------------------------------

const DB_NAME = "40k-viewer-mission-pack";
const STORE = "packs";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "id" });
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
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
        t.oncomplete = () => db.close();
      }),
  );
}

let openDoc: { pack: MissionPack; doc: Promise<PDFDocumentProxy> } | null = null;

export async function loadMissionPack(): Promise<MissionPack | null> {
  return (await tx<MissionPack | undefined>("readonly", (s) => s.get("event-companion"))) ?? null;
}

export async function saveMissionPack(file: File, index: MissionPageIndex): Promise<MissionPack> {
  const pack: MissionPack = {
    id: "event-companion",
    fileName: file.name,
    blob: file,
    index,
    importedAt: new Date().toISOString(),
  };
  await tx("readwrite", (s) => s.put(pack));
  closeOpenDoc();
  return pack;
}

export async function deleteMissionPack(): Promise<void> {
  await tx("readwrite", (s) => s.delete("event-companion"));
  closeOpenDoc();
}

function closeOpenDoc() {
  const prev = openDoc;
  openDoc = null;
  void prev?.doc.then((d) => d.loadingTask.destroy()).catch(() => {});
}

/** The pack's parsed PDF, opened once and reused across layout switches. */
function docFor(pack: MissionPack): Promise<PDFDocumentProxy> {
  if (openDoc?.pack !== pack) {
    closeOpenDoc();
    openDoc = { pack, doc: pack.blob.arrayBuffer().then(openPdf) };
  }
  return openDoc.doc;
}

/**
 * Fraction of the page that holds the matchup header + map; the rest is
 * margin and page number (measured across all 45 map pages, plus slack).
 */
const CROP = { x0: 0.13, x1: 0.87, y0: 0.07, y1: 0.92 };

/**
 * Draw one map page into the canvas at `cssWidth`, sharp on hi-dpi screens.
 * Aborting cancels the render, since pdf.js rejects overlapping renders into
 * one canvas.
 */
export async function renderMissionPage(
  pack: MissionPack,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  cssWidth: number,
  signal: AbortSignal,
): Promise<void> {
  const doc = await docFor(pack);
  const page = await doc.getPage(pageNumber);
  if (signal.aborted) return;
  const base = page.getViewport({ scale: 1 });
  const cropW = base.width * (CROP.x1 - CROP.x0);
  const cropH = base.height * (CROP.y1 - CROP.y0);
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const scale = (cssWidth / cropW) * dpr;
  const viewport = page.getViewport({ scale });
  canvas.width = Math.round(cropW * scale);
  canvas.height = Math.round(cropH * scale);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${(cssWidth * cropH) / cropW}px`;
  const task = page.render({
    canvas,
    viewport,
    // Shift the page so the crop's top-left lands at the canvas origin.
    transform: [1, 0, 0, 1, -base.width * CROP.x0 * scale, -base.height * CROP.y0 * scale],
  });
  const cancel = () => task.cancel();
  signal.addEventListener("abort", cancel);
  try {
    await task.promise;
  } catch (e) {
    if (!signal.aborted) throw e;
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}
