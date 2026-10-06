import { useSearchParams } from "react-router-dom";
import { useActiveList, useLists } from "../store/lists";
import type { SavedList } from "../store/schema";

/**
 * The list the army screens (glance, unit, crunch) are showing: a saved list
 * opened read-only from the Lists screen via `?list=<id>`, else the active
 * army. Viewing a list never assigns it to a slot.
 *
 * `withList` carries the `?list=` param onto in-app links so drilling into a
 * unit stays on the viewed list; it's a no-op when showing the active army.
 */
export function useViewedList(): {
  list: SavedList | null;
  /** True when showing a saved list that isn't the active army. */
  previewing: boolean;
  withList: (path: string) => string;
} {
  const [searchParams] = useSearchParams();
  const active = useActiveList();
  const viewId = searchParams.get("list");
  const viewed = useLists((s) => (viewId ? (s.lists[viewId] ?? null) : null));
  const previewing = viewed != null && viewed.id !== active?.id;
  const list = previewing ? viewed : active;
  const withList = (path: string) =>
    previewing ? `${path}${path.includes("?") ? "&" : "?"}list=${encodeURIComponent(viewed.id)}` : path;
  return { list, previewing, withList };
}
