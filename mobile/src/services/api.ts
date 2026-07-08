// API service — all HTTP calls to the Python backend
//
// Every function here calls an endpoint on your FastAPI server.
// The backend does the heavy lifting (AI, TTS, storage).
// This file just sends requests and returns responses.

import { API_URL } from "../config";
import { getToken, refreshToken } from "./auth";

// Helper: make an authenticated request. Retries once on a 401 after
// forcing a token refresh — a backstop for the rare case where our token
// went stale despite auth.ts's onAuthStateChange listener (e.g. a request
// that was already in flight when the session refreshed).
async function authFetch(path: string, options: RequestInit = {}, isRetry = false): Promise<any> {
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

  if (response.status === 401 && !isRetry) {
    try {
      await refreshToken();
      return authFetch(path, options, true);
    } catch {
      // Fall through to the normal error handling below.
    }
  }

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
  audio_r2_key: string | null;
  audio_duration_ms: number | null;
  image_url: string | null;
  image_r2_key: string | null;
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
  triggerType: "auto" | "manual",
  tourId?: string
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
      tour_id: tourId,
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
  city: string;
  narration_text: string;
  audio_r2_key?: string;
  image_r2_key?: string;
  voice: string;
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
// Tour history
// =============================================================================

export interface TourSummary {
  tour_id: string;
  title: string;
  mood: string;
  city: string | null;
  blocks_visited: number;
  total_distance_m: number | null;
  duration_sec: number | null;
  created_at: string;
}

export async function getTours(): Promise<TourSummary[]> {
  return authFetch("/tours");
}

// =============================================================================
// Routes — publish, discover, replay, rate
// =============================================================================

export interface PublishTourResponse {
  tour_id: string;
  is_public: boolean;
  title: string;
}

export async function publishTour(
  tourId: string,
  isPublic: boolean,
  title?: string
): Promise<PublishTourResponse> {
  return authFetch("/publish-tour", {
    method: "POST",
    body: JSON.stringify({ tour_id: tourId, is_public: isPublic, title }),
  });
}

export interface TourBlockDetail {
  block_id: string;
  sequence: number;
  street_name: string;
  neighborhood: string;
  lat: number;
  lng: number;
  narration_text: string;
  audio_url: string | null;
  image_url: string | null;
  voice: string;
  mood: string;
}

export interface TourDetail {
  tour_id: string;
  title: string;
  mood: string;
  tour_type: string;
  city: string | null;
  avg_rating: number;
  rating_count: number;
  blocks_visited: number;
  total_distance_m: number | null;
  duration_sec: number | null;
  is_own_tour: boolean;
  is_anonymous: boolean;
  creator_display_name: string | null;
  creator_avatar_url: string | null;
  created_at: string;
  blocks: TourBlockDetail[];
}

export async function getTourDetail(tourId: string): Promise<TourDetail> {
  return authFetch(`/tours/${tourId}`);
}

export interface NearbyRoute {
  tour_id: string;
  title: string;
  mood: string;
  tour_type: string;
  city: string | null;
  avg_rating: number;
  rating_count: number;
  blocks_visited: number;
  total_distance_m: number | null;
  duration_sec: number | null;
  is_anonymous: boolean;
  content_safety_on: boolean;
  creator_display_name: string | null;
  creator_avatar_url: string | null;
  distance_m: number;
  created_at: string;
  lat: number;
  lng: number;
}

export async function getNearbyRoutes(
  lat: number,
  lng: number,
  opts?: {
    radiusM?: number;
    mood?: string;
    tourType?: string;
    limit?: number;
    offset?: number;
    sortBy?: "distance" | "rating";
  }
): Promise<NearbyRoute[]> {
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    radius_m: String(opts?.radiusM ?? 5000),
    limit: String(opts?.limit ?? 20),
    offset: String(opts?.offset ?? 0),
    sort_by: opts?.sortBy ?? "distance",
  });
  if (opts?.mood) params.set("mood", opts.mood);
  if (opts?.tourType) params.set("tour_type", opts.tourType);
  return authFetch(`/routes/nearby?${params.toString()}`);
}

export interface RateTourResponse {
  tour_id: string;
  score: number;
  avg_rating: number;
  rating_count: number;
}

export async function rateTour(tourId: string, score: number): Promise<RateTourResponse> {
  return authFetch("/rate-tour", {
    method: "POST",
    body: JSON.stringify({ tour_id: tourId, score }),
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
