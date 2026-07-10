// Backyard Mobile App — Configuration
//
// IMPORTANT: Replace the Supabase values below with YOUR keys.
// Find them in your backend/.env file.

// Hosted backend on Render — reachable from anywhere, not just your home WiFi.
export const API_URL = "https://backyard-api.onrender.com/api";

// Copy these from your backend/.env file
export const SUPABASE_URL = "https://uhhjntfwmgsiyvzepptm.supabase.co";       // e.g. https://xxxxx.supabase.co
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVoaGpudGZ3bWdzaXl2emVwcHRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxOTc0MTEsImV4cCI6MjA5ODc3MzQxMX0._cCsOR3Y8DYGTSipo218Pt-sM33BqThXnxEt1RtjFL8"; // starts with eyJ...

// Geohash precision 8 = ~19-38m zones (must match backend)
export const GEOHASH_PRECISION = 8;

// How often to check GPS (milliseconds)
export const GPS_INTERVAL_MS = 5000;

// Replay mode: how close (meters) you need to be to a waypoint before its
// narration auto-plays. GPS accuracy in dense urban blocks can drift
// 10-50m — tune this after field-testing on a real device.
export const REPLAY_PROXIMITY_M = 35;

// --- DEV ONLY: skip the login screen for faster testing ---
// Set back to false to restore the normal sign-in flow before shipping.
export const DEV_SKIP_LOGIN = true;
export const DEV_EMAIL = "devtest@backyard.app";
export const DEV_PASSWORD = "BackyardDev123!";

// Crash reporting — scaffolded, inactive until you create a Sentry project
// and paste its DSN here. A blank value is a no-op (see src/services/sentry.ts).
export const SENTRY_DSN = "https://49568006e6b19952177c8155c2d48f69@o4511708654731264.ingest.us.sentry.io/4511708674523136";

// Product analytics — scaffolded, inactive until you create a free project at
// posthog.com and paste its key here. A blank value is a no-op (see
// src/services/analytics.ts). If your project is on PostHog's EU cloud,
// switch POSTHOG_HOST to "https://eu.i.posthog.com".
export const POSTHOG_API_KEY = "";
export const POSTHOG_HOST = "https://us.i.posthog.com";

// In-app purchases (RevenueCat) — scaffolded, inactive until you:
//   1. Create App Store Connect / Play Console in-app purchase products
//   2. Create a RevenueCat account, connect those stores, and set up an
//      "premium" entitlement + offering
//   3. Paste the platform API keys below (Project settings > API keys in
//      RevenueCat)
// Blank values are a no-op — the Paywall screen falls back to its static
// "Coming soon" behavior until these are filled in (see
// src/services/purchases.ts).
export const REVENUECAT_IOS_API_KEY = "";
export const REVENUECAT_ANDROID_API_KEY = "";
export const REVENUECAT_ENTITLEMENT_ID = "premium";