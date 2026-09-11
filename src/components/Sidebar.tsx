import { useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";

const LINKS = [
  { to: "/", label: "Army glance", icon: "⌂" },
  { to: "/lists", label: "Saved lists", icon: "☰" },
  { to: "/import", label: "Import a list", icon: "＋" },
  { to: "/explore", label: "Explore factions", icon: "🔍" },
  { to: "/crunch", label: "Crunch lab", icon: "💥" },
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

/** Hamburger-opened nav drawer — all screen sizes, so the content keeps the
 * full width on desktop too. Slides in and out; `mounted` keeps it in the DOM
 * through the exit transition, `open` is the slid-in target state. */
export default function Sidebar() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

  const show = () => {
    setMounted(true);
    // Double rAF: the drawer must paint once off-screen before the slide-in
    // class lands, or the transition is skipped entirely.
    requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)));
  };
  const hide = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        aria-label="Menu"
        onClick={show}
        className="flex h-10 w-10 items-center justify-center rounded-md text-2xl text-accent hover:bg-panel active:bg-panel"
      >
        ≡
      </button>

      {mounted &&
        // Portal to <body>: the sticky header's backdrop-blur makes it a
        // containing block for fixed descendants, which would clip the drawer
        // to the 48px header strip.
        createPortal(
          <div className="fixed inset-0 z-50" role="dialog" aria-label="Navigation">
            <button
              type="button"
              aria-label="Close menu"
              className={`absolute inset-0 bg-black/70 transition-opacity duration-200 ${
                open ? "opacity-100" : "opacity-0"
              }`}
              onClick={hide}
            />
            <nav
              onTransitionEnd={(e) => {
                if (e.target === e.currentTarget && !open) setMounted(false);
              }}
              className={`absolute inset-y-0 left-0 flex w-64 flex-col border-r border-edge bg-surface p-3 pt-4 shadow-2xl transition-transform duration-200 ease-out ${
                open ? "translate-x-0" : "-translate-x-full"
              }`}
            >
              <div className="mb-3 px-2 text-sm font-bold tracking-wide text-accent">
                40k List Viewer
              </div>
              <NavLinks onNavigate={hide} />
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
