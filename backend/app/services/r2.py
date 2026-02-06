"""
Cloudflare R2 audio storage service.

R2 is where we store the generated MP3 files. It's S3-compatible, so we use
boto3 (the AWS SDK) to talk to it. The key difference from S3: zero egress fees.
Users can stream audio as much as they want and it costs us nothing.

File organization in the bucket:
    audio/{geo_hash}/{mood}/{safety}/{voice}.mp3

Example:
    audio/9q8yyk8/haunted/off/dramatic.mp3

This key structure means:
- Same zone + mood + safety + voice = same file (natural deduplication)
- Easy to browse/debug in the Cloudflare dashboard
- Easy to bulk-delete expired files
"""

import logging
import boto3
from botocore.config import Config

from app.config import settings

logger = logging.getLogger(__name__)

# Create the S3 client pointing at Cloudflare R2.
# We reuse this client across requests — boto3 handles connection pooling.
_s3_client = None


def _get_s3_client():
    """
    Lazy-initialize the S3 client for R2.

    We do this lazily (not at import time) because the config module needs
    to load environment variables first, and during testing we might want
    to mock this.
    """
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client(
            "s3",
            endpoint_url=f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
            aws_access_key_id=settings.R2_ACCESS_KEY_ID,
            aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
            config=Config(
                signature_version="s3v4",
                region_name="auto",
            ),
        )
    return _s3_client


def build_r2_key(geo_hash: str, mood: str, content_safety: bool, voice: str) -> str:
    """
    Build the R2 object key for an audio file.

    This is deterministic — the same inputs always produce the same key.
    That means if two users request the same narration, they'll get the same
    file without any extra logic.

    Args:
        geo_hash: Geohash of the location (precision 7, e.g., "9q8yyk8")
        mood: "informative", "haunted", "celebrity", "curiosities"
        content_safety: True = mature content, False = family-friendly
        voice: "neutral", "dramatic", "warm"

    Returns:
        R2 object key, e.g., "audio/9q8yyk8/haunted/off/dramatic.mp3"
    """
    safety_str = "on" if content_safety else "off"
    return f"audio/{geo_hash}/{mood}/{safety_str}/{voice}.mp3"


async def upload_audio(audio_bytes: bytes, r2_key: str) -> bool:
    """
    Upload an MP3 file to R2.

    Args:
        audio_bytes: The raw MP3 data from Google TTS.
        r2_key: The object key (from build_r2_key).

    Returns:
        True if upload succeeded, False otherwise.
    """
    try:
        client = _get_s3_client()
        client.put_object(
            Bucket=settings.R2_BUCKET_NAME,
            Key=r2_key,
            Body=audio_bytes,
            ContentType="audio/mpeg",
        )
        logger.info(f"Uploaded audio to R2: {r2_key} ({len(audio_bytes)} bytes)")
        return True

    except Exception as e:
        logger.error(f"R2 upload failed for {r2_key}: {e}")
        return False


def generate_signed_url(r2_key: str, expires_in: int = 3600):
    """
    Generate a pre-signed URL for streaming an audio file.

    The URL is valid for `expires_in` seconds (default: 1 hour). After that,
    the client needs to request a new one. This prevents permanent hotlinks
    and ensures only authenticated users (who can call our API) get audio.

    Args:
        r2_key: The R2 object key.
        expires_in: URL validity in seconds. Default 3600 (1 hour).

    Returns:
        The pre-signed URL string, or None if generation failed.
    """
    try:
        client = _get_s3_client()
        url = client.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": settings.R2_BUCKET_NAME,
                "Key": r2_key,
            },
            ExpiresIn=expires_in,
        )
        return url

    except Exception as e:
        logger.error(f"Failed to generate signed URL for {r2_key}: {e}")
        return None


async def check_audio_exists(r2_key: str) -> bool:
    """
    Check if an audio file already exists in R2.

    Used to skip TTS generation if we already have the audio cached.
    This is a HEAD request — fast and cheap.
    """
    try:
        client = _get_s3_client()
        client.head_object(
            Bucket=settings.R2_BUCKET_NAME,
            Key=r2_key,
        )
        return True

    except client.exceptions.ClientError:
        # 404 = doesn't exist, which is expected for uncached audio
        return False
    except Exception as e:
        logger.error(f"R2 head_object failed for {r2_key}: {e}")
        return False