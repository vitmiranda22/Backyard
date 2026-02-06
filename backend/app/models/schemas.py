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
    INFORMATIVE = "informative"
    HAUNTED = "haunted"
    CELEBRITY = "celebrity"
    CURIOSITIES = "curiosities"


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
    mood: Mood = Field(..., examples=["haunted"])
    content_safety: bool = Field(default=False)
    trigger_type: TriggerType = Field(default=TriggerType.AUTO)
    voice: Voice = Field(default=Voice.NEUTRAL)


class NarrationHighlight(BaseModel):
    source: str
    detail: str


class ZoneDataUsed(BaseModel):
    sources_hit: List[str] = Field(default_factory=list)
    highlights: List[NarrationHighlight] = Field(default_factory=list)


class NarrateBlockResponse(BaseModel):
    """Response from /api/narrate-block"""
    street_name: str
    neighborhood: str
    city: str
    narration_text: str
    audio_url: Optional[str] = None
    audio_duration_ms: Optional[int] = None
    mood: Mood
    content_safety_applied: bool
    cached: bool
    zone_data_used: Optional[ZoneDataUsed] = None


# =============================================================================
# Tour session endpoints (Week 2)
# =============================================================================

class StartTourRequest(BaseModel):
    """POST /api/start-tour"""
    mood: Mood = Field(..., examples=["haunted"])
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
    narration_text: str = Field(..., description="The AI-generated narration text")
    audio_r2_key: Optional[str] = Field(None, description="R2 key for the audio file")
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


# =============================================================================
# User settings (Week 2)
# =============================================================================

class UserSettingsResponse(BaseModel):
    preferred_voice: str = "neutral"
    content_safety: bool = False
    anonymous_default: bool = False
    display_name: str = ""


class UpdateSettingsRequest(BaseModel):
    """PATCH /api/user/settings — all fields optional"""
    preferred_voice: Optional[Voice] = None
    content_safety: Optional[bool] = None
    anonymous_default: Optional[bool] = None
    display_name: Optional[str] = Field(None, max_length=50)


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