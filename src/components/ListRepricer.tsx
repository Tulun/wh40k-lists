/**
 * Keeps every saved list priced against the current dataset. Mounted once in
 * App so a points bump (a new MFM synced into data-fixes, a codex doc save)
 * reaches lists on the lists screen and the glance — including lists scanned
 * or imported with older printed costs — without opening each in the editor.
 * Each list is checked once per dataset build and per content stamp, and only
 * lists whose stored costs actually moved are written back.
 */
import { useEffect, useRef } from "react";
import { useDataset } from "../hooks/useDataset";
import { repriceIfStale } from "../lib/list-edit";
import { useLists } from "../store/lists";

export default function ListRepricer() {
  const data = useDataset();
  const lists = useLists((s) => s.lists);
  const updateListContent = useLists((s) => s.updateListContent);
  // list id → the `updated` stamp last checked against `checkedFor`.
  const checked = useRef(new Map<string, string | undefined>());
  const checkedFor = useRef<typeof data>(null);

  useEffect(() => {
    if (!data) return;
    if (checkedFor.current !== data) {
      checkedFor.current = data;
      checked.current.clear();
    }
    for (const list of Object.values(lists)) {
      if (checked.current.has(list.id) && checked.current.get(list.id) === list.updated) continue;
      checked.current.set(list.id, list.updated);
      const repriced = repriceIfStale(data, {
        roster: list.roster,
        roleHints: list.roleHints,
        attachments: list.attachments,
      });
      if (repriced) {
        updateListContent(list.id, {
          ...repriced,
          rawText: data.exportRoster(repriced.roster, "roster-json"),
        });
      }
    }
  }, [data, lists, updateListContent]);

  return null;
}
