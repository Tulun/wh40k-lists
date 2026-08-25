# Codex editing

The app has an in-app **Codex editor** (`/editor`, sidebar → Codex editor) for hand-building and
adjusting game data:

- **Orks — full codex mode.** Everything built here (army rule, detachments with enhancements and
  stratagems, datasheets with statlines/weapons/abilities/points) replaces the upstream Ork data
  entirely. Built from leaked-codex screenshots.
- **Grey Knights / Aeldari / Leagues of Votann — patch mode.** Individual upstream records can be
  edited (e.g. fix stale points): editing seeds a full editable copy that overrides the record by
  id; "Reset" restores upstream. Which factions use which mode: `REPLACE_FACTION_IDS` in
  [src/lib/flags.ts](../src/lib/flags.ts).

Saves apply instantly — the merged dataset rebuilds in memory (no reload), so Explore/faction/unit
screens show edits immediately, and roster import resolves against the edited data.

## Where the data lives

The editable doc (`CodexDoc`, [src/lib/codex-model.ts](../src/lib/codex-model.ts)) has one home: a
**secret GitHub Gist** holding `codex.json`. Each device caches a copy in browser storage (key
`40k-viewer-codex`) so the app works offline, pulls on opening the editor, and auto-pushes a few
seconds after each save. Conflicts (both sides edited) surface a keep-mine / take-gist choice on
the editor home screen.

**Setup per device:** editor home → Set up sync → paste a GitHub **classic** personal access
token with only the `gist` scope (github.com → Settings → Developer settings → Personal access
tokens → Tokens (classic); fine-grained tokens do not support the Gists API). First device leaves
the gist field empty (creates the gist); other devices paste the gist id shown on the first
device's Sync card. The token stays in that browser's storage and is only ever sent to
api.github.com.

**Claude transcription workflow:** hand Claude leak screenshots in a Claude Code session; Claude
reads them and writes the entries directly into the gist (`gh gist view/edit <id>` runs on your
own gh login). The app picks the changes up on the next sync. Sync before asking Claude to write,
so the gist already has your latest hand edits.

## Content policy

This repo and the GH Pages deploy are public; the gist is secret and personal.

- Never commit codex data (real or transcribed) to the repo — it lives only in the gist.
- All rules text typed or transcribed must be **paraphrased, never verbatim GW text** (same policy
  as the upstream dataset).
- Reference screenshots attached in the editor stay in that device's IndexedDB
  (`40k-viewer-ref-images`) — they never sync and never leave the browser.

## How it renders (internals)

`CodexDoc` → [codex-compile.ts](../src/lib/codex-compile.ts) (package-shaped records; ability
prose rides in a `leak_text` field since the ability DSL has no free-text node; `abilityText()` in
describe.ts prefers it) → [overlay-dataset.ts](../src/lib/overlay-dataset.ts) (`buildMergedRaw`
replace-mode strip+append, `applyRecordPatches` id-level swaps, `applyCodex` orchestrates) →
`new Dataset(raw)` behind the `Data40k` facade in [data.ts](../src/lib/data.ts), memoized per doc
reference. Everything hand-authored carries dataslate `leak-provisional`, so the ⚠ provisional
badge marks it app-wide.

Weapon keywords are typed as display strings ("Sustained Hits 1", "Anti-Vehicle 4+") and parsed
back to catalog references; unrecognized names become ad-hoc catalog entries and still render as
chips.

## Known limits

- Wargear options/budgets and unit-composition details aren't editable (viewer shows base
  loadouts from the weapon list).
- Patch mode can't *remove* an upstream leader attachment (only replace a leader's list when
  "Can lead" is set).
- Per-list notes are keyed by stratagem/enhancement id — reusing an id keeps its note.
- When upstream ships the real Ork codex: clear the Orks entry in the editor and revisit the
  Ork-flavored fixtures in `src/lib/__tests__/` (inline old-codex names/points).
