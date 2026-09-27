import { useCallback, useEffect, useRef, useState } from "react";
import {
  addRefImage,
  deleteRefImage,
  listRefImages,
  missionPhotoKey,
  type RefImage,
} from "../lib/ref-images";
import ZoomLightbox from "./ZoomLightbox";

/**
 * The player's own photos of a printed mission card (front, back…): a
 * thumbnail strip that opens a zoomable full-screen viewer. Device-local.
 */
export default function MissionPhotos({ missionId }: { missionId: string }) {
  const key = missionPhotoKey(missionId);
  const [images, setImages] = useState<RefImage[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [viewing, setViewing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    setImages([]);
    listRefImages(key)
      .then((list) => alive && setImages(list))
      .catch(() => alive && setError("Photos unavailable (storage blocked)."));
    return () => {
      alive = false;
    };
  }, [key]);

  // Object URLs for the current set, revoked when it changes.
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const img of images) next[img.id] = URL.createObjectURL(img.blob);
    setUrls(next);
    return () => Object.values(next).forEach((u) => URL.revokeObjectURL(u));
  }, [images]);

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setBusy(true);
    try {
      const added: RefImage[] = [];
      for (const file of Array.from(files)) added.push(await addRefImage(key, file));
      setImages((prev) => [...prev, ...added]);
    } catch {
      setError("Couldn't save the photo (storage full?).");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await deleteRefImage(id);
    setImages((prev) => prev.filter((i) => i.id !== id));
    setViewing(null);
  }

  const close = useCallback(() => setViewing(null), []);
  const current = viewing != null ? images[viewing] : undefined;

  return (
    <div className="space-y-1.5">
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          void addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <div className="flex gap-2 overflow-x-auto">
        {images.map((img, i) => (
          <button
            key={img.id}
            type="button"
            onClick={() => setViewing(i)}
            aria-label={`Card photo ${i + 1}`}
            className="h-28 w-20 shrink-0 cursor-zoom-in overflow-hidden rounded-md border border-edge bg-black"
          >
            {urls[img.id] && (
              <img src={urls[img.id]} alt="" className="h-full w-full object-cover" />
            )}
          </button>
        ))}
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
          className={`flex shrink-0 items-center justify-center rounded-md border border-dashed border-edge text-xs text-ink-dim hover:text-ink ${
            images.length > 0 ? "h-28 w-20" : "px-3 py-2"
          }`}
        >
          {busy ? "Saving…" : images.length > 0 ? "+ Add" : "+ Add card photos"}
        </button>
      </div>
      {error && <p className="text-xs text-opponent">{error}</p>}

      {current && urls[current.id] && (
        <PhotoLightbox
          key={current.id}
          url={urls[current.id]}
          index={viewing!}
          count={images.length}
          onStep={(d) => setViewing((v) => (v! + d + images.length) % images.length)}
          onDelete={() => void remove(current.id)}
          onClose={close}
        />
      )}
    </div>
  );
}

function PhotoLightbox({
  url,
  index,
  count,
  onStep,
  onDelete,
  onClose,
}: {
  url: string;
  index: number;
  count: number;
  onStep: (delta: number) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [aspect, setAspect] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setAspect(img.naturalWidth / img.naturalHeight);
    img.src = url;
  }, [url]);

  const btn =
    "flex h-10 shrink-0 items-center justify-center rounded-full bg-white/10 px-3 text-sm text-white hover:bg-white/20";

  return (
    <ZoomLightbox
      label="Mission card photo"
      aspect={aspect}
      onClose={onClose}
      toolbar={
        <>
          {count > 1 && (
            <>
              <button
                type="button"
                className={btn}
                onClick={() => onStep(-1)}
                aria-label="Previous photo"
              >
                ‹
              </button>
              <span className="shrink-0 tabular-nums">
                {index + 1}/{count}
              </span>
              <button
                type="button"
                className={btn}
                onClick={() => onStep(1)}
                aria-label="Next photo"
              >
                ›
              </button>
            </>
          )}
          <button
            type="button"
            className={`${btn} ${confirming ? "bg-red-600/80 hover:bg-red-600" : ""}`}
            onClick={() => (confirming ? onDelete() : setConfirming(true))}
          >
            {confirming ? "Tap to delete" : "Delete"}
          </button>
        </>
      }
    >
      {(fit) => (
        <img
          src={url}
          alt="Mission card"
          draggable={false}
          style={{ width: fit.w, height: fit.h }}
          className="block rounded"
        />
      )}
    </ZoomLightbox>
  );
}
