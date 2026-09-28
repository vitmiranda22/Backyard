# Impact report: Recommendations (informational "nearby place" line)

**Date:** 2026-09-28
**Status:** About to implement. Written before the commit, per the standing
practice started 2026-09-27.
**Supersedes:** the Recommendations section of
`docs/impact-reports/2026-09-27-week1-remaining-features.md`, which
contained a real factual error (corrected in place there) and assumed a
bigger scope than what this feature actually turned out to need.

## What changed since the original survey, and why

Two things surfaced while actually planning this feature that changed its
shape:

1. **Product-level question, not just technical.** Walking through what
   "Recommendations" should actually do raised a real question: does
   pointing a walker toward a specific next place fit an app whose whole
   identity is reactive (narrates wherever you are) rather than directive
   (tells you where to go)? Resolved: **informational only** — mention a
   real nearby place and its distance, never a compass arrow, never a push.
   The existing `WaypointCompass`/`blockOrigin` "find your way back to this
   story" behavior is untouched, not repurposed for this.
2. **Scope shrank once the UI was actually mocked up.** A single quiet line
   ("Also nearby: Nob Hill Masonic Center · 140m") needs exactly one named
   place, which is what `pick_suggested_next` already returns. The original
   survey's "generalize to a ranked list" step is dropped entirely — not
   deferred, just not needed for what this feature turned out to be.

## What this commit actually touches

**Backend — all in the existing narration pipeline, zero new endpoints, zero new tables, zero new cost:**
- `zone_data.py::pick_suggested_next` gets one new field on its return dict
  (`distance_m`, already computed internally, just not returned before).
- `schemas.py` gets one new model (`SuggestedPlace`) and one new optional
  field on `NarrateBlockResponse` (`suggested_next`).
- `narrate.py::narrate_block` gets one new call, using data (`raw_data`)
  it already has in hand by the time the response is built.

**Mobile — one new optional prop on an existing shared component:**
- `NarrationCard.tsx` gets an optional `suggestedNext` prop, rendered as one
  line, off by default.
- Only `ActiveTourScreen.tsx` ever passes it — `MuseumTourScreen.tsx` and
  `ReplayScreen.tsx` also render `NarrationCard` but have no live-GPS "next
  place" concept, so they're unaffected by construction, not by a
  conditional check added to guard them.

## Real risk this commit carries

- **It touches `narrate_block`**, the single highest-traffic endpoint in the
  app — called on every new block during every walk. The change itself is
  additive (a new optional field; old clients simply ignore it), but any
  exception inside `pick_suggested_next`'s new code path would need to fail
  safely without breaking the narration response itself. Verify: the call
  site in `narrate.py` should not let a `pick_suggested_next` failure raise
  past it — wrap or let a `None` result flow through cleanly, same posture
  as every other best-effort addition in that function (photo, connector).
- Everything else is low risk — no schema migration, no new external calls,
  a mobile UI addition that's invisible unless data is actually present.

## Verification checklist

- [x] Backend: `py_compile` + full `pytest backend/tests/` passes (291 tests)
- [x] Mobile: `tsc --noEmit` + full `npx jest` passes (286 tests)
- [ ] Manual: a real walk with a real nearby Wikipedia/OSM entry shows the
      line on a real device (the maturity radar's outer Testing ring) —
      still open, needs a real walk to confirm
- [x] Confirmed via a dedicated test
      (`test_suggested_next_failure_never_breaks_the_narration_response`)
      that a `pick_suggested_next` exception is caught in `narrate.py` and
      never affects the narration response

## What actually shipped

Matches the plan almost exactly, with one addition not in the original
plan: `pick_suggested_next`'s call site in `narrate.py` is wrapped in its
own `try/except`, logging and falling back to `suggested_next=None` rather
than letting any exception propagate — the plan mentioned this as a
requirement but the specific implementation (a dedicated try/except block
around just this one call, separate from the rest of the function) is
worth noting here since it's the one piece of defensive code this feature
added beyond wiring existing pieces together.
