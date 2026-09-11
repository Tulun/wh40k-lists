import { Link, matchPath, Outlet, useLocation } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import SlotToggle from "./components/SlotToggle";
import PoweredBy from "./components/PoweredBy";
import SyncManager from "./components/SyncManager";
import { useActiveList, useLists } from "./store/lists";

export default function App() {
  const active = useActiveList();
  const { pathname } = useLocation();
  // Mid-edit, the list being edited is the one whose name and running total
  // matter — not the starred army the rest of the app centres on.
  const editingId = matchPath("/lists/:listId/edit", pathname)?.params.listId;
  const editing = useLists((s) => (editingId ? s.lists[editingId] : undefined));
  const shown = editing ?? active;
  const points = shown?.roster.points.total_computed;

  return (
    <div className="min-h-dvh">
      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-edge bg-surface/95 backdrop-blur">
          {/* Full-bleed app bar: the hamburger belongs to the window's corner,
              not the centered content column. */}
          <div className="flex h-12 w-full items-center gap-2 px-3">
            <Sidebar />
            <div className="flex-1">
              <SlotToggle />
            </div>
            {shown && pathname !== "/import" && (
              <Link
                to="/"
                aria-label="Back to army glance"
                className="-my-1 flex min-w-0 shrink items-baseline justify-end gap-1.5 rounded-md px-1.5 py-1 text-right text-xs hover:bg-panel active:bg-panel"
              >
                <span className="min-w-0 truncate font-semibold">{shown.name}</span>
                <span className="shrink-0 text-ink-dim">{points} pts</span>
              </Link>
            )}
          </div>
        </header>

        <main className="flex-1 px-3 pb-6 pt-3">
          <div className="mx-auto w-full max-w-3xl lg:max-w-5xl xl:max-w-6xl 2xl:max-w-7xl">
            <SyncManager />
            <Outlet />
          </div>
        </main>

        {/* With the nav behind the hamburger everywhere, this footer is the
            always-visible home of the data attribution. */}
        <footer className="border-t border-edge px-3 py-3 text-center">
          <PoweredBy />
        </footer>
      </div>
    </div>
  );
}
