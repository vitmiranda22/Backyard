// API service — all HTTP calls to the Python backend
//
// Every function here calls an endpoint on your FastAPI server.
// The backend does the heavy lifting (AI, TTS, storage).
// This file just sends requests and returns responses.

import { API_URL } from "../config";
import { getToken, refreshToken } from "./auth";

// Generous enough to cover a real cache-miss narration (zone-data fetch +
// LLM generation + TTS can legitimately take 20-30s) without false-firing,
// while still catching a truly hung connection instead of spinning forever.
const REQUEST_TIMEOUT_MS = 45000;

// Thrown by authFetch on any non-2xx response, carrying the backend's real
// status/code/retry instead of collapsing every failure into one generic
// message. Without this, a 429 (rate limit), a 408 (generation failed), and
// a genuine 500 all looked identical to the caller -- impossible to tell
// apart from a bug report alone. See ActiveTourScreen's narration catch
// block for where this actually gets used.
export class ApiError extends Error {
  status: number;
  code?: string;
  retry: boolean;

  constructor(message: string, status: number, code?: string, retry = false) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retry = retry;
  }
}

// Helper: make an authenticated request. Retries once on a 401 after
// forcing a token refresh — a backstop for the rare case where our token
// went stale despite auth.ts's onAuthStateChange listener (e.g. a request
// that was already in flight when the session refreshed).
async function authFetch(path: string, options: RequestInit = {}, isRetry = false): Promise<any> {
  const token = getToken();
  if (!token) {
    throw new Error("Not authenticated. Please sign in.");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
      signal: controller.signal,
    });
  } catch (e: any) {
    if (e.name === "AbortError") {
      throw new Error("That took too long to respond. Check your connection and try again.");
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 401 && !isRetry) {
    try {
      await refreshToken();
      return authFetch(path, options, true);
    } catch {
      // Fall through to the normal error handling below.
    }
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({
      error: `HTTP ${response.status}`,
    }));
    // FastAPI's HTTPException(detail={...}) shape wraps our fields one
    // level down; a few older/simpler error responses don't. Handle both.
    const detail = body.detail && typeof body.detail === "object" ? body.detail : body;
    throw new ApiError(
      detail.error || `Request failed: ${response.status}`,
      response.status,
      detail.code,
      detail.retry
    );
  }

  return response.json();
}

// =============================================================================
// Narration
// =============================================================================

export interface NarrationHighlight {
  text: string;
  url: string;
}

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
  // Premium-only real-Wikipedia links matched against this narration's
  // actual wording — empty for free users. See backend's
  // zone_data.find_wikipedia_highlights.
  highlights: NarrationHighlight[];
}

export async function narrateBlock(
  lat: number,
  lng: number,
  mood: string,
  voice: string,
  contentSafety: boolean,
  triggerType: "auto" | "manual",
  tourId?: string,
  // Set when this request's sequence is expected to hit the tour's block
  // cap -- the one ending path knowable in advance (see ActiveTourScreen's
  // MAX_BLOCKS check). Backend uses it to also generate a closing beat
  // that resolves the whole walk, appended after this block's narration.
  isFinalBlock?: boolean
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
      is_final_block: !!isFinalBlock,
    }),
  });
}

// Fire-and-forget: warms zone_data_cache for a point projected ahead of the
// walker's heading (see ActiveTourScreen.tsx), so /narrate-block's own
// cache lookup is more often already warm by the time they actually arrive.
// Callers should never await this with a loading state or surface its
// errors -- a failed prefetch just means the cache stays cold and
// narrateBlock() fetches it the normal way, same as today.
export async function prefetchZone(lat: number, lng: number): Promise<void> {
  await authFetch("/prefetch-zone", {
    method: "POST",
    body: JSON.stringify({ lat, lng }),
  });
}

export interface PendingTransitionResponse {
  ready: boolean;
  transition_text: string | null;
  // Only ever set for a block sent with isFinalBlock=true -- a beat that
  // resolves the whole tour, meant to be appended after the narration
  // instead of prepended like transition_text.
  closing_text: string | null;
}

// Polled by ActiveTourScreen for a few seconds after a tour block goes on
// screen, to pick up the connector line the backend generates in the
// background (see narrate.py's _generate_connector_in_background) without
// making narrateBlock() itself wait on it.
export async function getPendingTransition(
  tourId: string,
  geoHash: string
): Promise<PendingTransitionResponse> {
  const params = new URLSearchParams({ tour_id: tourId, geo_hash: geoHash });
  return authFetch(`/narrate-block/transition?${params.toString()}`);
}

export interface NarrationQuotaResponse {
  remaining: number;
  daily_limit: number;
}

// Read-only pre-flight check, called right before letting the walker reach
// MoodPickerScreen or tap Start Replay -- so a spent daily quota shows as
// an upfront warning instead of only surfacing mid-flow as a 429 from
// narrateBlock() itself. Never burns a slot just to check.
export async function getNarrationQuota(): Promise<NarrationQuotaResponse> {
  return authFetch("/narrate-block/quota");
}

export interface AskQuestionResponse {
  question_text: string;
  answer_text: string;
  audio_url: string | null;
  audio_duration_ms: number | null;
}

// Multipart upload — deliberately bypasses authFetch, which hardcodes
// Content-Type: application/json. Setting Content-Type manually for a
// FormData body breaks the multipart boundary fetch generates itself.
export async function askQuestion(
  audioUri: string,
  lat: number,
  lng: number,
  mood: string,
  voice: string,
  tourId?: string,
  isRetry = false
): Promise<AskQuestionResponse> {
  const token = getToken();
  if (!token) {
    throw new Error("Not authenticated. Please sign in.");
  }

  const form = new FormData();
  form.append("audio", {
    uri: audioUri,
    name: "question.m4a",
    type: "audio/m4a",
  } as any);
  form.append("lat", String(lat));
  form.append("lng", String(lng));
  form.append("mood", mood);
  form.append("voice", voice);
  if (tourId) form.append("tour_id", tourId);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_URL}/ask-question`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: controller.signal,
    });
  } catch (e: any) {
    if (e.name === "AbortError") {
      throw new Error("That took too long to respond. Check your connection and try again.");
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 401 && !isRetry) {
    try {
      await refreshToken();
      return askQuestion(audioUri, lat, lng, mood, voice, tourId, true);
    } catch {
      // Fall through to the normal error handling below.
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error(error.error || error.detail?.error || `Request failed: ${response.status}`);
  }

  return response.json();
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
  // Only set for moods with a named guide persona (dark_side, behind_scenes,
  // unfiltered) -- play this before triggering block 1's narration.
  intro_audio_url?: string | null;
  guide_name?: string | null;
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
  outro_audio_url: string | null;
}

export async function endTour(
  tourId: string,
  distanceM: number,
  durationSec: number,
  path?: { lat: number; lng: number }[]
): Promise<EndTourResponse> {
  return authFetch("/end-tour", {
    method: "POST",
    body: JSON.stringify({
      tour_id: tourId,
      total_distance_m: distanceM,
      duration_sec: durationSec,
      path,
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
  like_count: number;
  liked_by_me: boolean;
  path: { lat: number; lng: number }[];
}

export async function getTourDetail(tourId: string): Promise<TourDetail> {
  return authFetch(`/tours/${tourId}`);
}

export async function deleteTour(tourId: string): Promise<void> {
  return authFetch(`/tours/${tourId}`, { method: "DELETE" });
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
  // True when this route's starting zone had unusually few real data
  // sources come back the last time it was narrated — an automatic
  // signal, not a user report. See backend zone_data.is_low_info.
  is_low_info: boolean;
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

// =============================================================================
// Terra Incognita -- fog-of-war map discovery
// =============================================================================

export async function reportExploredCell(lat: number, lng: number): Promise<{ geo_hash: string }> {
  return authFetch("/explored-cells", {
    method: "POST",
    body: JSON.stringify({ lat, lng }),
  });
}

export async function getExploredCells(): Promise<{ geo_hashes: string[] }> {
  return authFetch("/explored-cells");
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
// Data richness signal
// =============================================================================

export interface RichnessInfo {
  tier: "full" | "partial" | "global";
  city: string;
  message: string;
}

export async function getRichness(lat: number, lng: number): Promise<RichnessInfo> {
  return authFetch(`/richness?lat=${lat}&lng=${lng}`);
}

// =============================================================================
// Social — comments and likes
// =============================================================================

export interface Comment {
  comment_id: string;
  tour_id: string;
  body: string;
  is_anonymous: boolean;
  display_name: string | null;
  created_at: string;
}

export async function getComments(tourId: string): Promise<Comment[]> {
  return authFetch(`/tours/${tourId}/comments`);
}

export async function postComment(tourId: string, body: string, isAnonymous = false): Promise<Comment> {
  return authFetch(`/tours/${tourId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body, is_anonymous: isAnonymous }),
  });
}

export interface LikeResult {
  tour_id: string;
  liked: boolean;
  like_count: number;
}

export async function toggleLike(tourId: string): Promise<LikeResult> {
  return authFetch(`/tours/${tourId}/like`, { method: "POST" });
}

export type ReportReason = "inaccurate" | "offensive" | "spam" | "other";

export interface ReportResult {
  report_id: string;
  target_type: string;
  target_id: string;
  reason: string;
  status: string;
}

export async function reportTour(
  tourId: string,
  reason: ReportReason,
  detail?: string
): Promise<ReportResult> {
  return authFetch(`/tours/${tourId}/report`, {
    method: "POST",
    body: JSON.stringify({ reason, detail }),
  });
}

export async function reportComment(
  tourId: string,
  commentId: string,
  reason: ReportReason,
  detail?: string
): Promise<ReportResult> {
  return authFetch(`/tours/${tourId}/comments/${commentId}/report`, {
    method: "POST",
    body: JSON.stringify({ reason, detail }),
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
  // "YYYY-MM-DD", or null for any account created before the signup form
  // started collecting it (or that never got a value some other way).
  date_of_birth: string | null;
  is_premium: boolean;
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

export async function deleteAccount(): Promise<void> {
  await authFetch("/user/account", { method: "DELETE" });
}

export interface UserStats {
  tours_completed: number;
  total_distance_m: number;
  cities_visited: number;
  moods_tried: string[];
  routes_published: number;
  total_likes_received: number;
  longest_streak_days: number;
  night_streak_days: number;
  early_streak_days: number;
}

export async function getUserStats(): Promise<UserStats> {
  return authFetch("/user/stats");
}

