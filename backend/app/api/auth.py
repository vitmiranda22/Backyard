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
            detail={
                "error": "Missing or invalid Authorization header. Expected: Bearer <token>",
                "code": "missing_token",
                "retry": False,
            },
        )

    token = auth_header.split(" ", 1)[1]

    try:
        # Get the signing key from JWKS
        jwks_client = _get_jwks_client()
        signing_key = jwks_client.get_signing_key_from_jwt(token)

        # Decode and verify the token. Pinned to ES256 only — the signing
        # key comes from a JWKS endpoint (asymmetric keys), so also
        # accepting HS256 here would open the door to an algorithm-
        # confusion attack (an attacker crafting a token with alg=HS256
        # and trying to get the public EC key treated as an HMAC secret).
        payload = pyjwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256"],
            audience="authenticated",
        )

        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=401,
                detail={"error": "Token missing user ID", "code": "invalid_token", "retry": False},
            )

        return user_id

    except HTTPException:
        raise
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=401,
            detail={"error": "Token expired. Please sign in again.", "code": "token_expired", "retry": False},
        )
    except pyjwt.InvalidTokenError as e:
        logger.warning(f"JWT validation failed: {e}")
        raise HTTPException(
            status_code=401,
            detail={"error": "Invalid or expired token. Please sign in again.", "code": "invalid_token", "retry": False},
        )
    except Exception as e:
        logger.error(f"Auth error: {e}")
        raise HTTPException(
            status_code=401,
            detail={"error": "Authentication failed.", "code": "auth_failed", "retry": False},
        )


# Type alias for cleaner endpoint signatures
AuthenticatedUser = Annotated[str, Depends(get_current_user_id)]