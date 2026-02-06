# WanderVox — MVP Technical Blueprint v4.0

**App Name (working title):** WanderVox
**One-liner:** AI-powered guided tours anywhere in the world — every street has a story.
**Date:** February 5, 2026
**Version:** 4.0 — FINAL. All product decisions locked, all architecture finalized, all security gaps closed.

---

## Product Decisions (Locked)

| Decision | Answer |
|---|---|
| Tour flow model | **Hybrid**: auto-detect interesting spots as user walks + user can tap to skip or explore on demand |
| Tour length | **Open-ended**: no pre-set duration. User walks as long as they want, stops whenever. |
| Low-data areas | **Both**: graceful AI fallback in thin-data areas + virtual tours for exploring famous cities from the couch |
| Content safety | **On/off toggle** for mature content (graphic history, true crime details, etc.) |
| Social/community | **Dual mode**: tours can be posted with profile (name + avatar) OR posted anonymously |
| Solo vs group | **Solo first** for MVP; group/multiplayer is post-MVP |
| Revenue model | **Decide later** — prototype first |
| Language | **English only** for MVP |
| App name | **WanderVox** (working title, not final) |
| TTS / Voice API | **Google Cloud TTS** (1M chars/month free, neural voices). Fallback: Edge TTS (Microsoft, free, unlimited). Premium: ElevenLabs post-MVP. |
| Audio storage | **Cloudflare R2** (10GB free, zero egress fees). Audio generated server-side, stored as MP3, streamed to client. |
| Audio access | **Authenticated only** — must have account to stream/listen to shared tour audio |
| Shared tour links | **Deep link** — opens app if installed, falls back to app store listing |
| Tour replay modes | **Both** — "Walk This Tour" (GPS replay at real locations) + "Listen From Anywhere" (podcast-style, no GPS) |
| Data query strategy | **Query everything** — all 19 data sources per zone, cache raw bundle, let AI curate per mood |

---

## A) MVP Scope Table

| Feature | MVP (Build Now) | Later (Post-MVP) |
|---|---|---|
| **"Every Street Has a Story" Engine** | ✅ Reverse geocode → Gemini + Google Search Grounding → narration for current block | Fine-tuned models per mood, historical photo overlays |
| **Hybrid Tour Flow** | ✅ Auto-trigger at interesting spots (~200m) + manual "Tell me about here" button | Smart pacing based on walking speed, AR overlays |
| **Open-Ended Tour Duration** | ✅ No timer/route — walk as long as you want, tap "End Tour" when done | Suggested routes by duration ("30 min walk") |
| **Tour Moods / Themes** | ✅ 4 moods: Informative, Haunted, Celebrity, Curiosities | User-created custom moods, seasonal/holiday themes |
| **Content Safety Toggle** | ✅ On/off for mature content in Settings + pre-tour reminder | Granular intensity slider (PG / PG-13 / R) |
| **Text-to-Speech Playback** | ✅ Google Cloud TTS (neural voices, server-side MP3 generation). 3 voice presets (neutral, dramatic, warm) = 3 different Google TTS voices. Audio stored on Cloudflare R2, streamed to client. Edge TTS as fallback. | Premium voices (ElevenLabs), celebrity AI voices, user voice cloning |
| **Community Tours (Share/Rate)** | ✅ Save tour → deep link share, 5-star rating, comments. Post as profile OR anonymous. Replay: "Walk This Tour" (GPS) or "Listen From Anywhere" (podcast mode). Auth required for all playback. | Follow users, "staff picks," tour collections, web preview pages |
| **Discover Nearby Tours** | ✅ Map view of community tours near user | Filters by mood/rating/distance, trending feed |
| **Virtual Tours** | ✅ Pick a city → AI generates a "couch tour" you can listen to without being there | Interactive street view integration, VR mode |
| **City Open Data Integration** | ✅ San Francisco pilot: query ALL 15+ datasets per zone (film, crime, landmarks, trees, businesses, 1906 fire zones, cultural districts, public art, 311, evictions, building permits, parks). Cache raw data per zone. Let AI curate. | NYC, London, Paris, Tokyo open data portals |
| **User Auth** | ✅ Email + Google OAuth | Apple Sign-In, social login |
| **Onboarding** | ✅ 3-screen walkthrough | Personalization quiz, interest tagging |
| **Offline Support** | ❌ Later | Download tours for offline use |
| **Monetization** | ❌ Later | Freemium moods, creator marketplace, subscriptions |
| **Push Notifications** | ❌ Later | "New tour near you," social alerts |
| **Gamification** | ❌ Later | Badges, streaks, leaderboards |
| **Multi-language** | ❌ Later | i18n for UI + AI narration in other languages |
| **Group Tours** | ❌ Later | Friends join same tour, synced narration |

---

## B) Core User Stories

| # | User Story | Acceptance Criteria |
|---|---|---|
| **US-1** | As a traveler, I want to open the app and start hearing stories about whatever street I'm on, without planning anything. | App detects location, reverse geocodes to street/neighborhood, generates narration within 8 seconds, audio begins playing. |
| **US-2** | As a user, I want to choose a tour mood (Haunted, Informative, Celebrity, Curiosities) so the experience matches my vibe. | Mood selector shown before tour starts; AI narration tone, content, and vocabulary change per mood for the same location. |
| **US-3** | As a user, I want the tour to keep going as long as I walk, automatically telling me about new areas as I move, but I can also skip or ask "what's here?" manually. | Auto-trigger narration when entering a new ~200m zone. "Tell me about here" button triggers on-demand narration. "Skip" button moves to next segment. No forced end time. |
| **US-4** | As a user, I want to hear the tour narrated aloud with a voice I can choose so I can walk and listen hands-free. | 3 voice options available; audio plays, pauses, resumes; continues with phone locked/screen off. |
| **US-5** | As a user, I want to toggle mature content on or off so I can control how dark the stories get. | Content safety toggle in Settings (default: OFF/family-friendly). When ON, haunted/true-crime narrations include graphic historical details. Toggle state persists across sessions. |
| **US-6** | As a user, I want to save my completed tour and share it — either with my name or anonymously — so others can experience it. | Tour saved to profile. Toggle: "Post as [display_name]" or "Post anonymously." Generates shareable deep link (opens app or app store). Shared tour playable in two modes: "Walk This Tour" at real locations OR "Listen From Anywhere" podcast-style. Listener must have account. |
| **US-7** | As a user, I want to rate and comment on tours I've taken so I can help others find good ones. | 1–5 star rating + text comment. Visible on tour detail page. One rating per user per tour. |
| **US-8** | As an explorer, I want to browse community tours near me on a map so I can find interesting routes. | Map displays pins for community tours within 5km. Tapping a pin shows tour preview (mood, rating, creator or "Anonymous," comment count). |
| **US-9** | As someone at home, I want to take a virtual tour of a famous city from my couch. | City picker screen with 10+ seeded cities. Selecting a city starts an AI-generated walking narration through notable streets. No GPS required. |
| **US-10** | As a new user, I want to sign up quickly and understand the app in under 60 seconds. | Onboarding ≤3 screens. Sign-up with email or Google in ≤2 taps. First narration plays within 60s of opening. |

### Definition of Done (per story)

- Feature works on both iOS and Android (Expo Go or dev build).
- Happy path tested manually + key edge cases covered.
- No crash on empty state, loading state, or error state.
- Code reviewed (or self-reviewed with checklist).
- Content safety toggle respected in all AI-generated content.
- UI matches agreed wireframe/mockup.

---

## C) Screens + Flows

### Screen List

| # | Screen | Description |
|---|---|---|
| 1 | **Splash / Onboarding** | 3-panel walkthrough: "Every street has a story" → "Pick your mood" → "Walk and listen." Shown once. |
| 2 | **Sign Up / Login** | Email + password or Google OAuth. Minimal form. |
| 3 | **Home (Map View)** | Full-screen map centered on user location. Two floating CTAs: "Start Walking Tour" (GPS-based) and "Virtual Tour" (city picker). Shows nearby community tour pins. |
| 4 | **Mood Selector** | Bottom sheet: pick one of 4 moods with icons + short descriptions. Content safety reminder if toggle is ON ("Mature content is enabled"). |
| 5 | **Voice Selector** | Quick picker: 3 voice presets with a "preview" mini-play button for each. |
| 6 | **Active Tour (Walking)** | Map with user's live position. Current block narration card at bottom with audio controls (play/pause/skip). "Tell me about here" manual trigger button. "End Tour" button. No route line — open-ended. Progress: blocks visited counter. |
| 7 | **Active Tour (Virtual)** | Similar layout but without live GPS. Shows a map of the virtual city with narration points. User taps "Next Block" to advance. Street view thumbnail if available. |
| 8 | **Tour Complete / Summary** | Stats: blocks narrated, distance (walking only), duration, mood. Options: Save, Share (with profile or anonymous toggle), Rate. |
| 9 | **Tour Detail (Community)** | Tour name, creator (name or "Anonymous Explorer"), mood badge, route on map, avg rating, comments. Two CTA buttons: "Walk This Tour" (GPS replay) and "Listen From Anywhere" (podcast mode). Content safety badge if applicable. |
| 10 | **My Tours (Profile)** | List of saved/completed tours. Tap to view detail or re-share. Profile header with display name, avatar, tour count. |
| 11 | **Discover (Explore Tab)** | Map + list toggle of community tours nearby (walking) or globally (virtual). Sort by: rating, distance, newest. Filter by mood. |
| 12 | **City Picker (Virtual Tours)** | Grid of 10+ cities with hero images. Tap to start virtual tour in that city. |
| 13 | **Settings** | Account info, voice default, content safety toggle (with explanation), notification preferences, privacy (anonymous default on/off), logout, delete account. |

### Navigation Structure

```
Tab Bar (3 tabs):
├── Explore (Home Map + Discover)
├── My Tours (Profile + Saved Tours)
└── Settings
```

### Happy Path Flow — Walking Tour

```
App Open → Home (Map View)
  ↓ Tap "Start Walking Tour"
Mood Selector → Voice Selector → Active Tour (Walking)
  ↓ Walk around, hear auto-triggered narrations
  ↓ Optionally tap "Tell me about here" for on-demand stories
  ↓ Tap "End Tour" when done
Tour Complete / Summary
  ↓ Tap "Save & Share"
  ↓ Choose: Post with profile OR Anonymous
Share link generated → Tour appears on map for others
```

### Happy Path Flow — Virtual Tour

```
Home (Map View) → Tap "Virtual Tour"
  ↓
City Picker → Select "San Francisco"
  ↓
Mood Selector → Voice Selector → Active Tour (Virtual)
  ↓ Tap "Next Block" to hear narrations about different streets
  ↓ Tap "End Tour" when done
Tour Complete / Summary → Save & Rate
```

### Key Edge Cases

| Edge Case | Handling |
|---|---|
| **Location permission denied** | Show explanation screen: "WanderVox needs your location to tell stories about where you are." CTA → device settings. Offer Virtual Tours as alternative (no GPS needed). |
| **User stationary for 5+ minutes** | Gentle nudge: "Still exploring? Tap 'Tell me more about here' or keep walking for new stories." Don't auto-fire same narration twice. |
| **User revisits a block they already heard** | Don't re-trigger auto-narration for same zone in same session. User can manually tap "Tell me about here" for a fresh take (LLM will generate different angle). |
| **LLM API fails / timeout** | Retry once (3s delay) → show fallback: "Having trouble finding stories right now. Keep walking — we'll try again at the next block." Keep tour active, don't crash. |
| **TTS fails** | Fall back to text-only mode: show narration card with full text on screen. Small banner: "Audio unavailable — reading mode active." |
| **User goes into building / underground** | GPS signal lost → pause auto-triggers. Show: "Signal lost — tap 'Tell me about here' when you're back outside." Resume when GPS recovers. |
| **Very thin data area** | AI generates shorter narration based on whatever it can find (even just "This area of [town] was originally..." general context). If truly nothing: "This spot is off the beaten path! Not much recorded history here — but you might be making some." |
| **Content safety OFF but user in haunted mood** | Haunted narrations stay PG: "legend says," "rumored to be," no graphic violence/death details. When ON: historically accurate graphic content allowed. |
| **No community tours nearby** | "Be the first to create a tour here!" with prominent Start Tour CTA. Show closest community tours on map even if far away. |
| **No internet** | Queue narration requests. Show last loaded narration. Alert: "You're offline — stories will resume when connected." Virtual tours disabled. |

### States per Screen

| Screen | Empty | Loading | Error |
|---|---|---|---|
| Home Map | Map loads, no community pins | Spinner over map while fetching pins | "Couldn't load nearby tours. Pull to retry." |
| Active Tour | — | Pulsing card: "Finding stories about this block..." | "Narration failed. Tap to retry or keep walking." |
| Active Tour (Virtual) | — | Skeleton card while generating | "Couldn't generate narration. Tap 'Next Block' to try another area." |
| Discover | "No tours nearby yet. Create the first!" | Card skeletons | "Couldn't load tours. Check connection." |
| My Tours | "You haven't taken any tours yet. Start exploring!" | List skeletons | "Couldn't load your tours." |
| Comments | "No comments yet. Be the first!" | Spinner | "Couldn't load comments." |
| City Picker | Should never be empty (pre-seeded cities) | Grid skeletons | "Couldn't load cities. Check connection." |

---

## D) Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  CLIENT — React Native (Expo)                   │
│                                                                 │
│ ┌──────────┐ ┌──────────────┐ ┌───────┐ ┌───────────────────┐  │
│ │ MapView  │ │ Tour Engine  │ │ Audio │ │ Community Feed    │  │
│ │ (Mapbox) │ │ (State Mgr)  │ │Player │ │ (List + Map view) │  │
│ │          │ │              │ │       │ │                   │  │
│ │ • User   │ │ • Zone track │ │ • MP3 │ │ • Nearby pins     │  │
│ │   dot    │ │ • Auto-trig  │ │  strm │ │ • Virtual city    │  │
│ │ • Comm.  │ │ • Manual     │ │  from │ │   grid            │  │
│ │   pins   │ │   trigger    │ │  R2   │ │ • Rating/comments │  │
│ │ • No     │ │ • Skip logic │ │ • BG  │ │ • Walk / Listen   │  │
│ │   route  │ │ • Visit dedup│ │  audio│ │   replay modes    │  │
│ └────┬─────┘ └──────┬───────┘ └───┬───┘ └────────┬──────────┘  │
│      │              │             │               │             │
└──────┼──────────────┼─────────────┼───────────────┼─────────────┘
       │              │             │               │
       ▼              ▼             ▼               ▼
┌─────────────────────────────────────────────────────────────────┐
│                SUPABASE (Backend-as-a-Service)                  │
│                                                                 │
│ ┌───────────┐  ┌───────────┐  ┌───────────────────────────────┐ │
│ │   Auth    │  │ Postgres  │  │      Edge Functions           │ │
│ │           │  │ + PostGIS │  │                               │ │
│ │ • Email   │  │           │  │ ┌───────────────────────────┐ │ │
│ │ • Google  │  │ • users   │  │ │ /narrate-block            │ │ │
│ │   OAuth   │  │ • tours   │  │ │                           │ │ │
│ └───────────┘  │ • blocks  │  │ │ 1. Receive lat/lng + mood │ │ │
│                │ • ratings │  │ │ 2. Reverse geocode        │ │ │
│ ┌───────────┐  │ • comments│  │ │ 3. Check narration cache  │ │ │
│ │ Storage   │  │ • zone_   │  │ │ 4. Check zone data cache  │ │ │
│ │ (Supa)    │  │   data_   │  │ │ 5. Query ALL 19 sources   │ │ │
│ │ • Avatars │  │   cache   │  │ │    (parallel)             │ │ │
│ └───────────┘  │ • narr_   │  │ │ 6. Gemini curates + web   │ │ │
│                │   cache   │  │ │    search grounding       │ │ │
│ ┌───────────┐  │ • audio_  │  │ │ 7. Google TTS → MP3       │ │ │
│ │Cloudflare │  │   files   │  │ │ 8. Upload MP3 to R2       │ │ │
│ │    R2     │  │ • virtual │  │ │ 9. Cache both layers      │ │ │
│ │ • Tour    │  │   _cities │  │ │10. Return narration +     │ │ │
│ │   audio   │  │           │  │ │    signed audio URL       │ │ │
│ │   MP3s    │  │           │  │ │                           │ │ │
│ │ • 10GB    │  │           │  │ │                           │ │ │
│ │   free    │  │           │  │ │                           │ │ │
│ └───────────┘  │           │  │ │                           │ │ │
│                               │ └───────────────────────────┘ │ │
│                               │ ┌───────────────────────────┐ │ │
│                               │ │ /nearby-tours             │ │ │
│                               │ │ PostGIS geo query         │ │ │
│                               │ └───────────────────────────┘ │ │
│                               │ ┌───────────────────────────┐ │ │
│                               │ │ /virtual-tour-step        │ │ │
│                               │ │ Same as narrate-block but │ │ │
│                               │ │ for virtual city streets  │ │ │
│                               │ └───────────────────────────┘ │ │
│                               └───────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌──────────────────────────────────────────┐
              │          External APIs (All Free)          │
              │                                            │
              │  GEOCODING:                                │
              │  • Nominatim (reverse geocode, free)       │
              │                                            │
              │  AI ENGINE:                                │
              │  • Gemini 2.5 Flash + Google Search        │
              │    Grounding (500 RPD free tier)            │
              │                                            │
              │  CITY OPEN DATA (SF pilot — 15+ datasets): │
              │  • DataSF / SODA API (free, no key)        │
              │    Film locations, historic landmarks,      │
              │    cultural districts, 1906 fire zones,     │
              │    building permits, registered businesses, │
              │    police incidents, street trees,          │
              │    public art, 311 complaints, evictions,   │
              │    parks & rec, civic landscape,            │
              │    active addresses                         │
              │                                            │
              │  GLOBAL SOURCES (any city worldwide):       │
              │  • Wikipedia Geosearch API (free)           │
              │  • Wikimedia Commons API (free)             │
              │  • OpenStreetMap / Overpass API (free)      │
              │  • Google Knowledge Graph (100k/day free)   │
              │                                            │
              │  MAPS & TTS:                               │
              │  • Mapbox (50k map loads/mo free)           │
              │  • Google Cloud TTS (1M chars/mo free,      │
              │    neural WaveNet/Journey voices)            │
              │  • Edge TTS / Microsoft (free fallback,     │
              │    unlimited, neural quality)                │
              │                                            │
              │  AUDIO STORAGE:                             │
              │  • Cloudflare R2 (10GB free, $0 egress,    │
              │    S3-compatible API)                        │
              └──────────────────────────────────────────┘
```

### The Narration Pipeline (Core Innovation)

**Philosophy: Query everything. Cache the raw bundle. Let the AI curate per mood.**

The pipeline has TWO cache layers:
- **Layer 1 — Zone Data Cache**: Raw data from ALL sources for a geographic zone. Mood-agnostic. Queried once, shared across all moods.
- **Layer 2 — Narration Cache**: The AI-generated narration for a specific zone + mood + safety combo. Generated per mood from the cached raw data.

```
USER'S GPS COORDINATES
        │
        ▼
┌──────────────────────┐
│  1. REVERSE GEOCODE   │  Nominatim (free, no key)
│  lat/lng → street,    │  → "710 Ashbury St, Haight-Ashbury, San Francisco, CA"
│  neighborhood, city   │
└─────────┬────────────┘
          │
          ▼
┌──────────────────────┐
│  2. CHECK NARRATION   │  narration_cache table
│     CACHE             │  Key: geo_hash + mood + content_safety
│                       │  → HIT? Return cached narration (skip everything)
│                       │  → MISS? Continue to step 3
└─────────┬────────────┘
          │
          ▼
┌──────────────────────┐
│  3. CHECK ZONE DATA   │  zone_data_cache table
│     CACHE             │  Key: geo_hash (mood-agnostic!)
│                       │  → HIT? Skip to step 5 (data already collected)
│                       │  → MISS? Continue to step 4
└─────────┬────────────┘
          │
          ▼
┌────────────────────────────────────────────────────────────┐
│  4. QUERY ALL DATA SOURCES (parallel, ~2-4 seconds)        │
│                                                            │
│  ┌─── CITY OPEN DATA (DataSF SODA API — SF pilot) ──────┐ │
│  │                                                        │ │
│  │  All queries use lat/lng proximity (~200m radius):     │ │
│  │                                                        │ │
│  │  • Film Locations ─────── movies filmed on this block  │ │
│  │  • Historic Districts ─── is this in a historic zone?  │ │
│  │  • Historic Landmarks ─── designated landmarks nearby  │ │
│  │  • Cultural Districts ─── cultural significance        │ │
│  │  • 1906 Earthquake ────── did this area burn in 1906?  │ │
│  │  • Building Permits ───── when built, major renos      │ │
│  │  • Registered Business ── what's been here over years  │ │
│  │  • Police Incidents ───── notable crimes nearby        │ │
│  │  • Street Trees ──────── species, planting date, age   │ │
│  │  • Public Art ─────────── murals, sculptures, installs │ │
│  │  • 311 Complaints ─────── bizarre neighbor complaints  │ │
│  │  • Eviction Data ─────── displacement stories          │ │
│  │  • Parks & Rec ────────── hidden parks, green spaces   │ │
│  │  • Civic Landscape ────── landscape features           │ │
│  │  • Active Addresses ───── what exists at every address │ │
│  │                                                        │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                            │
│  ┌─── GLOBAL SOURCES (work in ANY city) ─────────────────┐ │
│  │                                                        │ │
│  │  • Wikipedia Geosearch ── articles within 200m         │ │
│  │  • Wikimedia Commons ──── historical photos nearby     │ │
│  │  • OpenStreetMap ─────── building age, style, old name │ │
│  │  • Google Knowledge ───── entity enrichment (100k/day) │ │
│  │    Graph API                                           │ │
│  │                                                        │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                            │
│  All results bundled into a single JSON blob:              │
│  {                                                         │
│    "films": [...],                                         │
│    "landmarks": [...],                                     │
│    "crimes": [...],                                        │
│    "businesses": [...],                                    │
│    "trees": [...],                                         │
│    "art": [...],                                           │
│    "complaints_311": [...],                                │
│    "earthquake_zone": true/false,                          │
│    "cultural_district": "Haight-Ashbury Counterculture",   │
│    "wikipedia_articles": [...],                            │
│    "historical_photos": [...],                             │
│    "osm_buildings": [...],                                 │
│    "knowledge_graph_entities": [...],                      │
│    ...                                                     │
│  }                                                         │
│                                                            │
│  → Store in zone_data_cache (expires in 30 days)           │
└─────────────────────┬──────────────────────────────────────┘
                      │
                      ▼
┌────────────────────────────────────────────────────────────┐
│  5. GEMINI 2.5 FLASH + GOOGLE SEARCH GROUNDING             │
│                                                            │
│  SYSTEM PROMPT:                                            │
│  "You are a world-class {mood} tour guide. The user is     │
│  standing at {street}, {neighborhood}, {city}.              │
│                                                            │
│  Content safety: {ON → graphic history allowed |           │
│                   OFF → keep family-friendly, PG}          │
│                                                            │
│  Below is EVERYTHING we know about this location from      │
│  public records, historical databases, and open data.      │
│  YOUR JOB: curate the most compelling story from this      │
│  data. You don't need to use everything — pick the         │
│  pieces that create the best narration for a {mood} tour.  │
│  Weave connections between facts when possible.            │
│                                                            │
│  === RAW ZONE DATA ===                                     │
│  {entire zone_data_cache JSON blob}                        │
│                                                            │
│  === INSTRUCTIONS ===                                      │
│  Using the data above PLUS Google Search for anything      │
│  additional, generate a 60-90 second spoken narration.     │
│                                                            │
│  For INFORMATIVE: prioritize verified facts, architecture, │
│  historical significance. Be educational and fascinating.  │
│                                                            │
│  For HAUNTED: find the darkest, eeriest angles. Unsolved   │
│  crimes, mysterious deaths, ghost stories, eerie history.  │
│  Build suspense. Make them look over their shoulder.       │
│                                                            │
│  For CELEBRITY: who famous lived, worked, filmed, ate,     │
│  performed here? Name-drop. Make it glamorous or scandalous│
│                                                            │
│  For CURIOSITIES: find the weirdest, most unexpected       │
│  facts. Strange 311 complaints, unusual trees, hidden art, │
│  bizarre business history, architectural oddities.         │
│                                                            │
│  End with a teaser that hints at what might be interesting │
│  on the next block to keep the user walking."              │
│                                                            │
│  → Gemini also searches the web for additional context     │
│    beyond the provided data                                │
└─────────────────────┬──────────────────────────────────────┘
                      │
                      ▼
┌──────────────────────┐
│  6. CACHE + RETURN    │
│                       │  Store narration in narration_cache
│  narration_cache key: │  (geo_hash + mood + content_safety)
│  geo_hash + mood +    │
│  content_safety       │  Next user, SAME zone, SAME mood:
│                       │  → instant cache hit (step 2)
│  Return to client     │
│  Client → TTS →       │  Next user, SAME zone, DIFFERENT mood:
│  Audio playback       │  → zone data cache hit (step 3)
│                       │  → only Gemini call needed (step 5)
└──────────────────────┘

                      │
                      ▼
┌────────────────────────────────────────────────────────────┐
│  7. GENERATE AUDIO (Google Cloud TTS)                       │
│                                                            │
│  • Send narration_text to Google Cloud TTS API             │
│  • Voice selection based on user preference:               │
│    - "neutral" → en-US-Journey-D (calm, measured)          │
│    - "dramatic" → en-US-Journey-F (deeper, suspenseful)    │
│    - "warm"    → en-US-Journey-O (friendly, enthusiastic)  │
│  • Output: MP3 file (~1.5MB per 90-second narration)       │
│                                                            │
│  Fallback: If Google TTS fails → Edge TTS (Microsoft)      │
│  Emergency fallback: expo-speech (device-native, no MP3)   │
└─────────────────────┬──────────────────────────────────────┘
                      │
                      ▼
┌────────────────────────────────────────────────────────────┐
│  8. UPLOAD + STORE AUDIO (Cloudflare R2)                    │
│                                                            │
│  • Upload MP3 to R2 bucket: wandervox-audio                │
│  • Key pattern: audio/{geo_hash}/{mood}/{safety}/{voice}.mp3│
│  • Generate signed URL (1-hour expiry, auth required)      │
│  • Store audio_url in narration_cache row                  │
│                                                            │
│  Cache economics for audio:                                │
│  • Same zone + mood + safety + voice = same MP3            │
│  • ~1.5MB per narration × 4 moods × 2 safety × 3 voices   │
│    = ~36MB max per zone (but most zones won't have all 24) │
│  • 10GB free = ~280 fully-saturated zones or ~6,600+       │
│    individual narrations                                   │
└─────────────────────┬──────────────────────────────────────┘
                      │
                      ▼
┌──────────────────────┐
│  9. RETURN TO CLIENT  │
│                       │
│  Response includes:   │
│  • narration_text     │
│  • audio_url (signed) │
│  • zone_data_used     │
│  • cached: true/false │
│                       │
│  Client streams MP3   │
│  from R2 signed URL   │
└──────────────────────┘
```

### Cache Economics

This multi-layer cache is what makes the $0 budget work:

| Scenario | API Calls | Latency |
|---|---|---|
| **First user, new zone, first mood, first voice** | Reverse geocode + 15 DataSF + 4 global + Gemini + Google TTS + R2 upload = ~23 calls | ~8-12 seconds |
| **Second user, same zone, same mood, same voice** | 0 API calls (narration cache hit + existing audio URL) | ~200ms |
| **Same zone, different mood** | Gemini + Google TTS + R2 upload = 3 calls (zone data cached) | ~4-6 seconds |
| **Same zone, same mood, different voice** | Google TTS + R2 upload = 2 calls (narration text cached) | ~2-3 seconds |
| **Same zone, same mood, same voice, different safety** | Gemini + Google TTS + R2 upload = 3 calls | ~4-6 seconds |

After a zone is "warmed up" by the first visitor, every subsequent visitor with the same combo gets near-instant audio. Popular tourist areas will be fully cached within days of launch.

### Stack Rationale

| Layer | Choice | Why |
|---|---|---|
| **Frontend** | React Native + Expo | Single codebase, iOS + Android, free, huge ecosystem. Expo Go for instant testing. |
| **Maps** | Mapbox GL | Free tier: 50k loads/mo. Custom styling for mood themes (dark map for haunted, etc.). |
| **Backend** | Supabase | Free tier: Auth, Postgres, Edge Functions, Storage, Realtime. Zero server management. |
| **Database** | Supabase Postgres + PostGIS | PostGIS for geospatial queries. Critical for "nearby tours" and zone detection. |
| **Auth** | Supabase Auth | Built-in email + Google OAuth. JWT tokens. Zero custom auth code. |
| **AI/LLM** | Gemini 2.5 Flash + Google Search Grounding | 500 grounded searches/day free. The search grounding IS the data source — Gemini searches the web itself for location context. |
| **City Data** | DataSF SODA API (SF pilot) — ALL 15+ datasets | Free, no key needed. Query everything per zone, cache raw bundle, let AI curate. Expands to other city portals later. |
| **Global Data** | Wikipedia Geosearch + Wikimedia Commons + Overpass (OSM) + Google Knowledge Graph | All free. Provide context in ANY city worldwide, not just DataSF-supported ones. |
| **Reverse Geocode** | Nominatim (OpenStreetMap) | Free, no API key, no rate limit concerns for MVP. Converts lat/lng → street address. |
| **TTS** | Google Cloud TTS (primary) + Edge TTS (fallback) | Google: 1M chars/month free, high-quality neural voices (WaveNet/Journey). Server-side generation → consistent audio quality across all devices. Edge TTS: free unlimited fallback if Google quota exhausted. |
| **Audio Storage** | Cloudflare R2 | 10GB free, zero egress fees (critical for streaming audio to many users). S3-compatible API. Signed URLs for auth-only access. |
| **Deep Links** | Expo Linking + app.links config | Universal Links (iOS) + App Links (Android). Falls back to app store if not installed. No web preview page for MVP. |
| **Deployment** | Expo EAS Build | Free tier for development builds. TestFlight (iOS) + internal testing track (Android). |

---

## E) Data Model

### Tables

#### `users`
| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | Supabase auth.users FK |
| email | text | unique |
| display_name | text | |
| avatar_url | text | nullable, Supabase Storage URL |
| preferred_voice | text | default: 'neutral'. Enum: 'neutral', 'dramatic', 'warm' |
| content_safety | boolean | default: false (family-friendly). true = mature content allowed |
| anonymous_default | boolean | default: false. If true, tours post anonymously by default |
| created_at | timestamptz | default: now() |

#### `tours`
| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| creator_id | uuid (FK → users) | |
| title | text | AI-generated based on neighborhoods visited. User can edit. |
| mood | text | enum: 'informative', 'haunted', 'celebrity', 'curiosities' |
| tour_type | text | enum: 'walking', 'virtual' |
| city | text | reverse-geocoded or selected (virtual) |
| center_lat | float8 | geographic center of the tour |
| center_lng | float8 | |
| location | geography(Point) | PostGIS — for geo queries |
| total_distance_m | int | walking tours only, null for virtual |
| duration_sec | int | actual duration of tour session |
| blocks_visited | int | number of narration zones triggered |
| is_public | boolean | default: true |
| is_anonymous | boolean | default: false. If true, creator not shown publicly |
| content_safety_on | boolean | whether mature content was enabled during this tour |
| share_code | text | nullable, unique. Short code for deep link (e.g., 'a1b2c3'). Generated on first share. |
| avg_rating | float4 | denormalized, updated via trigger |
| rating_count | int | denormalized |
| created_at | timestamptz | |

#### `tour_blocks` (narration segments within a tour)
| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| tour_id | uuid (FK → tours) | |
| sequence | int | order visited |
| street_name | text | "710 Ashbury St" |
| neighborhood | text | "Haight-Ashbury" |
| lat | float8 | |
| lng | float8 | |
| narration_text | text | AI-generated script for this block |
| audio_r2_key | text | R2 object key for the MP3 file used during this block |
| voice | text | which voice preset was used: 'neutral', 'dramatic', 'warm' |
| mood | text | mood at time of generation |
| trigger_type | text | enum: 'auto', 'manual' — how this narration was triggered |
| created_at | timestamptz | |

#### `zone_data_cache` (Layer 1 — raw data per zone, mood-agnostic)
| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| geo_hash | text | unique. Geohash precision 7 (~150m zones) |
| street_name | text | primary street from reverse geocode |
| neighborhood | text | |
| city | text | |
| country | text | |
| raw_data | jsonb | **ALL data from ALL sources**, structured as: `{ films: [], landmarks: [], crimes: [], businesses: [], trees: [], art: [], complaints_311: [], earthquake_zone: bool, cultural_district: str, evictions: [], building_permits: [], parks: [], wikipedia: [], wikimedia_photos: [], osm_buildings: [], knowledge_graph: [] }` |
| sources_queried | text[] | array of source names that were successfully queried |
| sources_failed | text[] | array of source names that timed out or errored (for monitoring) |
| created_at | timestamptz | |
| expires_at | timestamptz | created_at + 30 days |

#### `narration_cache` (Layer 2 — AI-generated narration per zone + mood + safety)
| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| geo_hash | text | FK-like reference to zone_data_cache.geo_hash |
| mood | text | enum: 'informative', 'haunted', 'celebrity', 'curiosities' |
| content_safety | boolean | was mature content on? |
| narration_text | text | AI-generated narration script |
| data_highlights | jsonb | which pieces from zone data the AI chose to use (for analytics) |
| created_at | timestamptz | |
| expires_at | timestamptz | created_at + 30 days |
| *unique constraint* | | (geo_hash, mood, content_safety) |

#### `audio_files` (Layer 3 — MP3 files on Cloudflare R2, one per narration + voice combo)
| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| narration_cache_id | uuid (FK → narration_cache) | which narration this audio belongs to |
| voice | text | enum: 'neutral', 'dramatic', 'warm' |
| r2_key | text | R2 object key: `audio/{geo_hash}/{mood}/{safety}/{voice}.mp3` |
| r2_bucket | text | default: 'wandervox-audio' |
| file_size_bytes | int | for storage monitoring (~1.5MB per 90s narration) |
| duration_ms | int | audio duration in milliseconds |
| tts_provider | text | 'google' or 'edge' — tracks which API generated this file |
| created_at | timestamptz | |
| expires_at | timestamptz | created_at + 30 days (synced with narration_cache expiry) |
| *unique constraint* | | (narration_cache_id, voice) |

#### `tour_shares` (deep link tracking for shared tours)
| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| tour_id | uuid (FK → tours) | |
| share_code | text | unique short code for deep link, e.g., 'a1b2c3' (6 chars, alphanumeric) |
| shared_by | uuid (FK → users) | who shared it |
| share_count | int | default: 0. Incremented when link is tapped. |
| created_at | timestamptz | |
| *unique constraint* | | (share_code) |

#### `content_reports` (user reports for moderation)
| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| reporter_id | uuid (FK → users) | who reported |
| target_type | text | enum: 'tour', 'comment', 'narration' |
| target_id | uuid | ID of the reported tour, comment, or narration_cache entry |
| reason | text | enum: 'inaccurate', 'offensive', 'spam', 'other' |
| detail | text | nullable, max 500 chars, free-text explanation |
| status | text | enum: 'pending', 'reviewed', 'actioned', 'dismissed'. Default: 'pending' |
| created_at | timestamptz | |
| *unique constraint* | | (reporter_id, target_type, target_id) — one report per user per item |

#### `virtual_cities` (pre-seeded for virtual tours)
| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| name | text | "San Francisco" |
| country | text | "United States" |
| hero_image_url | text | city photo for picker grid |
| description | text | short tagline |
| notable_streets | jsonb | array of {street, lat, lng, hint} for virtual tour waypoints |
| is_active | boolean | default: true |
| created_at | timestamptz | |

#### `ratings`
| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| tour_id | uuid (FK → tours) | |
| user_id | uuid (FK → users) | |
| score | int | 1–5 |
| created_at | timestamptz | |
| *unique constraint* | | (tour_id, user_id) |

#### `comments`
| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| tour_id | uuid (FK → tours) | |
| user_id | uuid (FK → users) | |
| body | text | max 500 chars |
| is_anonymous | boolean | inherits from user's anonymous_default but can be overridden |
| created_at | timestamptz | |

### Relationships

```
users            1 ──── *  tours           (user creates many tours)
tours            1 ──── *  tour_blocks     (tour has many narrated blocks, ordered)
tours            1 ──── *  ratings         (tour has many ratings)
tours            1 ──── *  comments        (tour has many comments)
tours            1 ──── *  tour_shares     (tour can be shared multiple times)
users            1 ──── *  ratings         (user gives many ratings)
users            1 ──── *  comments        (user writes many comments)
users            1 ──── *  content_reports (user can report many items)
zone_data_cache  1 ──── *  narration_cache (one zone's raw data → many mood narrations)
narration_cache  1 ──── *  audio_files     (one narration → up to 3 voice variants)
virtual_cities                              (standalone, pre-seeded reference data)
```

### Key Indexes

- `tours.location` — GiST index for PostGIS spatial queries (nearby tours).
- `tours.mood` — B-tree for filtering.
- `tours(tour_type)` — B-tree for separating walking vs virtual.
- `tours(share_code)` — unique B-tree for deep link lookups.
- `zone_data_cache(geo_hash)` — unique, the raw data cache lookup.
- `zone_data_cache(expires_at)` — for cleanup job.
- `narration_cache(geo_hash, mood, content_safety)` — unique composite, the narration cache lookup.
- `narration_cache(expires_at)` — for cleanup job.
- `audio_files(narration_cache_id, voice)` — unique composite, audio cache lookup.
- `audio_files(expires_at)` — for cleanup job (sync R2 deletion).
- `ratings(tour_id, user_id)` — unique, prevents duplicate ratings.
- `tour_blocks(tour_id, sequence)` — composite, for ordered retrieval.
- `tour_shares(share_code)` — unique, for deep link resolution.
- `content_reports(target_type, target_id)` — composite, for moderation queries.
- `content_reports(status)` — B-tree, for filtering pending reports.

---

## F) API Endpoints

### Auth (Supabase Client SDK — no custom endpoints)

```
POST   /auth/v1/signup             { email, password }  → { user, session }
POST   /auth/v1/token?grant_type=password   { email, password }  → { access_token }
POST   /auth/v1/token?grant_type=refresh    { refresh_token }    → { access_token }
POST   /auth/v1/logout             → 200
GET    /auth/v1/user               → { user }
```

### Narrate Block (Edge Function — THE core endpoint)

```
POST   /functions/v1/narrate-block
Headers: Authorization: Bearer <jwt>

Request:
{
  "lat": 37.7696,
  "lng": -122.4469,
  "mood": "haunted",
  "content_safety": true,
  "trigger_type": "auto",
  "voice": "dramatic"
}

Response (200):
{
  "narration": {
    "street_name": "710 Ashbury Street",
    "neighborhood": "Haight-Ashbury",
    "city": "San Francisco",
    "narration_text": "You're standing in front of 710 Ashbury — the house where the Grateful Dead lived from 1966 to 1968...",
    "audio_url": "https://wandervox-audio.r2.cloudflarestorage.com/audio/9q8yyk8/haunted/on/dramatic.mp3?X-Amz-Signature=...",
    "audio_duration_ms": 87000,
    "mood": "haunted",
    "content_safety_applied": true,
    "cached": false,
    "zone_data_used": {
      "sources_hit": ["film_locations", "landmarks", "police_incidents", "street_trees", "311_complaints", "cultural_districts", "wikipedia", "osm"],
      "highlights": [
        { "source": "landmark", "detail": "Grateful Dead House — California Historical Landmark" },
        { "source": "street_tree", "detail": "Monterey Cypress, planted 1967" },
        { "source": "police_incident", "detail": "Missing person report, 1967" },
        { "source": "311_complaint", "detail": "Noise complaint: 'unearthly screaming at 3am'" },
        { "source": "cultural_district", "detail": "Haight-Ashbury Counterculture District" },
        { "source": "film_location", "detail": "The Woman in Red (1984) filmed on this block" }
      ]
    }
  }
}

Error (429): { "error": "Daily narration limit reached. Try again tomorrow or start a virtual tour!" }
Error (408): { "error": "Narration generation timed out. Tap to retry." }
Error (500): { "error": "Something went wrong. Keep walking — we'll try again at the next block." }
```

### Virtual Tour Step (Edge Function)

```
POST   /functions/v1/virtual-tour-step
Headers: Authorization: Bearer <jwt>

Request:
{
  "city_id": "uuid",
  "step_index": 3,
  "mood": "celebrity",
  "content_safety": false
}

Response (200):
{
  "narration": {
    "street_name": "Lombard Street",
    "neighborhood": "Russian Hill",
    "city": "San Francisco",
    "narration_text": "Now picture yourself at the top of the world's most crooked street...",
    "mood": "celebrity",
    "step_index": 3,
    "total_steps": 12,
    "next_hint": "Next, we'll head to a waterfront spot where a certain action star filmed a legendary chase scene."
  }
}
```

### Tours (Supabase REST)

```
GET    /rest/v1/tours?id=eq.<uuid>&select=*,tour_blocks(*),ratings(score)
       → { data: Tour }                (single tour with blocks and ratings)

POST   /rest/v1/tours
       {
         title, mood, tour_type, city, center_lat, center_lng,
         total_distance_m, duration_sec, blocks_visited,
         is_public, is_anonymous, content_safety_on
       }
       → { data: Tour }

PATCH  /rest/v1/tours?id=eq.<uuid>
       { title, is_public }             (user can edit title, toggle public)
       → { data: Tour }

GET    /rest/v1/tours?creator_id=eq.<uuid>&order=created_at.desc
       → { data: Tour[] }              (my tours)
```

### Nearby Tours (RPC — PostGIS)

```
POST   /rest/v1/rpc/nearby_tours
{
  "user_lat": 37.7749,
  "user_lng": -122.4194,
  "radius_m": 5000,
  "mood_filter": null,
  "tour_type_filter": null,
  "limit_count": 20,
  "offset_count": 0
}

Response:
{
  "data": [
    {
      "id": "uuid",
      "title": "Ghosts of the Haight",
      "mood": "haunted",
      "tour_type": "walking",
      "avg_rating": 4.3,
      "rating_count": 12,
      "blocks_visited": 8,
      "duration_sec": 2400,
      "distance_m": 340,
      "is_anonymous": false,
      "creator": { "display_name": "Marie", "avatar_url": "..." },
      "content_safety_on": false
    }
  ]
}
```

### Virtual Cities

```
GET    /rest/v1/virtual_cities?is_active=eq.true&order=name.asc
       → { data: VirtualCity[] }
```

### Tour Blocks (auto-created during tour, queried for playback)

```
POST   /rest/v1/tour_blocks
       { tour_id, sequence, street_name, neighborhood, lat, lng, narration_text, mood, trigger_type }
       → { data: TourBlock }

GET    /rest/v1/tour_blocks?tour_id=eq.<uuid>&order=sequence.asc
       → { data: TourBlock[] }
```

### Ratings

```
POST   /rest/v1/ratings
       { tour_id, score }              → { data: Rating }
       (DB trigger recalculates tours.avg_rating & rating_count)

GET    /rest/v1/ratings?tour_id=eq.<uuid>&user_id=eq.<uuid>
       → { data: Rating | null }       (check if already rated)
```

### Comments

```
GET    /rest/v1/comments?tour_id=eq.<uuid>&order=created_at.desc&limit=20&offset=0
       → { data: Comment[] }           (includes creator info unless anonymous)

POST   /rest/v1/comments
       { tour_id, body, is_anonymous }  → { data: Comment }

DELETE /rest/v1/comments?id=eq.<uuid>
       → 204                           (only own comments, RLS enforced)
```

### User Profile

```
PATCH  /rest/v1/users?id=eq.<uuid>
       { display_name, avatar_url, preferred_voice, content_safety, anonymous_default }
       → { data: User }

DELETE /rest/v1/users?id=eq.<uuid>
       → 204                           (cascading delete: tours, blocks, ratings, comments, reports, shares)
```

### Tour Sharing (Edge Function)

```
POST   /functions/v1/share-tour
Headers: Authorization: Bearer <jwt>

Request:
{
  "tour_id": "uuid"
}

Response (200):
{
  "share_url": "https://wandervox.app/t/a1b2c3",
  "share_code": "a1b2c3"
}

Logic:
1. Check if tour already has a share_code → return existing
2. Generate unique 6-char alphanumeric code
3. Insert into tour_shares table
4. Update tours.share_code
5. Return deep link URL
```

### Deep Link Resolution (Edge Function)

```
GET    /functions/v1/resolve-link?code=a1b2c3
Headers: Authorization: Bearer <jwt>

Response (200):
{
  "tour_id": "uuid",
  "title": "Ghosts of the Haight",
  "mood": "haunted",
  "blocks_count": 8,
  "creator": { "display_name": "Marie" },
  "avg_rating": 4.3
}

Logic:
1. Lookup share_code in tour_shares
2. Increment share_count
3. Return tour metadata for app to navigate to Tour Detail screen
```

### Tour Replay — Audio URLs (Edge Function)

```
POST   /functions/v1/replay-tour
Headers: Authorization: Bearer <jwt>

Request:
{
  "tour_id": "uuid",
  "voice": "dramatic",
  "mode": "walk" | "listen"
}

Response (200):
{
  "tour": {
    "id": "uuid",
    "title": "Ghosts of the Haight",
    "mood": "haunted",
    "blocks": [
      {
        "sequence": 1,
        "street_name": "710 Ashbury Street",
        "neighborhood": "Haight-Ashbury",
        "lat": 37.7696,
        "lng": -122.4469,
        "narration_text": "You're standing in front of 710 Ashbury...",
        "audio_url": "https://...signed-r2-url...",
        "audio_duration_ms": 87000
      },
      ...
    ]
  },
  "mode": "walk" | "listen"
}

Logic:
1. Fetch tour + tour_blocks (ordered by sequence)
2. For each block, lookup audio_files by (narration_cache geo_hash match + voice)
3. If audio exists → generate signed R2 URL (1-hour expiry)
4. If audio missing → generate on-the-fly (Google TTS → R2 → signed URL)
5. "walk" mode: client uses GPS to trigger blocks at locations
6. "listen" mode: client plays blocks sequentially like a podcast
```

### Content Reports

```
POST   /rest/v1/content_reports
       { target_type, target_id, reason, detail }
       → { data: ContentReport }

GET    /rest/v1/content_reports?status=eq.pending&order=created_at.asc
       → { data: ContentReport[] }       (admin only — future admin panel)
```

---

## G) Dev Plan — Vertical Slices + Checklist

### Milestone 1: Foundation + First Narration (Week 1)
*Goal: User can sign up, see a map, and hear ONE AI narration about their current location.*

**This is the "magic moment" milestone — if this works, the product works.**

- [ ] Initialize Expo project with TypeScript + folder structure
- [ ] Set up Supabase project (staging) + enable PostGIS extension
- [ ] Create all DB tables + RLS policies + indexes (run migrations)
- [ ] Configure Supabase Auth (email + Google OAuth)
- [ ] Obtain Gemini API key (free tier) + test Search Grounding in playground
- [ ] Set up Google Cloud TTS API (enable API, get credentials, verify free tier)
- [ ] Set up Cloudflare R2 bucket ('wandervox-audio') + generate API tokens
- [ ] Configure environment variables (see Environment & Secrets section below)
- [ ] Build Splash + Onboarding screens (3 panels, static)
- [ ] Build Sign Up / Login screen (email + Google)
- [ ] Build Home screen with Mapbox, centered on user GPS location
- [ ] Request + handle location permissions (happy path + denied → virtual tour fallback)
- [ ] Build Edge Function: `/narrate-block` — reverse geocode + Gemini + search grounding + Google TTS + R2 upload
- [ ] Build Mood Selector bottom sheet (4 moods)
- [ ] Build Voice Selector (3 presets with preview)
- [ ] Wire it together: Tap "Start Tour" → pick mood → pick voice → call `/narrate-block` → stream MP3 audio from R2
- [ ] Implement audio player: play/pause, background playback when phone locked
- [ ] **DEMO TEST**: Sign up → tap Start → select Haunted + Dramatic voice → hear high-quality AI narration of your current street streaming from the cloud. If this makes you smile, Milestone 1 is done.

### Milestone 2: Walking Tour Engine (Week 2)
*Goal: Full walking tour experience — auto-triggers, manual triggers, dedup, open-ended.*

- [ ] Implement geohash-based zone tracking (precision 7, ~150m zones)
- [ ] Auto-trigger narration when user enters a new zone (background GPS watcher)
- [ ] "Tell me about here" manual trigger button
- [ ] "Skip" button to dismiss current narration and wait for next zone
- [ ] Zone visit dedup: don't re-trigger same zone in same session
- [ ] Build Active Tour screen: map + narration card + audio controls (play/pause/skip)
- [ ] Background audio: narration continues when phone is locked
- [ ] Implement narration cache: check `narration_cache` table before calling Gemini
- [ ] Cache new narrations after generation (geo_hash + mood + content_safety)
- [ ] Build `tour_blocks` recording: save each narrated block to DB as user walks
- [ ] Build Tour Complete screen: stats (blocks, distance, duration) + "End Tour" button
- [ ] Content safety toggle: add to Settings, pass to `/narrate-block`, affect prompt
- [ ] **TEST**: Walk for 15+ minutes, hear multiple auto-triggered narrations, use manual trigger, end tour, see stats.

### Milestone 3: Full Data Layer + Virtual Tours (Week 3)
*Goal: Query ALL data sources per zone. SF pilot with 15+ DataSF datasets + 4 global sources. Virtual tours working.*

- [ ] Build `zone_data_cache` table + indexes
- [ ] Build data fetcher module: parallel async queries to all sources
- [ ] Integrate DataSF SODA API datasets (all queried per zone):
  - [ ] Film Locations (query by lat/lng proximity)
  - [ ] Historic Districts & Landmarks
  - [ ] Cultural Districts
  - [ ] 1906 Earthquake Fire Zones (geo boundary check)
  - [ ] Building Permits (by address)
  - [ ] Registered Businesses — historical (by address)
  - [ ] Police Incident Reports (by lat/lng proximity)
  - [ ] Street Trees (by lat/lng proximity)
  - [ ] Public Art Installations
  - [ ] 311 Complaints (by lat/lng proximity)
  - [ ] Eviction Data (by address/area)
  - [ ] Parks & Rec Properties
  - [ ] Civic Center Landscape features
  - [ ] Active Addresses
- [ ] Integrate global sources (work in any city):
  - [ ] Wikipedia Geosearch API (articles within 200m)
  - [ ] Wikimedia Commons API (historical photos near coordinates)
  - [ ] OpenStreetMap / Overpass API (building metadata)
  - [ ] Google Knowledge Graph API (entity enrichment)
- [ ] Bundle all results into zone_data_cache JSON blob
- [ ] Update `/narrate-block` Edge Function: two-layer cache logic (check narration → check zone data → query sources → Gemini)
- [ ] Feed full zone data blob to Gemini prompt; let AI curate per mood
- [ ] Implement graceful degradation: if 5 of 19 sources fail, still generate narration from remaining 14
- [ ] Log sources_queried and sources_failed for monitoring
- [ ] Build `virtual_cities` table + seed 10 cities with notable_streets waypoints
- [ ] Build City Picker screen (grid with hero images)
- [ ] Build Edge Function: `/virtual-tour-step`
- [ ] Build Active Tour (Virtual) screen: map + "Next Block" button + narration
- [ ] **TEST**: Take a walking tour in SF → hear narration that weaves together film locations, tree facts, crime data, building history. Same block, switch mood → completely different narration from same underlying data. Take a virtual tour of Paris from couch.

### Milestone 4: Community Layer + Sharing (Week 4)
*Goal: Share via deep links, discover tours, rate, comment, replay in walk or listen mode.*

- [ ] Save tour to DB on completion (with all tour_blocks including audio_r2_key)
- [ ] Build "Save & Share" flow on Tour Complete screen
- [ ] Anonymous toggle: "Post as [name]" or "Post as Anonymous Explorer"
- [ ] Build Edge Function: `/share-tour` — generate unique 6-char share code + deep link URL
- [ ] Configure Expo universal links (iOS) + app links (Android) for `wandervox.app/t/{code}`
- [ ] Build Edge Function: `/resolve-link` — share code → tour metadata
- [ ] Deep link handling: app receives link → resolve → navigate to Tour Detail screen
- [ ] App store fallback: if app not installed, link redirects to app store listing
- [ ] Build Tour Detail screen (community view): map of blocks, narration previews, mood badge
- [ ] Build Edge Function: `/replay-tour` — fetch blocks + generate signed R2 audio URLs
- [ ] "Walk This Tour" button: GPS-guided replay at real locations with original narrations
- [ ] "Listen From Anywhere" button: podcast-style sequential playback, no GPS required
- [ ] Audio player for replay: play/pause, skip block, progress bar, background playback
- [ ] Build rating widget (tap stars + submit, one per user per tour)
- [ ] DB trigger: auto-recalculate avg_rating + rating_count on ratings insert
- [ ] Build comments section (list + input + anonymous toggle per comment)
- [ ] Build content_reports table + report button on tours, comments, and narrations
- [ ] Build `nearby_tours` RPC function (PostGIS ST_DWithin)
- [ ] Build Discover screen: map + list toggle, sort by rating/distance/newest, filter by mood
- [ ] Build My Tours (Profile) screen
- [ ] Content safety badge: show on tour cards if content_safety was ON
- [ ] **TEST**: Complete tour → save → share deep link → open link on second device → see Tour Detail → tap "Listen From Anywhere" → hear full tour as podcast. Rate + comment. Browse Discover tab. Report a comment.

### Milestone 5: Polish + Security + Launch Prep (Week 5)
*Goal: App is stable, secure, handles all edge cases, ready for TestFlight/internal testing.*

**Edge Cases & Error Handling:**
- [ ] Implement ALL empty/loading/error states (see States table above)
- [ ] Standardized error response format: `{ error: string, code: string, retry: boolean }`
- [ ] Handle offline gracefully: queue, alerts, disable virtual tours
- [ ] Handle GPS signal lost (indoors/underground)
- [ ] Handle user stationary for 5+ min (gentle nudge)
- [ ] Handle LLM timeout/failure (retry once → fallback message → keep tour alive)
- [ ] Handle Google TTS failure → Edge TTS fallback → expo-speech emergency fallback
- [ ] Handle R2 upload failure (retry once → serve narration text-only)
- [ ] Handle thin-data areas (short narration, graceful messaging)

**Security Hardening:**
- [ ] Verify ALL RLS policies (test each: can user X read/write user Y's data? Should be NO)
- [ ] Verify Edge Functions reject unauthenticated requests (401)
- [ ] Verify service role key is NOT in client bundle (grep codebase)
- [ ] Verify Zod validation on ALL Edge Function inputs (fuzz test with bad data)
- [ ] Verify R2 bucket is private (try accessing audio URL without signature → should 403)
- [ ] Verify signed URL expiry works (1-hour old URL → should 403)
- [ ] Verify rate limiting works (send 6 narration requests in 1 minute → 6th should 429)
- [ ] Verify anonymous tours don't leak creator_id through API response
- [ ] Verify Delete Account cascading delete removes all user data
- [ ] Verify content safety toggle: safe prompt NEVER generates graphic content
- [ ] Test prompt injection: send weird lat/lng values, verify no prompt leak
- [ ] Sanitize all user text input (comments, display names): strip HTML, enforce length

**Content & Compliance:**
- [ ] Settings screen: voice default, content safety toggle, anonymous default, logout, delete account
- [ ] Rate limiting: implement narration_rate_limits tracking table
- [ ] Content reporting: report buttons on tours, comments, narrations → content_reports table
- [ ] Auto-hide content after 3 reports (DB trigger)
- [ ] Privacy Policy page (in-app webview or link)
- [ ] Terms of Service page
- [ ] AI-generated content disclaimer on every narration card

**Launch Prep:**
- [ ] App icon + splash screen branding
- [ ] Performance: lazy loading, reduce re-renders, optimize Mapbox tiles
- [ ] Seed 20+ community tours across 5 cities (run tours yourself or generate)
- [ ] Build EAS development builds for iOS + Android
- [ ] Full QA pass on physical devices: 2 iOS + 2 Android
- [ ] Submit to TestFlight + Google internal testing track
- [ ] **LAUNCH GATE**: 5 real users complete tours without crashes. Security checklist all green. At least one says "this is cool."

### Testing Plan

| Level | Tool | Coverage |
|---|---|---|
| **Unit Tests** | Jest | Geohash calculation, zone dedup logic, cache key generation, content safety prompt switching, mood→prompt mapping. |
| **Integration Tests** | Jest + MSW (mock service worker) | Auth flow, `/narrate-block` pipeline (mock Gemini + Nominatim), rating submission + avg recalculation, cache hit/miss paths. |
| **E2E / QA** | Manual on physical devices | All 10 user stories. GPS simulation for walking tours (Xcode simulator location, Android mock location). Real walking test in SF. |
| **Edge Case QA** | Manual | Permission denied, no internet, LLM timeout, empty data area, rapid "Tell me about here" tapping, background audio, content safety toggle mid-tour. |
| **Performance** | Manual + Expo Performance Monitor | Time from "Start Tour" to first narration audio (<8 seconds target). Zone transition narration latency (<5 seconds). Map rendering smoothness. |

---

## H) Risks + Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | **Gemini free tier limit (500 grounded/day)** | High | High — tours can't generate after limit | Aggressive caching (same zone + mood = cache hit for ALL users). 500/day serves ~50-100 unique tours if caching works. Monitor daily; upgrade to paid ($35/1k) when traction justifies it. |
| 2 | **AI generates inaccurate claims about real places** | Medium | High — trust damage, potential liability | System prompt: "Only state facts you can verify via search. Clearly label legends and rumors as such." User report button on every narration. Disclaimer in app: "AI-generated content — verify important claims." |
| 3 | **Content safety toggle fails — inappropriate content shown to underage users** | Low | Very High — legal/reputation risk | Default to OFF (family-friendly). Require explicit toggle in Settings, not per-tour. Age confirmation when enabling. Dual prompt paths: safe prompt never mentions violence/graphic content. |
| 4 | **GPS inaccuracy in urban canyons** | High | Medium — wrong narration for wrong block | Use geohash precision 7 (~150m zones) — forgiving enough for GPS drift. "Tell me about here" manual trigger as escape hatch. Narrations reference neighborhood broadly, not just exact address. |
| 5 | **Narration quality varies wildly between locations** | Medium | Medium — inconsistent UX | Cache and human-review the best narrations. Seed tours in data-rich cities first. Thin-data fallback: shorter narration + "This area is less documented — you're an explorer!" framing. |
| 6 | **Supabase free tier limits** | Medium | Medium — service disruption | Free tier: 500MB DB, 1GB storage, 50k auth MAU, 500k Edge Function invocations. Narration cache keeps DB lean. Monitor via Supabase dashboard weekly. Pro plan ($25/mo) if needed. |
| 7 | **App Store rejection** | Low | High — blocks launch | Follow Apple/Google guidelines from day 1. Location permission justification strings. Content safety controls present. Privacy policy + Terms required. No web-only fallback views. |
| 8 | **TTS quality or downtime** | Low | Medium — degraded UX | Google Cloud TTS neural voices are high quality. Three-tier fallback: Google TTS → Edge TTS → expo-speech (device-native). Audio cached on R2 — most users hear pre-generated audio, not live TTS. |
| 9 | **Low community content at launch** | High | Medium — empty Discover tab | Seed 20+ tours across 5 cities before launch. "Be the first!" CTAs. Focus marketing on 2-3 cities initially. Virtual tours always available regardless of community content. |
| 10 | **User safety while walking** | Low | Very High — liability | Safety disclaimer in onboarding: "Stay aware of your surroundings." Audio-only design (no need to look at screen). Consider: pause narration at intersections (v2). Terms of Service: not liable for accidents. |
| 11 | **Nominatim rate limits / downtime** | Low | Medium — can't reverse geocode | Self-imposed rate limit: 1 request/second. Cache reverse geocode results in `narration_cache`. Fallback: use Mapbox reverse geocode (free tier includes this). |
| 12 | **DataSF API downtime or data gaps** | Low | Low — enrichment fails, core still works | City data is enrichment, not critical path. If DataSF is down, Gemini still generates from its own knowledge + web search. Cache city data results for 30 days. |

### Security

#### Authentication & Authorization

| Concern | Implementation |
|---|---|
| **Authentication** | Supabase Auth: JWT tokens (access + refresh), refresh token rotation, secure session management. Tokens stored in secure storage (expo-secure-store), never in AsyncStorage. |
| **Authorization** | Row Level Security (RLS) on ALL tables. Policies defined below. |
| **API Protection** | ALL Edge Functions validate JWT on every request. Reject unauthenticated calls with 401. Extract user_id from JWT claims — never trust client-provided user_id. |
| **Service Role Key** | Used ONLY in Edge Functions (server-side). Never exposed to client. Stored as Supabase Edge Function secret. |

#### Row Level Security (RLS) Policies

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| **users** | Own row only: `auth.uid() = id` | Supabase Auth handles creation | Own row only: `auth.uid() = id` | Own row only (cascading delete) |
| **tours** | Public tours: `is_public = true`. Own tours: `auth.uid() = creator_id` | Authenticated: `auth.uid() = creator_id` | Own only: `auth.uid() = creator_id` | Own only: `auth.uid() = creator_id` |
| **tour_blocks** | Where user can SELECT parent tour | Authenticated: tour must belong to user | None (immutable after creation) | Cascade with tour only |
| **ratings** | All (public) | Authenticated: `auth.uid() = user_id` | Own only | Own only |
| **comments** | Where parent tour is visible | Authenticated: `auth.uid() = user_id` | None (immutable) | Own only: `auth.uid() = user_id` |
| **audio_files** | Authenticated users only | Edge Functions only (service role) | None | Edge Functions only (cleanup) |
| **narration_cache** | Edge Functions only (service role) | Edge Functions only | None | Edge Functions only (expiry cleanup) |
| **zone_data_cache** | Edge Functions only (service role) | Edge Functions only | None | Edge Functions only (expiry cleanup) |
| **content_reports** | Own reports only | Authenticated: `auth.uid() = reporter_id` | None | None |
| **tour_shares** | Authenticated users only | Authenticated users only | Edge Functions only (increment share_count) | None |
| **virtual_cities** | All (public, read-only) | Admin only | Admin only | Admin only |

#### Input Validation (Zod Schemas)

Every Edge Function validates ALL input before processing. Reject with 400 + error message on failure.

```
// /narrate-block input schema
{
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  mood: z.enum(['informative', 'haunted', 'celebrity', 'curiosities']),
  content_safety: z.boolean(),
  trigger_type: z.enum(['auto', 'manual']),
  voice: z.enum(['neutral', 'dramatic', 'warm'])
}

// /share-tour input schema
{
  tour_id: z.string().uuid()
}

// /replay-tour input schema
{
  tour_id: z.string().uuid(),
  voice: z.enum(['neutral', 'dramatic', 'warm']),
  mode: z.enum(['walk', 'listen'])
}

// /virtual-tour-step input schema
{
  city_id: z.string().uuid(),
  step_index: z.number().int().min(0).max(50),
  mood: z.enum(['informative', 'haunted', 'celebrity', 'curiosities']),
  content_safety: z.boolean(),
  voice: z.enum(['neutral', 'dramatic', 'warm'])
}

// Comment body sanitization (applied via Supabase constraint + client-side)
body: z.string()
  .min(1)
  .max(500)
  .transform(stripHtmlTags)    // remove any HTML/script tags
  .transform(trimWhitespace)

// Display name sanitization
display_name: z.string()
  .min(1)
  .max(50)
  .transform(stripHtmlTags)
```

#### Rate Limiting

| Scope | Limit | Implementation |
|---|---|---|
| **Narration generation** | 5 per minute per user, 50 per day per user | Edge Function: check counter in `narration_rate_limits` table (user_id + timestamp). Reject with 429. |
| **TTS generation** | Implicitly limited by narration rate limit | Same as above — TTS only fires when narration fires. |
| **Comment posting** | 10 per hour per user | Check recent comment count. Reject with 429. |
| **Rating** | 1 per tour per user | Unique constraint on (tour_id, user_id). DB rejects duplicate. |
| **Report filing** | 1 per target per user | Unique constraint on (reporter_id, target_type, target_id). |
| **Deep link resolution** | 60 per minute per IP | Supabase API rate limiting (built-in). |
| **Global API** | 100 requests per minute per IP | Supabase built-in rate limiting on REST and Edge Function endpoints. |

#### Prompt Injection Defense

The Gemini system prompt is carefully structured to prevent user-manipulated input from hijacking the narration:

1. **System prompt is hardcoded** — never includes raw user input in the system prompt.
2. **User input is isolated** — lat/lng and mood are validated enums, not free text. The only free text entering the pipeline is reverse-geocoded street names (from Nominatim, not the user).
3. **Zone data is from trusted sources** — DataSF, Wikipedia, OSM. Not user-generated.
4. **Content safety boundary** — the safe/mature prompt paths are entirely separate system prompts, not a flag the user can toggle mid-generation.
5. **Output validation** — narration text is checked for length (min 100 chars, max 5000 chars) before caching. Outliers are discarded and regenerated.

#### Audio File Security (Cloudflare R2)

| Concern | Implementation |
|---|---|
| **Bucket access** | R2 bucket is PRIVATE. No public access. All reads via signed URLs. |
| **Signed URLs** | Generated server-side in Edge Functions. 1-hour expiry. Requires valid JWT to request. |
| **Upload** | Edge Functions only (using R2 API token with write permission). Client never uploads directly. |
| **Key pattern** | `audio/{geo_hash}/{mood}/{safety_on|off}/{voice}.mp3` — deterministic, dedup-safe. |
| **Cleanup** | Cron job (Supabase pg_cron or manual): delete R2 objects where audio_files.expires_at < now(). |
| **Hotlink protection** | Signed URL expiry prevents permanent hotlinks. New signed URL requires auth. |

#### API Key Management (Environment & Secrets)

| Key | Where Stored | Who Accesses |
|---|---|---|
| `SUPABASE_URL` | `.env.local` (client) + Edge Function env | Client SDK + Edge Functions |
| `SUPABASE_ANON_KEY` | `.env.local` (client) | Client SDK (RLS-protected, safe to expose) |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Function secrets ONLY | Edge Functions (bypasses RLS for cache tables) |
| `GEMINI_API_KEY` | Edge Function secrets | Edge Functions only |
| `GOOGLE_CLOUD_TTS_KEY` | Edge Function secrets | Edge Functions only |
| `R2_ACCOUNT_ID` | Edge Function secrets | Edge Functions only |
| `R2_ACCESS_KEY_ID` | Edge Function secrets | Edge Functions only |
| `R2_SECRET_ACCESS_KEY` | Edge Function secrets | Edge Functions only |
| `R2_BUCKET_NAME` | Edge Function secrets | Edge Functions only |
| `MAPBOX_PUBLIC_TOKEN` | `.env.local` (client) | Client SDK (public token, safe to expose) |

**Rules:**
- NEVER commit secrets to git. `.env.local` is in `.gitignore`.
- NEVER expose service role key or API keys to the client.
- All secret keys are set via `supabase secrets set KEY=VALUE` for Edge Functions.
- Mapbox and Supabase anon key are intentionally client-side (designed to be public with RLS/token restrictions).

#### Content Safety

| Concern | Implementation |
|---|---|
| **Default state** | Content safety OFF (family-friendly) for all new accounts. Mature content is opt-in only. |
| **Toggle location** | Settings screen only. Not per-tour. Requires explicit user action. |
| **Age confirmation** | When enabling mature content: "This enables graphic historical content including violence, crime, and death. Confirm you are 18+." |
| **Dual prompts** | Two entirely separate Gemini system prompts. Safe prompt explicitly instructs: "Do NOT mention graphic violence, murder details, sexual content, or disturbing imagery." Mature prompt: "You may include historically accurate graphic content when relevant." |
| **Tour labeling** | Tours created with content_safety ON are permanently flagged. Badge shown to all viewers. |
| **Viewing tours** | If a user with safety OFF views a tour made with safety ON: show warning before playback. User can decline. |

#### Data Privacy

- Location data is stored ONLY as tour block points (lat/lng of narrated zones). No continuous GPS tracking. No background location collection.
- Audio files contain narration text only, no user audio.
- Anonymous tours: creator_id is stored in DB (for deletion) but not exposed via API when is_anonymous = true. RLS policy hides creator info.
- Delete Account → cascading delete of ALL user data: tours, blocks, ratings, comments, reports, shares. R2 audio for user's tours is NOT deleted (it's cached zone content, not personal data). But if a tour is deleted, its tour_blocks references are removed.

### Privacy & Compliance (MVP)

- **Privacy Policy**: Required. Template + customize. Disclose: location used only during active tours, not tracked in background. Audio generated server-side and stored on Cloudflare R2. AI-generated content disclaimer. No data sold to third parties.
- **Terms of Service**: Required for App Store. Include: safety disclaimer ("stay aware of surroundings"), content accuracy disclaimer ("AI-generated, verify important claims"), account-required for audio playback, content safety warning for mature content.
- **GDPR/CCPA**: "Delete Account" in Settings → cascading delete of all user data (tours, blocks, ratings, comments, reports, shares). Personal data fully removed. Cached zone data and audio are NOT personal data (not linked to specific user). Data export not required for MVP but plan for it.
- **COPPA**: Minimum age 13 in Terms. Age confirmation (18+) required for mature content toggle. No age-gating UI for general access.
- **Content Moderation**: Report button on tours, comments, and narrations → stored in content_reports table (status: pending). Admin reviews manually via direct DB query (admin panel post-MVP). Auto-hide content after 3 reports from different users (DB trigger). Spam comments: rate limited to 10/hour/user + 500 char limit + HTML stripped.
- **Audio Content**: All audio is AI-generated from AI-written text. No user-generated audio. No voice cloning of real people. Google Cloud TTS voices are synthetic and licensed.

### Monitoring & Logging

| Concern | MVP Approach |
|---|---|
| **Error Tracking** | Console.error in Edge Functions → visible in Supabase dashboard. Sentry free tier in v2. Standardized error response format: `{ error: string, code: string, retry: boolean }`. |
| **Usage Monitoring** | Supabase dashboard: DB size, Edge Function invocations, auth users, storage. Cloudflare R2 dashboard: storage used, requests. Check weekly. |
| **Gemini Budget** | Log every grounded search call with timestamp + user_id. Daily count query. Alert (email) at 400/day (80% of limit). |
| **Google TTS Budget** | Log every TTS call with character count. Monthly total query. Alert at 800k chars/month (80% of 1M free). |
| **R2 Storage** | Log file_size_bytes on every upload. Weekly sum query. Alert at 8GB (80% of 10GB free). |
| **Cache Hit Rate** | Log cache hits vs misses for ALL THREE layers (narration, zone data, audio). Target: >60% narration, >80% zone data, >70% audio after first month. Track sources_failed to identify unreliable APIs. |
| **Latency** | Log time-to-first-audio on client side. Target: <12 seconds for brand new zone, <3 seconds for cached. |
| **Retries/Timeouts** | Gemini: 12s timeout, 1 retry with 3s delay. Google TTS: 8s timeout, 1 retry → fallback to Edge TTS. Nominatim: 5s timeout, 1 retry. DataSF: 5s timeout, skip on failure. R2 upload: 10s timeout, 1 retry. |
| **Backups** | Supabase free tier: no automatic backups. Manual `pg_dump` weekly. Upgrade to Pro ($25/mo) for daily automatic backups when live. R2 audio is regeneratable (not backed up — can be recreated from narration text + TTS). |

---

## Quick Start for Your Dev Team

```
1. Clone repo
2. cp .env.example .env.local
   (Client-side keys:)
   SUPABASE_URL=https://xxx.supabase.co
   SUPABASE_ANON_KEY=eyJhb...
   MAPBOX_PUBLIC_TOKEN=pk.eyJ...

3. supabase secrets set SUPABASE_SERVICE_ROLE_KEY=eyJhb...
   supabase secrets set GEMINI_API_KEY=AIza...
   supabase secrets set GOOGLE_CLOUD_TTS_KEY=AIza...
   supabase secrets set R2_ACCOUNT_ID=...
   supabase secrets set R2_ACCESS_KEY_ID=...
   supabase secrets set R2_SECRET_ACCESS_KEY=...
   supabase secrets set R2_BUCKET_NAME=wandervox-audio

4. supabase start                    (local Postgres + PostGIS via Docker)
5. supabase db push                  (apply migrations — all tables + RLS + indexes)
6. npx expo start                    (scan QR with Expo Go on your phone)
7. Walk outside. Start a tour. Hear your street's story in high-quality audio.
```

### Free Tier Budget Summary

| Service | Free Tier Limit | Expected MVP Usage | Headroom |
|---|---|---|---|
| Gemini 2.5 Flash (grounded) | 500 requests/day | ~100-200/day (with narration caching) | Comfortable |
| Google Cloud TTS | 1M characters/month (WaveNet) | ~300k chars/mo (with audio caching) | Comfortable |
| Cloudflare R2 | 10GB storage, 0 egress | ~2-3GB first months (~1.5MB × ~2000 audio files) | Comfortable |
| Supabase (DB) | 500 MB | ~100 MB (zone data cache is larger with full JSON blobs) | Comfortable |
| Supabase (Edge Functions) | 500k invocations/mo | ~60k/mo estimated (more functions now) | Comfortable |
| Supabase (Auth) | 50k MAU | <1k MAU at launch | Very comfortable |
| Supabase (Storage) | 1 GB | ~50 MB (avatars only — audio is on R2) | Very comfortable |
| Mapbox | 50k map loads/mo | ~10k/mo estimated | Comfortable |
| Nominatim | No hard limit (1 req/s) | ~100-200/day | Comfortable |
| DataSF SODA (15+ datasets) | No limit (no key needed) | ~200 zone queries/day × 15 datasets = ~3,000 calls (cached 30 days) | Unlimited |
| Wikipedia Geosearch | No limit (polite use) | ~200/day (cached with zone data) | Comfortable |
| Wikimedia Commons | No limit (polite use) | ~200/day (cached with zone data) | Comfortable |
| OpenStreetMap Overpass | No hard limit | ~200/day (cached with zone data) | Comfortable |
| Google Knowledge Graph | 100,000 queries/day | ~200/day (cached with zone data) | Very comfortable |
| Edge TTS (fallback) | Unlimited (free) | Only when Google TTS quota exhausted | Unlimited |

**Total monthly cost for MVP: $0**
**Total data sources per zone: up to 19 (15 DataSF + 4 global)**
**Audio: server-generated, cloud-stored, consistent quality across all devices**

---

**Estimated timeline: 5 weeks to TestFlight-ready with 1-2 developers.**

**Week 1**: Magic moment — sign up, hear your first high-quality AI narration streaming from the cloud.
**Week 2**: Full walking engine — walk for an hour, hear stories, background audio.
**Week 3**: SF pilot with 19 data sources + virtual tours from the couch.
**Week 4**: Community — share via deep links, discover, rate, comment, replay in walk or listen mode.
**Week 5**: Polish, security hardening, edge cases, QA, submit to TestFlight.

*This is your single source of truth. Every decision is locked. Every gap is closed. Build fast, learn faster.*
