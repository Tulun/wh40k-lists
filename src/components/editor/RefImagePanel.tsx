import { useEffect, useRef, useState } from "react";
import { SectionCard, SmallButton } from "./fields";
import { addRefImage, deleteRefImage, listRefImages, type RefImage } from "../../lib/ref-images";

/**
 * Screenshot strip for an editor entity: snap or attach leak-page images and
 * view them full-screen while typing the data in. Local to this device.
 */
export default function RefImagePanel({ entityKey }: { entityKey: string }) {
  const [images, setImages] = useState<RefImage[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [viewing, setViewing] = useState<RefImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    listRefImages(entityKey)
      .then((list) => alive && setImages(list))
      .catch(() => alive && setError("Reference images unavailable (IndexedDB blocked)."));
    return () => {
      alive = false;
    };
  }, [entityKey]);

  // Object URLs for the current image set, revoked when the set changes.
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const img of images) next[img.id] = URL.createObjectURL(img.blob);
    setUrls(next);
    return () => {
      for (const url of Object.values(next)) URL.revokeObjectURL(url);
    };
  }, [images]);

  async function addFiles(files: FileList | null) {
    if (!files) return;
    try {
      const added: RefImage[] = [];
      for (const file of Array.from(files)) added.push(await addRefImage(entityKey, file));
      setImages((prev) => [...prev, ...added]);
    } catch {
      setError("Could not store the image (storage full?).");
    }
  }

  return (
    <SectionCard
      title="Reference screenshots"
      actions={
        <SmallButton onClick={() => fileInput.current?.click()}>+ add</SmallButton>
      }
    >
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => {
          void addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {error && <p className="text-xs text-opponent">{error}</p>}
      {images.length === 0 && !error && (
        <p className="text-xs text-ink-faint">
          Attach the page screenshots this entry is transcribed from. They stay on this device.
        </p>
      )}
      {images.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          {images.map((img) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setViewing(img)}
              className="h-24 w-20 shrink-0 overflow-hidden rounded-md border border-edge"
            >
              {urls[img.id] && (
                <img src={urls[img.id]} alt="reference" className="h-full w-full object-cover" />
              )}
            </button>
          ))}
        </div>
      )}

      {viewing && urls[viewing.id] && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/90"
          onClick={() => setViewing(null)}
        >
          <div className="flex items-center gap-2 p-3" onClick={(e) => e.stopPropagation()}>
            <span className="flex-1 text-xs text-white/70">
              Added {new Date(viewing.addedAt).toLocaleString()}
            </span>
            <SmallButton
              tone="danger"
              onClick={() => {
                void deleteRefImage(viewing.id).then(() => {
                  setImages((prev) => prev.filter((i) => i.id !== viewing.id));
                  setViewing(null);
                });
              }}
            >
              Delete
            </SmallButton>
            <SmallButton onClick={() => setViewing(null)}>Close</SmallButton>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            <img
              src={urls[viewing.id]}
              alt="reference full size"
              className="mx-auto max-w-none"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </SectionCard>
  );
}
