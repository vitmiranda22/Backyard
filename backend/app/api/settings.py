"""
User settings endpoints.

  GET   /api/user/settings  — Get current user preferences
  PATCH /api/user/settings  — Update user preferences
"""

import logging

from fastapi import APIRouter, HTTPException

from app.api.auth import AuthenticatedUser
from app.models.schemas import (
    UserSettingsResponse,
    UpdateSettingsRequest,
    ErrorResponse,
)
from app.services import supabase_db

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "/user/settings",
    response_model=UserSettingsResponse,
    responses={404: {"model": ErrorResponse}},
    summary="Get current user settings",
)
async def get_settings(user_id: AuthenticatedUser):
    """
    Returns the user's current preferences:
    voice, content safety, anonymous default, display name.
    """
    user = await supabase_db.get_user_settings(user_id)

    if not user:
        raise HTTPException(
            status_code=404,
            detail={
                "error": "User not found.",
                "code": "user_not_found",
                "retry": False,
            },
        )

    return UserSettingsResponse(
        preferred_voice=user.get("preferred_voice", "neutral"),
        content_safety=user.get("content_safety", False),
        anonymous_default=user.get("anonymous_default", False),
        display_name=user.get("display_name", ""),
    )


@router.patch(
    "/user/settings",
    response_model=UserSettingsResponse,
    responses={
        404: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    },
    summary="Update user settings",
)
async def update_settings(
    request: UpdateSettingsRequest,
    user_id: AuthenticatedUser,
):
    """
    Update one or more user preferences.
    Only fields included in the request body are updated.
    """
    # Build update dict from only the fields that were provided
    updates = {}
    if request.preferred_voice is not None:
        updates["preferred_voice"] = request.preferred_voice.value
    if request.content_safety is not None:
        updates["content_safety"] = request.content_safety
    if request.anonymous_default is not None:
        updates["anonymous_default"] = request.anonymous_default
    if request.display_name is not None:
        updates["display_name"] = request.display_name.strip()[:50]

    if not updates:
        # Nothing to update — just return current settings
        return await get_settings(user_id)

    logger.info(f"Updating settings for user={user_id[:8]}...: {list(updates.keys())}")

    updated = await supabase_db.update_user_settings(user_id, updates)

    if not updated:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Failed to update settings.",
                "code": "settings_update_failed",
                "retry": True,
            },
        )

    return UserSettingsResponse(
        preferred_voice=updated.get("preferred_voice", "neutral"),
        content_safety=updated.get("content_safety", False),
        anonymous_default=updated.get("anonymous_default", False),
        display_name=updated.get("display_name", ""),
    )