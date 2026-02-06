"""
Authentication middleware for FastAPI.

Validates Supabase JWT tokens on incoming requests. Uses PyJWT with
cryptography backend for proper ES256 (ECDSA) support.

Supabase newer projects sign JWTs with ES256 (asymmetric keys).
We fetch the public key from Supabase's JWKS endpoint and cache it.
"""

import logging
import httpx
from typing import Annotated

from fastapi import Depends, HTTPException, Request
import jwt as pyjwt
from jwt import PyJWKClient

from app.config import settings

logger = logging.getLogger(__name__)

# PyJWKClient fetches and caches JWKS keys automatically
_jwks_client = None


def _get_jwks_client():
    global _jwks_client
    if _jwks_client is None:
        jwks_url = f"{settings.SUPABASE_URL}/auth/v1/.well-known/jwks.json"
        _jwks_client = PyJWKClient(jwks_url)
    return _jwks_client


async def get_current_user_id(request: Request) -> str:
    """
    FastAPI dependency that extracts and validates the user ID from a JWT.

    Raises:
        HTTPException(401) if the token is missing, invalid, or expired.
    """
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Missing or invalid Authorization header. Expected: Bearer <token>",
        )

    token = auth_header.split(" ", 1)[1]

    try:
        # Get the signing key from JWKS
        jwks_client = _get_jwks_client()
        signing_key = jwks_client.get_signing_key_from_jwt(token)

        # Decode and verify the token
        payload = pyjwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256", "HS256"],
            audience="authenticated",
        )

        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Token missing user ID")

        return user_id

    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired. Please sign in again.")
    except pyjwt.InvalidTokenError as e:
        logger.warning(f"JWT validation failed: {e}")
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token. Please sign in again.",
        )
    except Exception as e:
        logger.error(f"Auth error: {e}")
        raise HTTPException(status_code=401, detail="Authentication failed.")


# Type alias for cleaner endpoint signatures
AuthenticatedUser = Annotated[str, Depends(get_current_user_id)]