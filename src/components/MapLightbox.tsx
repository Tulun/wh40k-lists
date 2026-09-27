import { useEffect, useRef, useState } from "react";
import { missionPageAspect, renderMissionPage, type MissionPack } from "../lib/mission-maps";
import ZoomLightbox, { type FitSize } from "./ZoomLightbox";

/** Rendered this many times sharper than fit size (capped by canvas limits). */
const OVERSAMPLE = 3;

/** Full-screen, zoomable mission layout map. */
export default function MapLightbox({
  pack,
  page,
  onClose,
}: {
  pack: MissionPack;
  page: number;
  onClose: () => void;
}) {
  const [aspect, setAspect] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void missionPageAspect(pack, page).then((a) => !cancelled && setAspect(a));
    return () => {
      cancelled = true;
    };
  }, [pack, page]);

  return (
    <ZoomLightbox label="Mission map" aspect={aspect} onClose={onClose}>
      {(fit) => <MapPage pack={pack} page={page} fit={fit} />}
    </ZoomLightbox>
  );
}

function MapPage({ pack, page, fit }: { pack: MissionPack; page: number; fit: FitSize }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctrl = new AbortController();
    renderMissionPage(pack, page, canvas, fit.w, ctrl.signal, OVERSAMPLE).catch((e: unknown) =>
      setFailed(e instanceof Error ? e.message : String(e)),
    );
    return () => ctrl.abort();
  }, [pack, page, fit.w]);

  return (
    <>
      <canvas ref={canvasRef} className="block rounded bg-white" />
      {failed && <p className="p-3 text-xs text-red-400">Couldn't draw the map: {failed}</p>}
    </>
  );
}
