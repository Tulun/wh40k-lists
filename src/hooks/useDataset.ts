import { useEffect, useMemo, useState } from "react";
import { load40k, mergedData, type Data40k } from "../lib/data";
import { useCodex } from "../store/codex";

let resolved: Data40k | null = null;

/**
 * The lazily-loaded 40kdc module with the editable codex doc merged in, or
 * null while the chunk is downloading. Components render name/count skeletons
 * from the stored roster until it lands. Re-renders with a freshly merged
 * dataset whenever the codex doc changes (every editor Save clones the doc).
 */
export function useDataset(): Data40k | null {
  const doc = useCodex((s) => s.doc);
  const [mod, setMod] = useState<Data40k | null>(resolved);
  useEffect(() => {
    if (resolved) return;
    let alive = true;
    void load40k().then((m) => {
      resolved = m;
      if (alive) setMod(m);
    });
    return () => {
      alive = false;
    };
  }, []);
  return useMemo(() => (mod ? mergedData(mod, doc) : null), [mod, doc]);
}
