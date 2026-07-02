// Backyard Mobile App — Configuration
//
// IMPORTANT: Replace the Supabase values below with YOUR keys.
// Find them in your backend/.env file.

// Your laptop's IP so the phone can reach the backend
export const API_URL = "http://192.168.4.24:8000/api";

// Copy these from your backend/.env file
export const SUPABASE_URL = "https://mhsbqyvpuccshmkheweu.supabase.co";       // e.g. https://xxxxx.supabase.co
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1oc2JxeXZwdWNjc2hta2hld2V1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzNDczNzEsImV4cCI6MjA4NTkyMzM3MX0.lNDxyPZ-9u-QWdXdCOtKffcNKWLWyUoWD6QCv2bntqM"; // starts with eyJ...

// Geohash precision 7 = ~150m zones (must match backend)
export const GEOHASH_PRECISION = 7;

// How often to check GPS (milliseconds)
export const GPS_INTERVAL_MS = 5000;