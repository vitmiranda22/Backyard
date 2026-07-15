"""
Cloudflare R2 audio storage service.

R2 is where we store the generated MP3 files. It's S3-compatible, so we use
boto3 (the AWS SDK) to talk to it. The key difference from S3: zero egress fees.
Users can stream audio as much as they want and it costs us nothing.

File organization in the bucket:
    audio/{geo_hash}/{mood}/{safety}/{voice}.mp3

Example:
    audio/9q8yyk8/dark_side/off/dramatic.mp3

This key structure means:
- Same zone + mood + safety + voice = same file (natural deduplication)
- Easy to browse/debug in the Cloudflare dashboard
- Easy to bulk-delete expired files
"""

import asyncio
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
        mood: "time_machine", "hidden_city", "dark_side", "behind_scenes", "unfiltered"
        content_safety: True = mature content, False = family-friendly
        voice: "neutral", "dramatic", "warm"

    Returns:
        R2 object key, e.g., "audio/9q8yyk8/dark_side/off/dramatic.mp3"
    """
    safety_str = "on" if content_safety else "off"
    return f"audio/{geo_hash}/{mood}/{safety_str}/{voice}.mp3"


def build_tour_r2_key(tour_id: str, geo_hash: str, content_safety: bool, voice: str) -> str:
    """
    Build the R2 object key for a block whose audio includes a tour-specific
    continuity transition (see narrate.py's connector step).

    This audio is stitched from this exact tour's running narrative summary,
    so it can never be reused by a different tour at the same geohash — it
    lives at its own key instead of the shared `build_r2_key()` path, and is
    intentionally not tracked in narration_cache/audio_files.

    Returns:
        R2 object key, e.g. "audio/tours/3f9a.../9q8yyk8/off/dramatic.mp3"
    """
    safety_str = "on" if content_safety else "off"
    return f"audio/tours/{tour_id}/{geo_hash}/{safety_str}/{voice}.mp3"


def build_question_r2_key(tour_id: str, question_id: str) -> str:
    """
    Build the R2 object key for a spoken answer to a voice question.

    Every question gets a unique answer — there's nothing to deduplicate
    across users/tours the way narration is, so this just needs to be
    unique, not deterministic like build_r2_key().

    Returns:
        R2 object key, e.g. "audio/questions/3f9a.../a1b2c3d4.mp3"
    """
    return f"audio/questions/{tour_id or 'notour'}/{question_id}.mp3"


def build_image_r2_key(geo_hash: str) -> str:
    """
    Build the R2 object key for a zone's street-level photo.

    One photo per geohash, mood-agnostic — shared across every user/tour
    that ever visits this cell, same caching model as zone_data_cache.

    Returns:
        R2 object key, e.g. "images/9q8yyk8.jpg"
    """
    return f"images/{geo_hash}.jpg"


async def upload_image(image_bytes: bytes, r2_key: str) -> bool:
    """
    Upload a JPEG street-view photo to R2.

    Args:
        image_bytes: The raw JPEG data from the Street View Static API.
        r2_key: The object key (from build_image_r2_key).

    Returns:
        True if upload succeeded, False otherwise.
    """
    try:
        client = _get_s3_client()
        # boto3 is synchronous — offload to a thread so this network call
        # doesn't block the single event loop (see synthesize_speech's
        # docstring for why that matters on this deployment).
        await asyncio.to_thread(
            client.put_object,
            Bucket=settings.R2_BUCKET_NAME,
            Key=r2_key,
            Body=image_bytes,
            ContentType="image/jpeg",
        )
        logger.info(f"Uploaded image to R2: {r2_key} ({len(image_bytes)} bytes)")
        return True

    except Exception as e:
        logger.error(f"R2 image upload failed for {r2_key}: {e}")
        return False


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
        await asyncio.to_thread(
            client.put_object,
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


async def get_bucket_usage() -> dict:
    """
    Total object count + byte size currently stored in the bucket, broken
    down by top-level prefix (audio/images/questions — see this file's
    module docstring for the key layout). Paginates through the full
    listing, so this gets slower as the bucket grows — fine at current
    scale (thousands of objects), worth caching/scheduling if it ever
    becomes a bottleneck for the admin dashboard.
    """
    try:
        client = _get_s3_client()
        by_prefix = {}
        total_objects = 0
        total_bytes = 0
        continuation_token = None

        while True:
            kwargs = {"Bucket": settings.R2_BUCKET_NAME}
            if continuation_token:
                kwargs["ContinuationToken"] = continuation_token
            page = await asyncio.to_thread(client.list_objects_v2, **kwargs)

            for obj in page.get("Contents", []):
                total_objects += 1
                total_bytes += obj["Size"]
                prefix = obj["Key"].split("/")[0] if "/" in obj["Key"] else "other"
                bucket = by_prefix.setdefault(prefix, {"objects": 0, "bytes": 0})
                bucket["objects"] += 1
                bucket["bytes"] += obj["Size"]

            if page.get("IsTruncated"):
                continuation_token = page.get("NextContinuationToken")
            else:
                break

        return {
            "total_objects": total_objects,
            "total_mb": round(total_bytes / (1024 * 1024), 2),
            "by_prefix": {
                k: {"objects": v["objects"], "mb": round(v["bytes"] / (1024 * 1024), 2)}
                for k, v in sorted(by_prefix.items(), key=lambda kv: -kv[1]["bytes"])
            },
        }
    except Exception as e:
        logger.error(f"Failed to get R2 bucket usage: {e}")
        return {"total_objects": None, "total_mb": None, "by_prefix": {}}