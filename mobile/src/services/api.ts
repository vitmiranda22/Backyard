// API service — all HTTP calls to the Python backend
//
// Every function here calls an endpoint on your FastAPI server.
// The backend does the heavy lifting (AI, TTS, storage).
// This file just sends requests and returns responses.

import { API_URL } from "../config";
import { getToken } from "./auth";

// Helper: make an authenticated request
async function authFetch(path: string, options: RequestInit = {}) {
  const token = getToken();
  if (!token) {
    throw new Error("Not authenticated. Please sign in.");
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      error: `HTTP ${response.status}`,
    }));
    throw new Error(error.error || error.detail?.error || `Request failed: ${response.status}`);
  }

  return response.json();
}

// =============================================================================
// Narration
// =============================================================================

export interface NarrationResponse {
  street_name: string;
  neighborhood: string;
  city: string;
  narration_text: string;
  audio_url: string | null;
  audio_duration_ms: number | null;
  mood: string;
  content_safety_applied: boolean;
  cached: boolean;
}

export async function narrateBlock(
  lat: number,
  lng: number,
  mood: string,
  voice: string,
  contentSafety: boolean,
  triggerType: "auto" | "manual"
): Promise<NarrationResponse> {
  return authFetch("/narrate-block", {
    method: "POST",
    body: JSON.stringify({
      lat,
      lng,
      mood,
      voice,
      content_safety: contentSafety,
      trigger_type: triggerType,
    }),
  });
}

// =============================================================================
// Tour session
// =============================================================================

export interface StartTourResponse {
  tour_id: string;
  mood: string;
  voice: string;
  tour_type: string;
  started_at: string;
}

export async function startTour(
  mood: string,
  voice: string,
  contentSafety: boolean
): Promise<StartTourResponse> {
  return authFetch("/start-tour", {
    method: "POST",
    body: JSON.stringify({
      mood,
      voice,
      content_safety: contentSafety,
      tour_type: "walking",
    }),
  });
}

export async function saveBlock(params: {
  tour_id: string;
  sequence: number;
  lat: number;
  lng: number;
  street_name: string;
  neighborhood: string;
  narration_text: string;
  audio_r2_key?: string;
  mood: string;
  trigger_type: string;
}) {
  return authFetch("/save-block", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export interface EndTourResponse {
  tour_id: string;
  title: string;
  blocks_visited: number;
  total_distance_m: number | null;
  duration_sec: number | null;
  mood: string;
}

export async function endTour(
  tourId: string,
  distanceM: number,
  durationSec: number
): Promise<EndTourResponse> {
  return authFetch("/end-tour", {
    method: "POST",
    body: JSON.stringify({
      tour_id: tourId,
      total_distance_m: distanceM,
      duration_sec: durationSec,
    }),
  });
}

// =============================================================================
// Settings
// =============================================================================

export interface UserSettings {
  preferred_voice: string;
  content_safety: boolean;
  anonymous_default: boolean;
  display_name: string;
}

export async function getSettings(): Promise<UserSettings> {
  return authFetch("/user/settings");
}

export async function updateSettings(
  updates: Partial<UserSettings>
): Promise<UserSettings> {
  return authFetch("/user/settings", {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}
