# SubQ Character Manager

A private D&D 5e character manager (2014 and 2024 rules) for one table: Android first, works on PC, syncs through a shared Google Drive folder.

Live app: https://subqiv.github.io/subq-character-manager/

## Status

- Phase 0 (Drive test) passed on 23 Oct 2026. The test page stays at `/phase0/`.
- Phase 1 in progress, stored on the device:
  - Checkpoint 1: manual character entry, hit points, custom trackers and currencies, conditions with rules text, spell slots, rests, calculations you can inspect and override, and full history with undo.
  - Checkpoint 2: inventory with containers and weight, weapons with attack calculations, armor, magic items with attunement, identification and charges (recharging on rests and at dawn), notes, backstory, personality and portraits.

## Layout

- `src/model/` the character data model, the change log (every edit is an entry; undo is an entry) and the calculations.
- `src/packs/` the content pack format and the built-in SRD 5.1 and 5.2 packs.
- `src/store/` on-device storage (IndexedDB) and the store the screens use.
- `src/ui/` the screens.
- `public/phase0/` the phase 0 Drive test page.
- `tests/` unit tests (`npm test`); `e2e/walkthrough.py` drives the built app in a browser.

`npm run check` type-checks, tests and builds. GitHub Actions runs the same checks before every publish.

## Content

Only SRD content (CC-BY-4.0) and original code belong in this repository. Content from purchased books lives in the table's Drive folder as content packs, never here.
