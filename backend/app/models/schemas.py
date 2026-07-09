"""
Request and response models for the Backyard API.

These Pydantic models do double duty:
1. Validate incoming requests (reject bad data with clear error messages)
2. Document the API (FastAPI auto-generates Swagger docs from these)
"""

from enum import Enum
from typing import Optional, List
from pydantic import BaseModel, Field


# =============================================================================
# Enums
# =============================================================================

class Mood(str, Enum):
    TIME_MACHINE = "time_machine"
    HIDDEN_CITY = "hidden_city"
    DARK_SIDE = "dark_side"
    BEHIND_SCENES = "behind_scenes"
    UNFILTERED = "unfiltered"


class Voice(str, Enum):
    NEUTRAL = "neutral"
    DRAMATIC = "dramatic"
    WARM = "warm"


class TriggerType(str, Enum):
    AUTO = "auto"
    MANUAL = "manual"


class TourType(str, Enum):
    WALKING = "walking"
    VIRTUAL = "virtual"


# =============================================================================
# Narration endpoint
# =============================================================================

class NarrateBlockRequest(BaseModel):
    """POST /api/narrate-block"""
    lat: float = Field(..., ge=-90, le=90, examples=[37.7696])
    lng: float = Field(..., ge=-180, le=180, examples=[-122.4469])
    mood: Mood = Field(..., examples=["time_machine"])
    content_safety: bool = Field(default=False)
    trigger_type: TriggerType = Field(default=TriggerType.AUTO)
    voice: Voice = Field(default=Voice.NEUTRAL)
    tour_id: Optional[str] = Field(
        default=None,
        description="Active tour this block belongs to. When present, the "
        "narration is stitched with a transition connecting it to the "
        "tour's prior blocks. Omit for one-off requests outside a tour.",
    )


class ZoneDataUsed(BaseModel):
    sources_hit: List[str] = Field(default_factory=list)


class NarrateBlockResponse(BaseModel):
    """Response from /api/narrate-block"""
    street_name: str
    neighborhood: str
    city: str
    narration_text: str
    audio_url: Optional[str] = None
    audio_r2_key: Optional[str] = None
    audio_duration_ms: Optional[int] = None
    image_url: Optional[str] = None
    image_r2_key: Optional[str] = None
    mood: Mood
    content_safety_applied: bool
    cached: bool
    zone_data_used: Optional[ZoneDataUsed] = None


# =============================================================================
# Tour session endpoints (Week 2)
# =============================================================================

class StartTourRequest(BaseModel):
    """POST /api/start-tour"""
    mood: Mood = Field(..., examples=["time_machine"])
    voice: Voice = Field(default=Voice.NEUTRAL)
    content_safety: bool = Field(default=False)
    tour_type: TourType = Field(default=TourType.WALKING)


class StartTourResponse(BaseModel):
    tour_id: str
    mood: Mood
    voice: Voice
    tour_type: TourType
    started_at: str


class SaveBlockRequest(BaseModel):
    """POST /api/save-block"""
    tour_id: str = Field(..., description="Tour ID from start-tour")
    sequence: int = Field(..., ge=1, description="Block number in order visited")
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    street_name: str = Field(..., max_length=200)
    neighborhood: str = Field(default="Unknown", max_length=200)
    city: str = Field(default="Unknown", max_length=200)
    narration_text: str = Field(
        ...,
        # Core narration is hard-capped at 5000 chars (openai_service.py),
        # plus a tour-continuity transition can be prepended on top of that
        # (narrate.py's connector step, ~1-2 sentences) — leave headroom
        # above 5000 so a legitimate stitched block never gets rejected.
        max_length=5500,
        description="The AI-generated narration text",
    )
    audio_r2_key: Optional[str] = Field(None, description="R2 key for the audio file")
    image_r2_key: Optional[str] = Field(None, description="R2 key for the zone photo")
    voice: Optional[Voice] = None
    mood: Mood = Field(...)
    trigger_type: TriggerType = Field(default=TriggerType.AUTO)


class SaveBlockResponse(BaseModel):
    block_id: str
    sequence: int


class EndTourRequest(BaseModel):
    """POST /api/end-tour"""
    tour_id: str
    total_distance_m: Optional[int] = Field(None, ge=0)
    duration_sec: Optional[int] = Field(None, ge=0)


class EndTourResponse(BaseModel):
    tour_id: str
    title: str
    blocks_visited: int
    total_distance_m: Optional[int] = None
    duration_sec: Optional[int] = None
    mood: str


class TourSummary(BaseModel):
    """One entry in GET /api/tours"""
    tour_id: str
    title: str
    mood: str
    city: Optional[str] = None
    blocks_visited: int
    total_distance_m: Optional[int] = None
    duration_sec: Optional[int] = None
    created_at: str


# =============================================================================
# Routes — publish, discover, replay, rate
# =============================================================================

class PublishTourRequest(BaseModel):
    """POST /api/publish-tour"""
    tour_id: str
    is_public: bool
    title: Optional[str] = Field(None, max_length=200)


class PublishTourResponse(BaseModel):
    tour_id: str
    is_public: bool
    title: str


class TourBlockDetail(BaseModel):
    block_id: str
    sequence: int
    street_name: str
    neighborhood: str
    lat: float
    lng: float
    narration_text: str
    audio_url: Optional[str] = None
    image_url: Optional[str] = None
    voice: str
    mood: str


class TourDetailResponse(BaseModel):
    """GET /api/tours/{tour_id} — full tour + ordered blocks, for replay."""
    tour_id: str
    title: str
    mood: str
    tour_type: str
    city: Optional[str] = None
    avg_rating: float
    rating_count: int
    blocks_visited: int
    total_distance_m: Optional[int] = None
    duration_sec: Optional[int] = None
    is_own_tour: bool
    is_anonymous: bool
    creator_display_name: Optional[str] = None
    creator_avatar_url: Optional[str] = None
    created_at: str
    blocks: List[TourBlockDetail]
    like_count: int = 0
    liked_by_me: bool = False


class NearbyRouteSummary(BaseModel):
    """One entry in GET /api/routes/nearby"""
    tour_id: str
    title: str
    mood: str
    tour_type: str
    city: Optional[str] = None
    avg_rating: float
    rating_count: int
    blocks_visited: int
    total_distance_m: Optional[int] = None
    duration_sec: Optional[int] = None
    is_anonymous: bool
    content_safety_on: bool
    creator_display_name: Optional[str] = None
    creator_avatar_url: Optional[str] = None
    distance_m: float
    created_at: str
    lat: float
    lng: float


class RateTourRequest(BaseModel):
    """POST /api/rate-tour"""
    tour_id: str
    score: int = Field(..., ge=1, le=5)


class RateTourResponse(BaseModel):
    tour_id: str
    score: int
    avg_rating: float
    rating_count: int


# =============================================================================
# User settings (Week 2)
# =============================================================================

class UserSettingsResponse(BaseModel):
    preferred_voice: str = "neutral"
    content_safety: bool = False
    anonymous_default: bool = False
    display_name: str = ""
    # Read-only — never accepted on UpdateSettingsRequest. A user must not
    # be able to grant themselves premium by PATCHing their own settings;
    # this flag is only ever written server-side.
    is_premium: bool = False


class UpdateSettingsRequest(BaseModel):
    """PATCH /api/user/settings — all fields optional"""
    preferred_voice: Optional[Voice] = None
    content_safety: Optional[bool] = None
    anonymous_default: Optional[bool] = None
    display_name: Optional[str] = Field(None, max_length=50)


class UserStatsResponse(BaseModel):
    """GET /api/user/stats — used to compute gamification badges client-side"""
    tours_completed: int = 0
    total_distance_m: int = 0
    cities_visited: int = 0


class VoiceSampleResponse(BaseModel):
    """GET /api/voices/sample"""
    voice: str
    audio_url: str


# =============================================================================
# Data richness signal
# =============================================================================

class RichnessResponse(BaseModel):
    """GET /api/richness"""
    tier: str
    city: str
    message: str


# =============================================================================
# Social — comments and likes
# =============================================================================

class CreateCommentRequest(BaseModel):
    """POST /api/tours/{tour_id}/comments"""
    body: str = Field(..., min_length=1, max_length=500)
    is_anonymous: bool = False


class CommentResponse(BaseModel):
    comment_id: str
    tour_id: str
    body: str
    is_anonymous: bool
    display_name: Optional[str] = None
    created_at: str


class LikeResponse(BaseModel):
    """POST /api/tours/{tour_id}/like"""
    tour_id: str
    liked: bool
    like_count: int


# =============================================================================
# Common
# =============================================================================

class ErrorResponse(BaseModel):
    error: str
    code: str
    retry: bool = False


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str = "0.1.0"
    environment: str = "development"