/**
 * The ONLY module that loads `@alpaca-software/40kdc-data` at runtime.
 *
 * The package embeds the full dataset (~MBs), so it lives in its own lazy
 * chunk (see `manualChunks` in vite.config.ts) and the app shell renders
 * before it arrives. Everything else imports *types only* from the package
 * (erased at compile time) and receives the loaded module through props,
 * hooks, or function arguments.
 */
export type Data40k = typeof import("@alpaca-software/40kdc-data");

let cached: Promise<Data40k> | null = null;

export function load40k(): Promise<Data40k> {
  cached ??= import("@alpaca-software/40kdc-data");
  return cached;
}
