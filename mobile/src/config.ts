// Backyard Mobile App — Configuration
//
// IMPORTANT: Replace the Supabase values below with YOUR keys.
// Find them in your backend/.env file.

// Your laptop's IP so the phone can reach the backend
export const API_URL = "http://192.168.4.24:8000/api";

// Copy these from your backend/.env file
export const SUPABASE_URL = "https://uhhjntfwmgsiyvzepptm.supabase.co";       // e.g. https://xxxxx.supabase.co
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVoaGpudGZ3bWdzaXl2emVwcHRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxOTc0MTEsImV4cCI6MjA5ODc3MzQxMX0._cCsOR3Y8DYGTSipo218Pt-sM33BqThXnxEt1RtjFL8"; // starts with eyJ...

// Geohash precision 7 = ~150m zones (must match backend)
export const GEOHASH_PRECISION = 7;

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