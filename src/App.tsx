import { Link, Outlet, useLocation } from "react-router-dom";
import SlotToggle from "./components/SlotToggle";
import PoweredBy from "./components/PoweredBy";
import { useActiveList } from "./store/lists";

export default function App() {
  const active = useActiveList();
  const { pathname } = useLocation();
  const points = active?.roster.points.total_computed;

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col">
      <header className="sticky top-0 z-20 border-b border-edge bg-surface/95 backdrop-blur">
        <div className="flex h-12 items-center gap-2 px-3">
          <Link to="/lists" className="shrink-0 text-sm font-bold tracking-wide text-accent">
            40k
          </Link>
          <div className="flex-1">
            <SlotToggle />
          </div>
          <div className="w-14 shrink-0 text-right text-xs text-ink-dim">
            {points != null && pathname !== "/import" ? `${points} pts` : ""}
          </div>
        </div>
      </header>

      <main className="flex-1 px-3 pb-6 pt-3">
        <Outlet />
      </main>

      <footer className="border-t border-edge px-3 py-3 text-center">
        <PoweredBy />
      </footer>
    </div>
  );
}
