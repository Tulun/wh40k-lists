/**
 * Temporary product toggles, kept in one place so they're easy to flip back.
 */

/**
 * The Opponent slot is hidden for now — the owner can only vouch for data
 * freshness on armies they play. The store keeps its two slots; only the UI
 * (header toggle, save/use-as-opponent buttons) is gated.
 */
export const OPPONENT_SLOT_ENABLED = false;

/**
 * Factions shown in Explore. `null` means all of them. Deep links to other
 * factions keep working — this only trims the browse list.
 */
export const EXPLORE_FACTION_IDS: readonly string[] | null = [
  "aeldari",
  "grey-knights",
  "leagues-of-votann",
  "orks",
];

/**
 * Factions the codex editor rebuilds from scratch (a new codex replaces the
 * upstream data wholesale). Everything else is edited in patch mode —
 * record-level fixes on top of upstream.
 */
export const REPLACE_FACTION_IDS: readonly string[] = ["orks"];

/**
 * QR sync hand-off: the connected device can show a QR code that carries the
 * gist token + id in a URL fragment; scanning it connects another device
 * without typing the token. Flip off once devices are synced; flip back on
 * when the PAT rotates. Gates both the QR button and the /sync-setup route.
 */
export const QR_SYNC_SETUP_ENABLED = false;
