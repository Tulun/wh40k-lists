import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import SlotToggle from "./components/SlotToggle";
import PoweredBy from "./components/PoweredBy";
import SyncManager from "./components/SyncManager";
import { useActiveList } from "./store/lists";

export default function App() {
  const active = useActiveList();
  const { pathname } = useLocation();
  const points = active?.roster.points.total_computed;

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col">
      <header className="sticky top-0 z-20 border-b border-edge bg-surface/95 backdrop-blur">
        <div className="flex h-12 items-center gap-2 px-3">
          <Sidebar />
          <div className="flex-1">
            <SlotToggle />
          </div>
          {active && pathname !== "/import" && (
            <div className="flex min-w-0 shrink items-baseline justify-end gap-1.5 text-right text-xs">
              <span className="min-w-0 truncate font-semibold">{active.name}</span>
              <span className="shrink-0 text-ink-dim">{points} pts</span>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 px-3 pb-6 pt-3">
        <SyncManager />
        <Outlet />
      </main>

      <footer className="border-t border-edge px-3 py-3 text-center">
        <PoweredBy />
      </footer>
    </div>
  );
}
