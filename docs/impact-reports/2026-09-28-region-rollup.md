# Impact report: Region rollup (country counts in Journal)

**Date:** 2026-09-28
**Status:** About to implement.
**Supersedes:** the Region rollup section of
`docs/impact-reports/2026-09-27-week1-remaining-features.md`, whose
technical assessment held up well (this is the one Week 1 idea whose
original framing was actually accurate) but didn't anticipate two real
product decisions that came up during planning.

## What changed since the original survey, and why

1. **Country-level percentages would be meaningless, not just harder.**
   San Francisco's 32,647 cells are walkable in a lifetime; a country's
   cell count is orders of magnitude larger. A "% of country explored"
   figure would functionally always read as ~0.00000x% — not a smaller
   version of the city stat, a different, discouraging kind of number.
   Decided: **count-only, no percentage, no boundary polygons** for
   country/world. This also means the `region_boundaries` table (and its
   OSM-mapping script) is untouched by this feature entirely.
2. **Placement, decided explicitly rather than assumed.** Not a toggle
   inside the existing Map "Cities" sheet — a new third tab ("Places") in
   the Journal screen, alongside "My Tours"/"Discover." Both the Map's
   Cities sheet and this new tab exist side by side; nothing is being
   consolidated or removed.

## What this commit actually touches

**Backend — one new column, one new near-duplicate query, one new endpoint:**
- `user_explored_cells` gets a `country` column (migration 035), filled the
  same way `city`/`neighborhood` already are — from `zone_data_cache`,
  which already has `country` populated on every row. Zero new geocoding,
  zero new external calls.
- `get_explored_country_counts` is a near-identical copy of
  `get_explored_city_counts`, deliberately simpler (no boundary lookup, no
  percentage) — not sharing code with the city version isn't an oversight,
  the two are meant to diverge (one can gain real boundaries later, the
  other never will).
- New `GET /explored-cells/countries` — additive, doesn't touch
  `/explored-cells/cities` or anything else.

**Mobile — one small refactor plus one new tab:**
- Extracting `CityRow` out of `CitiesSheet.tsx` is the one place this
  commit touches already-shipped, already-live code. It's meant to be a
  pure extraction (identical rendering, moved to its own file) — the
  verification step below explicitly checks `CitiesSheet.test.tsx` still
  passes unchanged to catch any accidental behavior drift during the move.
- `ToursScreen.tsx`'s new "places" segment follows the same lazy-load-on-
  select pattern the file already uses for "discover" — no changes to the
  "mine"/"discover" segments' own behavior.

## Real risk this commit carries

- **Lowest risk of the three Week 1 features implemented so far.** No hot
  path touched (`narrate_block` untouched, unlike Recommendations), no new
  external calls, no new tables (unlike a hypothetical Challenges table).
  The only shared-code risk is the `CityRow` extraction — mitigated by
  explicitly re-running `CitiesSheet.test.tsx` unchanged as a regression
  check, not just testing the new tab's own behavior.
- The `country` column starts empty for every cell explored before this
  ships — same accepted gap as `city`/`neighborhood` had when migration 031
  shipped (only cells explored going forward get attributed).

## Verification checklist

- [x] Backend: `py_compile` + full `pytest backend/tests/` passes (293 tests)
- [x] Mobile: `tsc --noEmit` + full `npx jest` passes (290 tests), including
      `CitiesSheet.test.tsx`'s 7 tests passing unchanged after the
      `CityRow` extraction -- confirmed a pure refactor, no behavior drift
- [ ] Manual: a real walk in a new country shows up under Journal's Places
      tab (the maturity radar's outer Testing ring) -- still open
