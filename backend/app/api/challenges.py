"""
Challenges -- a rotating weekly goal.

  GET /api/challenges -- this week's active challenge + the caller's
                          progress toward it + their all-time completed count

No POST -- completion is recorded as a side effect of this GET (see
app/services/challenges.py::get_challenge_progress), never asserted
directly by the client, same shape as Collectible Discoveries.
"""

from fastapi import APIRouter

from app.api.auth import AuthenticatedUser
from app.models.schemas import ChallengeResponse
from app.services import challenges

router = APIRouter()


@router.get(
    "/challenges",
    response_model=ChallengeResponse,
    summary="This week's active challenge and the caller's progress",
)
async def get_challenge(user_id: AuthenticatedUser):
    result = await challenges.get_challenge_progress(user_id)
    return ChallengeResponse(**result)
