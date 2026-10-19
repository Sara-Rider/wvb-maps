# Archived: directory pin-map thumbnails

Retired 2026-10-19, replaced by the E3 card art (tools/render-map/card-art.mjs).
Kept so the map tiles can be brought back if WVB returns to them.

## What is here
- `tools/` — the map renderer exactly as it stood at commit 33975de (MapLibre +
  OpenFreeMap positron, zoom 12.5, pin 110px, Decision 37 glyph pins, 1200x675 @2x).
- `workflows/` — the two Actions that ran it. They are outside .github/workflows on
  purpose, so they cannot run by accident.
- `renders/` — map tiles that the card-art run did not overwrite (listings not on the
  site), plus the last render-index.csv receipt.

## The full set of map tiles
Every map tile as it was before the switch is in git on the branch
`archive/pin-map-final` (commit 33975de), under renders/. They are not copied here to keep the repo small.
Recover one with:
    git fetch origin archive/pin-map-final
    git show origin/archive/pin-map-final:renders/dir-<slug>.png > dir-<slug>.png

## To bring the maps back
1. Copy `tools/*` back into tools/render-map/ and `workflows/*` into .github/workflows/.
2. Point airtable-source.mjs at the live base (it pointed at the frozen v1 base,
   apperKKJ9nZkf62lI, when retired).
3. The old flow never wrote to Webflow; the card-art webflow-write.mjs step can be
   reused for that.
