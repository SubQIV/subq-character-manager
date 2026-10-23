# SubQ Character Manager

A private D&D 5e character manager (2014 and 2024 rules) for one table: Android first, works on PC, syncs through a shared Google Drive folder.

Live site: https://subqiv.github.io/subq-character-manager/

## Status

Phase 0: proving that two Google accounts can share, read and edit a character file in one Drive folder, including offline edits and simultaneous saves. The test page is at `site/phase0/`.

## Layout

- `site/` is published to GitHub Pages on every push to `main`.
- `site/phase0/` is the Drive test page. `sync.js` holds the change-log merge logic; `drive.js` wraps the Drive API.
- `tests/` runs with `npm test` (Node's built-in test runner, no dependencies) and must pass before publishing.

## Content

Only SRD content (CC-BY-4.0) and original code belong in this repository. Content from purchased books lives in the table's Drive folder as content packs, never here.
