import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { missionPageAspect, renderMissionPage, type MissionPack } from "../lib/mission-maps";

const MAX_ZOOM = 6;
const DOUBLE_TAP_ZOOM = 2.5;
/** Rendered this many times sharper than fit size (capped by canvas limits). */
const OVERSAMPLE = 3;

interface View {
  s: number;
  x: number;
  y: number;
}

/**
 * Full-screen map viewer: pinch or wheel to zoom (around the fingers /
 * cursor), drag to pan, double-tap to zoom in or back out, Esc or ✕ to close.
 */
export default function MapLightbox({
  pack,
  page,
  onClose,
}: {
  pack: MissionPack;
  page: number;
  onClose: () => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fit, setFit] = useState<{ w: number; h: number } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const view = useRef<View>({ s: 1, x: 0, y: 0 });

  // Fit the map inside the stage, then render it oversampled for zooming.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let cancelled = false;
    void missionPageAspect(pack, page).then((aspect) => {
      if (cancelled) return;
      const { width, height } = stage.getBoundingClientRect();
      const w = Math.floor(Math.min(width - 16, (height - 16) * aspect));
      setFit({ w, h: w / aspect });
    });
    return () => {
      cancelled = true;
    };
  }, [pack, page]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !fit) return;
    const ctrl = new AbortController();
    renderMissionPage(pack, page, canvas, fit.w, ctrl.signal, OVERSAMPLE).catch((e: unknown) =>
      setFailed(e instanceof Error ? e.message : String(e)),
    );
    return () => ctrl.abort();
  }, [pack, page, fit]);

  // Esc closes; the page underneath doesn't scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  /** Keep the zoomed map covering the stage — no panning past its edges. */
  function apply(next: View) {
    const stage = stageRef.current;
    const layer = layerRef.current;
    if (!stage || !layer || !fit) return;
    const s = Math.min(MAX_ZOOM, Math.max(1, next.s));
    const { width, height } = stage.getBoundingClientRect();
    const maxX = Math.max(0, (fit.w * s - width) / 2);
    const maxY = Math.max(0, (fit.h * s - height) / 2);
    view.current = {
      s,
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    };
    const v = view.current;
    layer.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.s})`;
  }

  /** Point relative to the stage centre (the transform origin). */
  function local(clientX: number, clientY: number) {
    const r = stageRef.current!.getBoundingClientRect();
    return { px: clientX - (r.left + r.width / 2), py: clientY - (r.top + r.height / 2) };
  }

  /** Zoom to `s`, keeping the content under (clientX, clientY) in place. */
  function zoomAt(clientX: number, clientY: number, s: number) {
    const { px, py } = local(clientX, clientY);
    const v = view.current;
    const k = Math.min(MAX_ZOOM, Math.max(1, s)) / v.s;
    apply({ s: v.s * k, x: px - (px - v.x) * k, y: py - (py - v.y) * k });
  }

  // Wheel / trackpad pinch (ctrl+wheel). Non-passive so the page doesn't zoom.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rate = e.ctrlKey ? 0.01 : 0.002;
      zoomAt(e.clientX, e.clientY, view.current.s * Math.exp(-e.deltaY * rate));
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  });

  // Pointer gestures: one finger pans, two pinch; a quick second tap toggles zoom.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; mx: number; my: number } | null>(null);
  const tap = useRef<{ t: number; x: number; y: number; moved: boolean }>({
    t: 0,
    x: 0,
    y: 0,
    moved: false,
  });
  const lastTapAt = useRef(0);

  function pinchState() {
    const [a, b] = [...pointers.current.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }

  function onPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      tap.current = { t: Date.now(), x: e.clientX, y: e.clientY, moved: false };
    } else if (pointers.current.size === 2) {
      pinch.current = pinchState();
      tap.current.moved = true;
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (Math.hypot(e.clientX - tap.current.x, e.clientY - tap.current.y) > 8) {
      tap.current.moved = true;
    }
    if (pointers.current.size === 2 && pinch.current) {
      const next = pinchState();
      const v = view.current;
      // Pan with the midpoint, then scale around it.
      apply({ ...v, x: v.x + next.mx - pinch.current.mx, y: v.y + next.my - pinch.current.my });
      zoomAt(next.mx, next.my, view.current.s * (next.dist / pinch.current.dist));
      pinch.current = next;
    } else if (pointers.current.size === 1) {
      const v = view.current;
      apply({ ...v, x: v.x + e.clientX - prev.x, y: v.y + e.clientY - prev.y });
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size > 0 || tap.current.moved || Date.now() - tap.current.t > 300) return;
    const now = Date.now();
    if (now - lastTapAt.current < 300) {
      lastTapAt.current = 0;
      if (view.current.s > 1.05) apply({ s: 1, x: 0, y: 0 });
      else zoomAt(e.clientX, e.clientY, DOUBLE_TAP_ZOOM);
    } else {
      lastTapAt.current = now;
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Mission map"
      className="fixed inset-0 z-50 flex flex-col bg-black/95"
    >
      <div className="flex items-center gap-3 px-3 py-2 text-xs text-white/70">
        <span className="flex-1">Pinch or scroll to zoom · drag to pan · double-tap to zoom</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close map"
          className="flex size-10 items-center justify-center rounded-full bg-white/10 text-lg text-white hover:bg-white/20"
        >
          ✕
        </button>
      </div>
      <div
        ref={stageRef}
        className="relative flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div ref={layerRef} className="origin-center will-change-transform">
          <canvas ref={canvasRef} className="block rounded bg-white" />
        </div>
        {failed && (
          <p className="absolute inset-x-0 top-4 text-center text-xs text-red-400">
            Couldn't draw the map: {failed}
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}
