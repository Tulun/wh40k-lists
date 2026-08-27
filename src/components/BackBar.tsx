import { Link, useLocation } from "react-router-dom";

/**
 * Contextual back row for reference pages (detachment/datasheet rules).
 * Renders only when the navigation passed `state.back` — e.g. arriving from
 * the army view — so deep links and Explore browsing stay unchanged.
 *
 * Usage: <Link to="…" state={backState("/", list.name)}>
 */
export function backState(to: string, label: string) {
  return { back: { to, label } };
}

export default function BackBar() {
  const { state } = useLocation() as { state?: { back?: { to: string; label: string } } };
  const back = state?.back;
  if (!back) return null;
  return (
    <Link
      to={back.to}
      className="flex min-h-9 items-center gap-1.5 text-sm text-accent hover:opacity-70 active:opacity-70"
    >
      <span aria-hidden>←</span>
      <span className="min-w-0 truncate">{back.label}</span>
    </Link>
  );
}
