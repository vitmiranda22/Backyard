# API Setup Guide

Follow these steps to set up every external service Backyard needs.
Budget about 45 minutes. Everything is free tier.

---

## 1. Supabase (Database + Auth)

We use Supabase for Postgres (with PostGIS), authentication, and row-level security.
Our Python backend connects to it directly — Supabase is just a managed Postgres
with bonus features.

### Create the project

1. Go to https://supabase.com → Sign up.
2. Click **New Project**.
3. Name it `backyard-staging`, pick a region near you, set a DB password.
4. Wait ~2 minutes for it to spin up.

### Grab your keys

Go to **Settings → API** and copy:

- `SUPABASE_URL` — the project URL (https://xxxx.supabase.co)
- `SUPABASE_ANON_KEY` — the `anon` / `public` key (safe for client-side)
- `SUPABASE_SERVICE_ROLE_KEY` — the `service_role` / `secret` key (**server only**)

### Enable PostGIS

Go to **Database → Extensions** → search "postgis" → toggle ON.

### Enable Google OAuth (for "Sign in with Google")

1. Go to https://console.cloud.google.com → **APIs & Services → Credentials**.
2. Click **Create Credentials → OAuth Client ID**.
3. Application type: **Web application**.
4. Authorized redirect URI: `https://xxxx.supabase.co/auth/v1/callback`
   (replace xxxx with your Supabase project ref).
5. Copy the **Client ID** and **Client Secret**.
6. In Supabase, go to **Authentication → Providers → Google**.
7. Toggle ON, paste your Client ID and Client Secret, save.

---

## 2. OpenAI API Key (AI narration engine)

1. Go to https://platform.openai.com/api-keys → sign up or log in.
2. Add a payment method under **Settings → Billing** — a $5 minimum charge
   unlocks Tier 1 rate limits (500 requests/min) and access to `gpt-4.1-mini`.
   The true no-payment free tier only allows GPT-3.5 Turbo at 3 requests/min,
   which isn't enough to actually use this app.
3. Click **Create new secret key** → copy it (looks like `sk-...`).
4. Narrations use the Responses API's built-in `web_search` tool for live
   facts — no separate search API/key needed, it's part of the OpenAI call.

---

## 3. Google Street View Static API (zone photos)

Shows a real street-level photo of the spot each narration discusses.

1. Go to https://console.cloud.google.com — use the same project as step 4
   (Google Cloud TTS) if you want, or a new one.
2. **APIs & Services → Library** → search "Street View Static API" → **Enable**.
3. Make sure billing is active on the project (see step 4 below for why).
4. **APIs & Services → Credentials** → **Create Credentials → API Key** → copy it.
5. Click the key → "API restrictions" → "Restrict key" → pick
   "Street View Static API" only → Save. Use a **separate** key from your
   TTS key — don't reuse one restricted to a different API.

**Cost:** ~$0.007/photo, with a free monthly quota. The metadata endpoint
(checking whether a location has coverage before fetching) is always free.
Every photo is cached forever per ~150m zone once fetched, so this is a
one-time cost per location, not per request.

---

## 4. Google Cloud Text-to-Speech

1. Go to https://console.cloud.google.com
2. Create a project (or use the one from step 2).
3. **Important:** You need to enable billing (add a credit card). You won't be
   charged — the first 1M characters/month are free — but Google requires billing
   to be active for Cloud APIs.
4. Go to **APIs & Services → Library** → search "Cloud Text-to-Speech API" → **Enable**.
5. Go to **APIs & Services → Credentials** → **Create Credentials → API Key** → copy it.
6. Click the key → under "API restrictions" select "Restrict key" → pick
   "Cloud Text-to-Speech API" only → Save.

**Free tier:** 1M characters/month (WaveNet/Journey voices).
A 90-second narration is ~2,000 characters. That's ~500 narrations/month for free.

---

## 5. Cloudflare R2 (Audio + photo storage)

1. Go to https://dash.cloudflare.com → sign up or log in.
2. Left sidebar → **R2 Object Storage** → **Create Bucket**.
3. Name it `backyard-audio` → Create.
4. Click **Manage R2 API Tokens** → **Create API Token**.
5. Name: `backyard-backend`, Permissions: **Object Read & Write**,
   Bucket: `backyard-audio` only.
6. **SAVE THESE RIGHT NOW** (shown only once):
   - Access Key ID → `R2_ACCESS_KEY_ID`
   - Secret Access Key → `R2_SECRET_ACCESS_KEY`
7. Note your Account ID from the R2 overview page → `R2_ACCOUNT_ID`.

**Free tier:** 10GB storage, zero egress fees. Stores both generated audio
and cached zone photos.

---

## 6. Nominatim & DataSF — No setup needed!

**Nominatim** (reverse geocoding): Free, no key, no account. Just be polite —
max 1 request/second and include a User-Agent header.

**DataSF** (SF open data): Free, no key, no account, no rate limits.

The mobile app's map (`react-native-maps`) uses the platform's native map
provider (Apple Maps on iOS, Google Maps on Android) — no separate maps API
key needed.

---

## All your keys in one place

Once you've done all the steps above, fill in your `backend/.env` file:

```bash
# Supabase
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...

# OpenAI
OPENAI_API_KEY=sk-...

# Google Street View Static API
GOOGLE_STREETVIEW_API_KEY=AIzaSy...

# Google Cloud TTS
GOOGLE_TTS_API_KEY=AIzaSy...

# Cloudflare R2
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=backyard-audio

# TMDb (optional — leave blank to skip; free key at themoviedb.org)
TMDB_API_KEY=
```

## Checklist

- [ ] Supabase project live, PostGIS enabled, Google OAuth configured
- [ ] OpenAI API key works, billing enabled (Tier 1 unlocked)
- [ ] Street View Static API enabled, key created and restricted to it
- [ ] Google Cloud TTS enabled, API key created and restricted
- [ ] Cloudflare R2 bucket created, API token saved
- [ ] `backend/.env` filled in with all keys
- [ ] `.env` is in `.gitignore`
