import { Children, useSyncExternalStore, type ReactNode } from "react";

const DESKTOP = "(min-width: 1024px)"; // Tailwind lg

function subscribe(cb: () => void) {
  const m = window.matchMedia(DESKTOP);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}

/**
 * Card list that becomes two INDEPENDENT columns on desktop. Unlike a grid —
 * where row neighbors share a height, so one expanded <details> card
 * stretches the card beside it into a mostly-empty box — each column stacks
 * on its own and an expanded card only pushes down its own column. Items
 * alternate left/right so reading order stays roughly row-like.
 */
export default function CardColumns({ children }: { children: ReactNode }) {
  const desktop = useSyncExternalStore(subscribe, () => window.matchMedia(DESKTOP).matches);
  const items = Children.toArray(children);
  if (!desktop) return <div className="space-y-2">{items}</div>;
  return (
    <div className="flex gap-2">
      {[0, 1].map((col) => (
        <div key={col} className="min-w-0 flex-1 space-y-2">
          {items.filter((_, i) => i % 2 === col)}
        </div>
      ))}
    </div>
  );
}
