# Impact report: Week 1's remaining features

**Date:** 2026-09-27
**Status:** Pre-implementation survey — none of these three are built yet.
**Purpose:** Standing practice starting now — before implementing a real feature,
write down what it actually touches, what new functions/calls it introduces,
and how it changes the program as a whole. Saved here (not just in chat) so
it survives across sessions and can be checked against what actually shipped
if something breaks later.

This covers the three Week 1 ideas not yet started: **Recommendations**,
**Region rollup**, and **Challenges**. Each section is grounded in the real
current code, not the original brainstorm's assumptions — one of those
assumptions turned out to be wrong (see Recommendations below), which is
exactly the kind of thing this practice is meant to catch before, not after,
a feature gets built on top of a false premise.

---

## 1. Recommendations (ranked "what to explore next")

### Correction to the original plan

The original roadmap described this as "a direct extension of the
already-shipped `pick_suggested_next`... currently a single nearest-waypoint
arrow." **That's not accurate.** Verified directly against the real code:

- `zone_data.py:246`'s `pick_suggested_next(zone_data, origin_lat, origin_lng)`
  is fully built and has real unit tests (`tests/test_zone_data.py`).
- `narrate.py:274` has a comment describing it as feeding "the map's waypoint
  marker" — but the function is **never actually called** anywhere in
  `narrate_block`'s real logic. It's referenced only in that one comment.
- `NarrateBlockResponse` (`schemas.py:116`) has no `suggested_next` field.

**Correction (added during the real planning pass for this feature,
2026-09-28):** the line above originally claimed "mobile has zero references
to a waypoint/suggestion arrow anywhere in `src/`." That was wrong — this
report's own author didn't grep for it before writing that line.
`mobile/src/components/WaypointCompass.tsx` is real, live, and has been
rendering in production since commit `980681e` (2026-07-09), inside
`ActiveTourScreen.tsx`. It's a real, shipped arrow-and-distance-label
component. It just points at something unrelated to a suggested next
place: `blockOrigin`, the spot where the *current* block's own narration
was triggered, so a walker who wanders while listening can find their way
back. See `docs/impact-reports/2026-09-28-recommendations.md` for how this
changed the actual plan (informational text line, not a repurposed compass).

So the backend half of this correction stands (`pick_suggested_next` really
is dead code, never called), but "wire up dead code, then generalize it"
undersold what already existed on the mobile side — there was a real,
reusable UI primitive for "point at a place" already shipped, just aimed at
a different target. A stale impact report is worse than none — this is
exactly why the practice includes re-checking citations before building on
them, and this file is proof it's needed even for reports about to be acted
on the very next day.

### What it would actually touch

**Step 1 — resurrect the single-suggestion case (currently non-existent in production):**
- `app/models/schemas.py` — add a field to `NarrateBlockResponse` (e.g.
  `suggested_next: Optional[SuggestedWaypoint]`).
- `app/api/narrate.py` — call `zone_data.pick_suggested_next(raw_data, request.lat, request.lng)`
  near the end of `narrate_block`, include the result in the response.
- Zero new external calls or cost — it only mines `raw_data`, already fetched
  for narration on this exact request.

**Step 2 — generalize to a ranked list (the actual ask):**
- `pick_suggested_next` restructured to return the top 3-5 candidates instead
  of just the closest one, each carrying a reason ("closest," "matches your
  mood" if a source item's category lines up with `request.mood`).
- New response shape: `suggested_next: List[SuggestedWaypoint]`, each
  `{name, lat, lng, distance_m, reason}`.
- Mobile: `api.ts`'s `NarrateBlockResponse` type, plus new UI in
  `MapScreen.tsx` (or `ActiveTourScreen.tsx`) to actually render it — today
  there is nothing to update, since nothing renders this at all.

### Impact on the program as a whole

- **Touches `narrate_block`, the single highest-traffic endpoint in the app.**
  Every real walk calls this on every new block. A bug in the new field
  (e.g. an unhandled exception in the ranking logic) risks the core walking
  loop, not a side feature — this needs the same care as any other change to
  that function, including running the full `test_narrate_block.py` suite,
  not just new tests for the addition.
- No new tables, no new migration, no new billed API calls.
- Because the "single arrow" never shipped, there's no existing UI behavior
  to preserve compatibility with — this is a clean net-new feature, not a
  migration of a live one.

---

## 2. Region rollup (country / world aggregation)

### Verified current state

- `region_boundaries.region_type` (migration 033) is `CHECK (region_type IN
  ('city', 'borough', 'district'))` — no `'country'` or `'world'` value yet.
- `user_explored_cells` (migrations 029, 031) has `neighborhood` and `city`
  columns, but no `country` column.
- `zone_data_cache.country` already exists and is already populated on every
  cache row — the raw material is already there, just not copied forward to
  `user_explored_cells` the way `city`/`neighborhood` are.
- `get_explored_city_counts` groups only by `city`.

This part of the original roadmap's framing ("straightforward once city-level
exists — same rollup logic one level up") holds up well against the real
code — this is the smallest, lowest-risk of the three.

### What it would actually touch

- New migration: add `country TEXT` to `user_explored_cells`.
- `app/api/explored.py::report_explored_cell` — already attributes
  `neighborhood`/`city` from the same `get_cached_zone_data` row it already
  fetches; extending it to also read `.country` from that same row is a
  zero-new-cost, same-shape change.
- `supabase_db.get_explored_country_counts(user_id)` — near-identical copy
  of `get_explored_city_counts`, grouped by `country` instead.
- New `GET /explored-cells/countries` endpoint, `ExploredCountryCount`/
  `ExploredCountriesResponse` schemas — mirrors the city ones directly.
- A "world total" figure likely needs no new endpoint at all — it's probably
  just a derived client-side stat (count of distinct cities/countries already
  in hand from data already being fetched).
- Mobile: extends the already-shipped `CitiesSheet.tsx` pattern (a country
  tab, or a level toggle) rather than building new UI from scratch.

### Impact on the program as a whole

- **Lowest risk of the three.** Touches the same narrow code path already
  proven safe for city-level (`report_explored_cell`), and the mobile side
  reuses an already-shipped, already-tested component.
- No changes to the narration pipeline itself.
- Real boundary polygons (real country outlines) are NOT needed for the
  count-only version — only if we ever want a real "% of a country explored"
  the way city-level got with `region_boundaries`. Worth deciding explicitly
  before building whether count-only is enough for v1 (matches how city-level
  itself started, before OSM boundaries were added).

---

## 3. Challenges

### Correction to the original plan

The original roadmap called this "new table + progress tracking, same shape
as badges, lower risk." Verified against the real code, **badges have no
backend table at all** — `mobile/src/services/badges.ts`'s `BADGE_DEFS` is a
static array of `earned(stats: UserStats) => boolean` predicates evaluated
client-side against `GET /user/stats`, which returns lifetime cumulative
totals (`tours_completed`, `total_distance_m`, `cities_visited`, etc.).

A challenge like "explore 5 new blocks this week" needs a **time-windowed**
count, which a lifetime total cannot answer, and needs a **permanent record**
of past challenge outcomes (badges never need to answer "did you earn this
one during a week that has already ended" — earned status is always
re-derivable from lifetime stats; a past week's challenge result is not,
once that week's live window has closed). So this is NOT the same shape as
badges — it's a genuinely new kind of thing in this codebase.

### What it would actually touch

Real open design decision, not yet resolved:
- **Option A — compute live, no new table.** A challenge's current-week
  progress can be computed from already-timestamped data
  (`user_explored_cells.first_explored_at`, `tours.created_at`) with a
  `WHERE created_at > now() - interval '7 days'`-style query. Cheapest, nod
  to badges' "derived, not stored" philosophy — but can't answer "what did
  you complete last month" once the window closes, unless a snapshot is
  taken at expiry.
- **Option B — a real table.** `challenges` (id, description, goal_type,
  goal_count, window_days) + `user_challenge_progress` (user_id, challenge_id,
  progress, completed_at). Needed if we want challenge history to persist,
  or want challenges to be assignable/rotating rather than always-on fixed
  goals.

This decision should be made explicitly (likely via a real planning pass,
same as Collectible Discoveries got) before writing any code — it changes
the entire shape of the feature.

### Impact on the program as a whole

- **Moderate new-code volume, but low blast radius** — unlike Recommendations,
  this doesn't touch `narrate_block` or any other hot path. New tables/
  endpoints are additive; nothing existing needs to change to support it.
- If Option B (a real table) is chosen: this is the first "time-windowed,
  persistent progress" mechanic in the app — worth building carefully, since
  Discovery Timeline and other future ideas may want the same pattern later.
- Mobile: new UI (challenge cards with progress bars), most likely surfaced
  on Home near the existing Badges section, or inside Badge Gallery as a
  second tab.

---

## Summary table

| Feature | New tables? | Touches hot path? | Biggest real risk | Original plan accurate? |
|---|---|---|---|---|
| Recommendations | No | **Yes — `narrate_block`** | A bug ships inside the app's highest-traffic endpoint | **No** — assumed a live feature that doesn't exist |
| Region rollup | Yes (1 column) | No | Low — near-identical copy of proven city-level code | Yes — holds up well |
| Challenges | Maybe (real design decision needed) | No | Scope creep if the time-window/history question isn't settled first | **No** — badges have no table to copy the "shape" of |

## Verification this report is still accurate

Before implementing any of the three, re-check the specific file:line
citations above still hold (code moves) — a stale impact report is worse
than none, since it invites building on a premise nobody re-checked.
