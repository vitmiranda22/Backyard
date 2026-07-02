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

## 2. Gemini API Key (AI narration engine)

1. Go to https://aistudio.google.com/apikey
2. Click **Create API Key** → copy it (looks like `AIzaSy...`).
3. Test it: go to https://aistudio.google.com, pick Gemini 2.5 Flash,
   enable Search Grounding, and ask it to narrate a street. If it works
   with real facts and citations, you're good.

**Free tier:** 500 grounded searches/day. With caching, that's plenty.

---

## 3. Google Cloud Text-to-Speech

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

## 4. Cloudflare R2 (Audio storage)

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

**Free tier:** 10GB storage, zero egress fees. That's ~6,600 audio files.

---

## 5. Mapbox (Maps)

1. Go to https://www.mapbox.com → create account.
2. Go to **Account → Tokens** → copy your **Default public token** (`pk.eyJ...`).

That's it. **Free tier:** 50k map loads/month.

---

## 6. Nominatim & DataSF — No setup needed!

**Nominatim** (reverse geocoding): Free, no key, no account. Just be polite —
max 1 request/second and include a User-Agent header.

**DataSF** (SF open data): Free, no key, no account, no rate limits.
We'll integrate this in Week 3.

---

## All your keys in one place

Once you've done all the steps above, fill in your `backend/.env` file:

```bash
# Supabase
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...

# Gemini
GEMINI_API_KEY=AIzaSy...

# Google Cloud TTS
GOOGLE_TTS_API_KEY=AIzaSy...

# Cloudflare R2
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=backyard-audio

# Mapbox (used by mobile app, but good to have here too)
MAPBOX_PUBLIC_TOKEN=pk.eyJ...
```

## Checklist

- [ ] Supabase project live, PostGIS enabled, Google OAuth configured
- [ ] Gemini API key works (tested in playground with Search Grounding)
- [ ] Google Cloud TTS enabled, API key created and restricted
- [ ] Cloudflare R2 bucket created, API token saved
- [ ] Mapbox token copied
- [ ] `backend/.env` filled in with all keys
- [ ] `.env` is in `.gitignore`
