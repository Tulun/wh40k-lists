/**
 * The ONLY module that loads `@alpaca-software/40kdc-data` at runtime.
 *
 * The package embeds the full dataset (~MBs), so it lives in its own lazy
 * chunk (see `manualChunks` in vite.config.ts) and the app shell renders
 * before it arrives. Everything else imports *types only* from the package
 * (erased at compile time) and receives the loaded module through props,
 * hooks, or function arguments.
 *
 * `mergedData(mod, doc)` overlays the editable codex doc (store/codex.ts)
 * onto the base module: a `Data40k`-shaped facade whose dataset, collections,
 * and `tryImportRoster` all serve the merged data. It is memoized on the doc
 * reference — the codex store clones the doc on every mutation, so a Save in
 * the editor rebuilds exactly once and every `useDataset` consumer re-renders
 * with the new dataset, no reload involved.
 */
import { applyCodex } from "./overlay-dataset";
import type { CodexDoc } from "./codex-model";
import { useCodex } from "../store/codex";

export type Data40k = typeof import("@alpaca-software/40kdc-data");

let cached: Promise<Data40k> | null = null;

/** The plain base module (no codex applied). */
export function load40k(): Promise<Data40k> {
  cached ??= import("@alpaca-software/40kdc-data");
  return cached;
}

let lastDoc: CodexDoc | null = null;
let lastResult: Data40k | null = null;
let buildError: string | null = null;

/** Non-null when the codex doc failed to compile this session (app runs on stock data). */
export function getCodexBuildError(): string | null {
  return buildError;
}

export function mergedData(mod: Data40k, doc: CodexDoc): Data40k {
  if (doc === lastDoc && lastResult) return lastResult;
  lastDoc = doc;
  buildError = null;
  try {
    const merged = applyCodex(mod, doc);
    lastResult = merged
      ? ({
          ...mod,
          dataset: merged,
          units: merged.units,
          factions: merged.factions,
          abilities: merged.abilities,
          weapons: merged.weapons,
          weaponKeywords: merged.weaponKeywords,
          unitKeywords: merged.unitKeywords,
          detachments: merged.detachments,
          enhancements: merged.enhancements,
          stratagems: merged.stratagems,
          wargear: merged.wargear,
          wargearOptions: merged.wargearOptions,
          alliedRules: merged.alliedRules,
          targetProfiles: merged.targetProfiles,
          tryImportRoster: (input, opts) => mod.tryImportRoster(input, { dataset: merged, ...opts }),
        } as Data40k)
      : mod;
  } catch (e) {
    // A broken doc must never brick the app: fall back to stock data and
    // surface the failure on the editor home screen.
    buildError = e instanceof Error ? e.message : String(e);
    lastResult = mod;
  }
  return lastResult;
}

/** Async accessor for non-hook call sites (roster import). */
export async function loadMergedData(): Promise<Data40k> {
  const mod = await load40k();
  return mergedData(mod, useCodex.getState().doc);
}
