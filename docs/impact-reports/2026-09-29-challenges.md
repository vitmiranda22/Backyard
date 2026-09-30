# Impact report: Challenges (a rotating weekly goal)

**Date:** 2026-09-29
**Status:** Implemented and verified (backend + mobile). Last of the four Week 1 ideas.
**Supersedes:** the Challenges section of
`docs/impact-reports/2026-09-27-week1-remaining-features.md`, which
correctly flagged that badges' "no table" shape doesn't transfer directly,
but didn't go far enough — planning this for real found a design that
needs no table for the rotation itself, only for completion history.

## What changed since the original survey, and why

1. **"Rotating" doesn't require a table if rotation is deterministic.**
   The original report assumed a real table was needed either way (to
   compute live, or to persist a rotation schedule). Working through it:
   if the active challenge is a pure function of the calendar week number
   (`TEMPLATES[week_number % pool_size]`), any past or future week's
   active challenge is always reconstructable with zero stored state —
   same "derive, don't store" philosophy badges already use, just with a
   time window added to the query.
2. **The one thing that genuinely needs persistence: completion history.**
   The user explicitly wants a permanent "you've completed N challenges"
   count. That's real state a live query can't produce (once a week ends,
   nothing "remembers" you hit the goal unless something wrote it down) —
   the one new table this feature needs, not the whole feature.
3. **Scope trimmed to one window type.** All three v1 challenge templates
   are weekly-window, not a mix of weekly/monthly — a monthly challenge
   rotating on a weekly cadence creates a real mismatch (does its window
   reset with the rotation, or on its own monthly clock?) that isn't worth
   solving for v1. Deferred, not dropped.

## What this commit actually touches

**Backend — one new table, one new service module, one new endpoint:**
- `user_challenge_completions` is genuinely new state — everything else
  (`user_explored_cells`, `tours`, `user_discoveries`) is read-only from
  this feature's perspective. No existing write path
  (`report_explored_cell`, `end_tour`, `record_discovery`) changes at all.
- `GET /challenges` is the only place completion gets checked-and-recorded
  — a read endpoint with a side effect, same shape as `record_discovery`
  being a side effect of `narrate_block`, not a separate POST the client
  asserts.
- No hot path touched (`narrate_block` untouched), no new external calls.

**Mobile — one new card on an already-busy screen:**
- Home already fetches three things independently on mount (tours, stats,
  discovery count); this adds a fourth, same pattern, no changes to the
  existing three.

## Real risk this commit carries

- **Lowest technical risk of the four Week 1 features** — no hot path, no
  refactor of shared code (unlike Region rollup's `CityRow` extraction),
  one new table used by exactly one new endpoint.
- **The real risk is content, not code:** if a challenge's goal count is
  tuned wrong (too easy, trivially always complete; too hard, never
  reachable for a typical week's usage), the feature reads as broken even
  though nothing crashed. Goal counts (5 blocks, 5 km, 3 discoveries) are
  a judgment call, not derived from real usage data — worth revisiting
  once real completion rates are observable.
- Week boundary is ISO week (Monday 00:00 UTC) — a user near that boundary
  in a non-UTC timezone could see their "week" reset at a locally odd
  hour. Same class of simplification already accepted elsewhere in this
  app (e.g. daily narration quota resets on a fixed UTC window).

## Verification checklist

- [x] Backend: `py_compile` + full `pytest backend/tests/` passes (307 passed)
- [x] Mobile: `tsc --noEmit` + full `npx jest` passes (293 passed; 4 unrelated
      screens timed out only under full-suite parallel load, all pass clean
      in isolation)
- [ ] Manual: confirm on a real device that the card shows real progress
      toward the actual current week's challenge, and completing it
      updates the completed count (the maturity radar's outer Testing ring)
