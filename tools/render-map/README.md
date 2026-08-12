# Directory map thumbnail — render harness

Renders one map thumbnail (1200×675) centered on a listing's coordinates, with
the category/attraction glyph stamped into a Mountain Slate pin (gold ring +
larger when Certified). Stack: headless MapLibre GL + OpenFreeMap `positron`.

**This is a test harness first.** Its job is to prove zoom + pin legibility on
one real listing before we batch all 58. Run it, look at the PNG, change the
zoom, re-run.

## Run it (no local setup needed)

1. Go to the repo's **Actions** tab → **Render directory map thumbnail** → **Run workflow**.
2. Leave the defaults for the first run (Summersville Lake Dam Overlook), or fill
   in a different listing.
3. When it finishes, open the run's **Summary** — it prints the raw PNG URL.
4. Not happy with the framing? Re-run with a different **zoom** (try 11.5, 12,
   13). That one number is what we're tuning.

## Inputs

| Input | Notes |
|---|---|
| `name` | Used for the filename (`renders/<slug>.png`) and commit message |
| `lat`, `lng` | Listing coordinates |
| `zoom` | The number we tune. Start ~12.5 |
| `category` | food, lodging, camping, fuel, moto, guides, other — used only if `attraction_type` is blank |
| `attraction_type` | overlook, waterfall, bridge, monument, park, scenic-road, swing — wins over `category` |
| `certified` | `true` = gold ring + larger pin |

## Notes / production TODOs

- **Glyphs are test-grade** approximations drawn to the Decision 37 grammar
  (24×24, ~2px outline, white). Swap in the exact Tabler (MIT) paths for
  production — same visual language, cleaner curves.
- **Attribution:** the thumbnail is rendered with map attribution off for a
  clean image. OpenFreeMap/positron attribution must appear somewhere on the
  directory page in production (not baked per-thumbnail).
- **Map style:** `positron` (muted) so the pin pops. A custom WVB map style is a
  v2 nicety.
- **Batch step** (all 58, per-row regenerate on publish) comes after the zoom is
  locked here — it reuses this exact render path.
