# Week 1 Walkthrough — Foundation + Magic Moment

## Goal

By the end of this week, you should be able to:

1. Sign up in the app
2. Tap "Start Tour"
3. Pick a mood (Haunted) and voice (Dramatic)
4. Hear a high-quality AI narration about your current street
   streaming from the cloud

If that works and makes you smile, Week 1 is done.

---

## Day 1: Set up everything

### Step 1: Get your API keys (45 min)

Follow `docs/API_SETUP_GUIDE.md`. At the end you should have:

- Supabase project with PostGIS enabled
- Gemini API key (tested in playground)
- Google Cloud TTS API enabled with restricted key
- Cloudflare R2 bucket with API tokens
- Mapbox public token

### Step 2: Set up the Python backend (15 min)

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Now open .env and paste in all your API keys
```

### Step 3: Create the database tables (5 min)

1. Go to your Supabase dashboard → SQL Editor → New Query.
2. Copy the entire contents of `backend/migrations/001_initial_schema.sql`.
3. Paste and click **Run**.
4. You should see "Success. No rows returned" — that means all tables
   were created.
5. Verify: go to **Table Editor** and you should see: users, tours,
   tour_blocks, narration_cache, audio_files, and more.

### Step 4: Verify the backend starts (2 min)

```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload
```

You should see:
```
INFO | backyard | 🎙️ Backyard API starting up (env: development)
INFO | backyard |    Supabase: https://xxxx.supabase.co
INFO | backyard |    R2 bucket: backyard-audio
```

Open http://localhost:8000/docs in your browser. You should see the Swagger UI
with the `/health` and `/api/narrate-block` endpoints documented.

Hit http://localhost:8000/health — you should get:
```json
{"status": "ok", "version": "0.1.0", "environment": "development"}
```

### Step 5: Test the narration pipeline manually (10 min)

Before building any mobile UI, let's test the full pipeline via curl.

First, you need a valid Supabase JWT token. The quickest way:

1. Go to Supabase → Authentication → Users → Add User.
2. Create a test user with email/password.
3. Use the Supabase client to sign in and get a token:

```python
# test_auth.py — run this once to get a token
from supabase import create_client
import os

client = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_ANON_KEY"))
response = client.auth.sign_in_with_password({
    "email": "test@example.com",
    "password": "your-test-password"
})
print("TOKEN:", response.session.access_token)
```

Now test the narration endpoint:

```bash
curl -X POST http://localhost:8000/api/narrate-block \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "lat": 37.7696,
    "lng": -122.4469,
    "mood": "haunted",
    "content_safety": false,
    "trigger_type": "manual",
    "voice": "dramatic"
  }'
```

If everything works, you'll get back a response with:
- `narration_text` — the AI-generated story
- `audio_url` — a signed R2 URL you can paste into your browser to hear the audio
- `street_name`, `neighborhood`, `city` — the location info

**Paste the `audio_url` into your browser.** You should hear the narration
spoken in a dramatic voice. That's the magic moment — it works.

---

## Day 2-3: Build the mobile app

The React Native app is intentionally simple. Its only job is:

1. Get GPS coordinates
2. Let the user pick mood + voice
3. Call the backend API
4. Play the audio URL

The backend does all the heavy lifting. The mobile app is a thin UI layer.

(The React Native code is in the `mobile/` directory. Follow the README there.)

---

## Day 4-5: Polish and test

- Test with different locations (try a famous street vs a random residential block)
- Test all 4 moods at the same location — the narrations should be completely different
- Test the cache: request the same location + mood twice — second time should be instant
- Test with content_safety on and off — the haunted narration should be noticeably different
- Test error handling: what happens with no internet? Invalid coordinates?
- Check the Supabase dashboard: are narration_cache and audio_files rows appearing?
- Check the R2 dashboard: are MP3 files appearing in the bucket?

---

## What you should have at the end of Week 1

### Backend (Python) ✅
- FastAPI server running with `/narrate-block` endpoint
- Full narration pipeline: GPS → geocode → Gemini AI → Google TTS → R2 → signed URL
- Two-layer cache working (narration_cache + audio_files)
- JWT auth validation on all endpoints
- All database tables created with RLS policies

### Mobile app (React Native) 🚧
- Basic app with map, mood picker, voice picker, and "Start Tour" button
- Calls the backend and plays the returned audio URL
- (This is minimal in Week 1 — we'll flesh it out in Week 2)

### Not yet built (that's fine, those are Week 2-5)
- Auto-trigger on zone entry (Week 2)
- Walking tour engine with route tracking (Week 2)
- DataSF open data integration (Week 3)
- Community sharing, rating, comments (Week 4)
- Deep links, content moderation, polish (Week 5)
