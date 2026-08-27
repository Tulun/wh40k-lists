import { useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import PoweredBy from "./PoweredBy";

const LINKS = [
  { to: "/", label: "Army glance", icon: "⌂" },
  { to: "/lists", label: "Saved lists", icon: "☰" },
  { to: "/import", label: "Import a list", icon: "＋" },
  { to: "/explore", label: "Explore factions", icon: "🔍" },
  { to: "/editor", label: "Codex editor", icon: "✎" },
];

/** Section-aware active check so nested routes keep their nav entry lit. */
function isActive(pathname: string, to: string): boolean {
  if (to === "/") return pathname === "/" || pathname.startsWith("/unit/");
  return pathname === to || pathname.startsWith(`${to}/`);
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation();
  return (
    <>
      {LINKS.map(({ to, label, icon }) => (
        <Link
          key={to}
          to={to}
          onClick={onNavigate}
          className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-panel ${
            isActive(pathname, to) ? "bg-panel font-semibold text-accent" : "text-ink"
          }`}
        >
          <span className="w-5 text-center">{icon}</span>
          {label}
        </Link>
      ))}
    </>
  );
}

/** Always-visible nav rail for desktop; the drawer below covers mobile. */
export function DesktopNav() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-edge bg-surface p-3 pt-4 lg:flex">
      <div className="mb-3 px-2 text-sm font-bold tracking-wide text-accent">40k List Viewer</div>
      <NavLinks />
      <div className="mt-auto px-3">
        <PoweredBy />
      </div>
    </aside>
  );
}

export default function Sidebar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="Menu"
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 items-center justify-center rounded-md text-lg text-accent hover:bg-panel active:bg-panel lg:hidden"
      >
        ≡
      </button>

      {open &&
        // Portal to <body>: the sticky header's backdrop-blur makes it a
        // containing block for fixed descendants, which would clip the drawer
        // to the 48px header strip.
        createPortal(
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-label="Navigation">
            <button
              type="button"
              aria-label="Close menu"
              className="absolute inset-0 bg-black/70"
              onClick={() => setOpen(false)}
            />
            <nav className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-edge bg-surface p-3 pt-4 shadow-2xl">
              <div className="mb-3 px-2 text-sm font-bold tracking-wide text-accent">
                40k List Viewer
              </div>
              <NavLinks onNavigate={() => setOpen(false)} />
              <div className="mt-auto px-3 text-[11px] text-ink-faint">
                <a
                  href="https://40kdc.alpacasoft.dev"
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-dotted"
                >
                  Powered by 40kdc-data
                </a>
              </div>
            </nav>
          </div>,
          document.body,
        )}
    </>
  );
}
