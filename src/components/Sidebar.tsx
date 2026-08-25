import { useState } from "react";
import { Link, useLocation } from "react-router-dom";

const LINKS = [
  { to: "/", label: "Army glance", icon: "⌂" },
  { to: "/lists", label: "Saved lists", icon: "☰" },
  { to: "/import", label: "Import a list", icon: "＋" },
  { to: "/explore", label: "Explore factions", icon: "🔍" },
];

export default function Sidebar() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  return (
    <>
      <button
        type="button"
        aria-label="Menu"
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 items-center justify-center rounded-md text-lg text-accent active:bg-panel"
      >
        ≡
      </button>

      {open && (
        <div className="fixed inset-0 z-40" role="dialog" aria-label="Navigation">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/60"
            onClick={() => setOpen(false)}
          />
          <nav className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-edge bg-surface p-3 pt-4">
            <div className="mb-3 px-2 text-sm font-bold tracking-wide text-accent">
              40k List Viewer
            </div>
            {LINKS.map(({ to, label, icon }) => (
              <Link
                key={to}
                to={to}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm ${
                  pathname === to ? "bg-panel font-semibold text-accent" : "text-ink"
                }`}
              >
                <span className="w-5 text-center">{icon}</span>
                {label}
              </Link>
            ))}
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
        </div>
      )}
    </>
  );
}
