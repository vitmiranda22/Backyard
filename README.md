# Backyard

> AI-powered guided tours anywhere in the world — every street has a story.

Backyard uses AI to narrate the history, culture, and hidden stories of whatever
street you're walking on. Pick a mode (Time Machine, Hidden City, Dark Side,
Behind the Scenes, Unfiltered), put in your earbuds, and start walking. The app
generates a unique narration for every ~150m zone you enter, pulling from city
open data, Wikipedia, OpenStreetMap, and real-time web search — then reads it
to you in a high-quality AI voice, alongside a real street-level photo of the
spot being discussed. Blocks within a tour build on each other rather than
playing as unrelated clips. Finish a tour and you can publish it as a public
**Route** — other users can discover and physically re-walk it later, with the
exact original narration/audio triggering by GPS proximity at zero extra
generation cost.

## Architecture

```
┌─────────────────────┐        ┌──────────────────────┐
│   React Native App  │  ───►  │   FastAPI Backend     │
│   (iOS / Android)   │  JSON  │   (Python)            │
│                     │  ◄───  │                       │
│ • Native map        │        │ • /narrate-block      │
│ • Audio player      │        │ • OpenAI + web_search │
│ • Mood picker       │        │ • Google Street View  │
│ • Tour / Routes UI  │        │ • Google Cloud TTS    │
└─────────────────────┘        │ • Cloudflare R2       │
                               │ • Supabase Postgres   │
                               └──────────────────────┘
```

**Backend (Python):** All the brains. Narration generation, AI pipeline, TTS,
audio storage, caching, auth validation. This is where 80% of the work lives.

**Frontend (React Native):** Thin client. Shows a map, plays audio URLs, sends
GPS coordinates to the backend. Minimal JS — just UI wiring.

## Project structure

```
backyard/
├── backend/
│   ├── app/
│   │   ├── main.py              ← FastAPI entry point
│   │   ├── config.py            ← Environment variables
│   │   ├── api/
│   │   │   ├── narrate.py       ← POST /narrate-block (the core endpoint)
│   │   │   ├── tours.py         ← Tour session lifecycle (start/save/end)
│   │   │   ├── settings.py      ← User preference endpoints
│   │   │   ├── auth.py          ← Auth middleware (validates Supabase JWTs)
│   │   │   └── health.py        ← GET /health
│   │   ├── services/
│   │   │   ├── geocode.py       ← Nominatim reverse geocoding
│   │   │   ├── zone_data.py     ← Orchestrates all 23 data sources in parallel
│   │   │   ├── datasf.py        ← 15 DataSF datasets (SF-only)
│   │   │   ├── city_data.py     ← NYC/Chicago Socrata (311, permits — gated by city match)
│   │   │   ├── global_sources.py← Wikipedia, Wikimedia, OSM, Knowledge Graph, Wikidata, TMDb (any city)
│   │   │   ├── openai_service.py← OpenAI narration + web_search grounding
│   │   │   ├── streetview.py    ← Google Street View Static photo per zone
│   │   │   ├── tts.py           ← Google Cloud TTS → MP3
│   │   │   ├── r2.py            ← Cloudflare R2 upload + signed URLs
│   │   │   └── supabase_db.py   ← Database queries (cache, tours, etc.)
│   │   ├── models/
│   │   │   └── schemas.py       ← Pydantic models for request/response validation
│   │   └── core/
│   │       └── prompts.py       ← System prompts per mode (provider-agnostic)
│   ├── migrations/               ← SQL migrations, run in order against Supabase
│   ├── requirements.txt
│   ├── .env.example
│   └── Dockerfile
├── mobile/                      ← React Native app: login, map, mood picker,
│                                   active tour with GPS-triggered narration + audio
├── docs/
│   ├── API_SETUP_GUIDE.md       ← How to get all your API keys
│   └── WEEK1_WALKTHROUGH.md     ← Step-by-step guide for Week 1
└── README.md                    ← You are here
```

## Quick start

### 1. Set up APIs (45 minutes, one-time)

Follow [docs/API_SETUP_GUIDE.md](docs/API_SETUP_GUIDE.md) to create accounts and
get your keys for Supabase, OpenAI, Google Street View, Google TTS, and Cloudflare R2.

### 2. Run the backend

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env            # Then fill in your API keys
uvicorn app.main:app --reload
```

The API is now running at http://localhost:8000. Hit http://localhost:8000/health
to confirm. Hit http://localhost:8000/docs for the auto-generated Swagger UI.

### 3. Run the mobile app

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with Expo Go on your phone.

## Week 1 goal

Sign up → tap "Start Tour" → pick Dark Side + Dramatic voice → hear a high-quality
AI narration about your current street streaming from the cloud.

If that makes you smile, Week 1 is done.
