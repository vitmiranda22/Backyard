"""
Health check endpoint.

Used by monitoring tools, load balancers, and you (the developer) to verify
the API is running. Also useful to confirm your deployment worked.

GET /health → {"status": "ok", "version": "0.1.0", "environment": "development"}
"""

from fastapi import APIRouter
from app.models.schemas import HealthResponse
from app.config import settings

router = APIRouter()


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Check if the API is alive",
)
async def health_check():
    return HealthResponse(
        status="ok",
        version="0.1.0",
        environment=settings.ENVIRONMENT,
    )
