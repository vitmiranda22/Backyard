# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Backyard is an AI-powered walking tour app. The mobile app sends GPS coordinates to the backend, which pulls real data from ~34 sources (city open data, Wikipedia, OSM, Wikidata, etc.), feeds it to GPT-4.1-mini to generate a mood-specific narration, converts it to speech, and streams audio + a street-level photo back to the walker. The backend is where almost all the real logic lives; the mobile app is a comparatively thin client.

## Commands

### Backend (`backend/`)

```bash
# Setup
python -m venv venv
venv\Scripts\activate          # Windows; `source venv/bin/activate` elsewhere
pip install -r requirements.txt
cp .env.example .env           # fill in API keys, see docs/API_SETUP_GUIDE.md

# Run
uvicorn app.main:app --reload  # http://localhost:8000, docs at /docs

# Test
pytest tests/ -q                                   # full suite
pytest tests/test_narrate_block.py -q               # one file
pytest tests/test_narrate_block.py::test_name -q    # one test
python -m py_compile app/path/to/file.py            # syntax-check a new/edited file without installing anything
```

Tests live only under `tests/` (`pyproject.toml` scopes `testpaths` there on purpose — `scripts/manual_checks/` holds one-off scripts that hit live servers and must never be collected by pytest).

### Mobile (`mobile/`)

```bash
npm install
npx expo start                 # scan QR with Expo Go
npx tsc --noEmit                # typecheck
npx jest                        # full suite
npx jest src/screens/__tests__/HomeScreen.test.tsx   # one file
```

Shipping a change to users: `eas update --channel production --message "..." --non-interactive`. The app must be fully closed and reopened **twice** before an OTA update is visible — a single reopen can still show the old bundle.

### Database migrations

SQL files in `backend/migrations/`, numbered sequentially. **There is no migration runner** — each file is run by hand in the Supabase SQL Editor. When adding one, follow the existing numbering and check the most recent migration for the current convention on RLS (see below).

## Architecture

### Request flow: `POST /narrate-block`

This is the core endpoint and the one most worth understanding end-to-end before touching the narration pipeline:

1. `app/api/narrate.py` receives lat/lng + mood + user id.
2. `app/services/zone_data.py` computes a geohash for the location and checks `zone_data_cache` (30-day TTL, **mood-agnostic** — the same cached data feeds all five moods). On a miss, it fires off every applicable data source in parallel (SF-only DataSF queries, NYC/Chicago Socrata, always-on global sources like Wikipedia/OSM/Wikidata, and other city-gated sources), waits on all of them with per-source timeouts, and caches the merged blob.
3. `app/services/openai_service.py` feeds that real data into a mood-specific system prompt (`app/core/prompts.py`) and asks `gpt-4.1-mini` (Responses API, with `web_search` enabled) to write the narration.
4. `app/services/tts.py` converts it to audio via Google Cloud TTS; `app/services/r2.py` uploads the MP3 to Cloudflare R2 and returns a signed URL. (`elevenlabs_service.py` exists only for mood-preview samples before a tour starts — it is never used for real per-block narration audio; it's deliberately excluded from the `Voice` enum so it can't be selected as a narration voice.)
5. `app/services/streetview.py` fetches a matching photo, cached separately from narration (see geohash precision below).
6. `pick_suggested_next()` (also in `zone_data.py`) may attach a nearby-place suggestion to the response — display-only, never a directive ("Recommendations" feature).

### Geohash caching precision

Two different precisions are used for two different purposes — don't conflate them:
- **Precision 7 (~153m)** for narration/zone-data caching and exploration tracking.
- **Precision 8 (~19m)** for Street View photo caching, since a photo is much more sensitive to exact position than a narration paragraph is.

### "Derive, don't store" vs. the one genuine exception

Several features are deliberately computed from existing data with **zero new tables**, rather than cached/stored:
- **Badges** (`mobile/src/services/badges.ts`) are 100% derived client-side from lifetime `UserStats` — no backend table at all.
- **Challenges** rotation (`backend/app/services/challenges.py`) is `TEMPLATES[iso_week_number(now) % len(TEMPLATES)]` — a pure function of the calendar, so any past or future week's active challenge is reconstructable with no stored schedule.

The one thing in both of these that genuinely needs persistence is **completion history** (did a specific user complete a specific week's challenge) — that's the actual justification for `user_challenge_completions` being the only new table the Challenges feature needed. When adding a similar feature, look for this same split before reaching for a new table: what can be computed live, and what's the one fact that truly can't be reconstructed after the fact?

### Record-as-side-effect, not a separate POST

Idempotent "mark this as done" writes (`record_discovery`, `record_challenge_completion` in `supabase_db.py`) happen as a side effect of an existing read/activity endpoint (`narrate_block`, `GET /challenges`), not as a client-initiated POST the mobile app calls separately. They use Supabase's `upsert(..., on_conflict=..., ignore_duplicates=True)` so calling them repeatedly is always safe. Follow this shape for new gamification features rather than adding a new write endpoint the client has to remember to call.

### RLS convention

`user_explored_cells` (real GPS walking history — personal, sensitive) has RLS enabled. `user_discoveries` and `user_challenge_completions` (gamification bookkeeping, written only by the backend's service-role key) deliberately do **not** enable RLS, matching `narration_cache`/`zone_data_cache`. When adding a new user-data table, this is the actual question to ask — is this real location history, or backend-only gamification state — not a default to copy from the most recent migration.

### Test fixture gotcha: `auth_as`

`backend/tests/conftest.py`'s `app` fixture is a cached module-level singleton across the *entire test session*, not per-test. The `auth_as` fixture overrides `get_current_user_id` on that shared app — if it doesn't explicitly pop the override after `yield`, the override leaks into every later test that never called `auth_as`, silently making unauthenticated endpoints look authenticated. If an endpoint's "requires auth" test starts mysteriously returning 200 instead of 401, check this first.

### Mobile: no react-navigation for the main flow

The core app flow is a manual screen-state machine in `App.tsx` (`screen === "x" && <XScreen .../>`), not `react-navigation` (which is present in `package.json` but only used for a couple of secondary flows). Don't assume a `navigation` prop exists on a screen component — check `App.tsx` for how it's actually mounted and what props it's given.

### Mobile tests

- `render()` from `@testing-library/react-native` must be `await`ed.
- `react-i18next` is globally mocked (`__mocks__/react-i18next.js`): `t("key")` returns the literal string `"key"`, and `t("key", {count: 5})` returns `'key {"count":5}'`. Tests assert against these literal patterns, not real translated copy — this is intentional, so copy changes don't break unrelated test assertions.

### Mobile design tokens (`src/theme.ts`)

Two coexisting visual directions: an older cool-toned "Dawn Air" palette (`colors.bg/text/accent`, being migrated away from) and the current "Field Guide" direction (`colors.parchmentBg/ink/fieldGreen/fieldMuted`, sampled from `mobile/mockups/field_guide_mockup_v2.png`). New screens should use Field Guide tokens; existing screens are migrated one at a time, not all at once. Fonts follow the same split: `font.heading`/`headingBold` (DM Serif Display) and `font.serif` (Libre Baskerville) are current; `font.script` (Caveat) is reserved *only* for in-app tour narration text — it's too thin to read outdoors at UI sizes, which is exactly why it got pulled out of headings.

### Marketing site (`marketing/site/`)

A separate static site (own `css/style.css`, no build step), deployed independently of the app — it is **not** part of the Expo or FastAPI build. It has real GEO/AEO infrastructure already in place: `llms.txt` (a plain-language summary for AI crawlers), JSON-LD (`SoftwareApplication` + `Organization` schema on the homepage), and `FAQPage` schema on `faq.html`/`compare.html`. When adding a new page here, match that pattern (canonical URL, OG/Twitter tags, appropriate JSON-LD) rather than treating it as a plain HTML page — it's deliberately built to be machine-readable, not just human-readable.

Changes here don't go live until committed **and pushed** — a domain-verification file in that directory implies an auto-deploy-on-push host (Netlify/Vercel/Cloudflare Pages), but there's no CI config in this repo that confirms which one or what the deploy hook actually does.
