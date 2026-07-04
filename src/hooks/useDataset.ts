import { useEffect, useState } from "react";
import { load40k, type Data40k } from "../lib/data";

let resolved: Data40k | null = null;

/**
 * The lazily-loaded 40kdc module, or null while the chunk is downloading.
 * Components render name/count skeletons from the stored roster until it lands.
 */
export function useDataset(): Data40k | null {
  const [data, setData] = useState<Data40k | null>(resolved);
  useEffect(() => {
    if (resolved) return;
    let alive = true;
    void load40k().then((m) => {
      resolved = m;
      if (alive) setData(m);
    });
    return () => {
      alive = false;
    };
  }, []);
  return data;
}
