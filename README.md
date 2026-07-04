# 40k List Viewer

A mobile-first Warhammer 40,000 **army list viewer** — not a list builder. Paste
an exported list (yours and your opponent's), get a dense, glanceable reference
for mid-game lookups: deduped unit entries, stats, weapons, abilities,
enhancements, and linked stratagems.

Powered by [40kdc-data](https://40kdc.alpacasoft.dev) — community-owned 40k
data with a structured Ability DSL instead of copyrighted rules text.

## Why

List-builder apps are great at building and bad at mid-game reference. If your
list has three Boyz squads, you want **one** Boyz entry showing the union of
their wargear ("rokkit launcha ×1 — squad #2 only"), not three near-identical
datasheets. This app dedupes by datasheet + enhancement, so identical squads
merge and enhanced characters stay separate.

## Features

- **Import** from the GW app export, New Recruit (text or JSON), ListForge, or
  Rosterizer — format auto-detected; unresolved names get candidate suggestions
  you confirm once, remembered per list.
- **Glance screen**: detachment rule, enhancement chips, one row per distinct
  unit with a micro-statline (T / Sv / W / OC), keyword search.
- **Unit detail**: full profiles, merged weapon table with per-squad tags,
  abilities in plain English (translated from the 40kdc Ability DSL),
  enhancement, leader attachments, and stratagems that can target the unit.
- **Two slots** — Mine / Opponent — with any number of saved lists (localStorage).
- **Offline PWA**: the full dataset is precached after first load; works at the
  game table with no signal.
- Weekly GitHub Action bumps the dataset package and redeploys, so the app
  tracks new dataslates automatically.

## Development

```bash
npm install
npm run dev      # local dev server
npm test         # vitest: dedup/stratagem logic + roster-import conformance
npm run build    # type-check + production build (dist/)
```

## Deploying

Pushes to `main` deploy to GitHub Pages via `.github/workflows/deploy.yml`
(enable Pages → "GitHub Actions" in repo settings). The Vite base path is
derived from the repo name automatically in CI; for a different host set
`GH_PAGES_BASE`.

## Data & licensing

Game data comes entirely from
[`@alpaca-software/40kdc-data`](https://github.com/wn-mitch/40kdc-data):
stat lines and points (numerical facts), plus community-authored structured
ability mechanics. No Games Workshop rules text or artwork is included.
This deployment displays the required "Powered by 40kdc-data" attribution.

This is an unofficial fan project, not endorsed by Games Workshop.
