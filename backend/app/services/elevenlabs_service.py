"""
ElevenLabs TTS — currently powers only the "Signature" voice's cached
preview sample (see SAMPLE_PHRASES in app/api/settings.py), not real tour
narration. ElevenLabs bills per character and costs meaningfully more than
Google TTS at scale, so wiring it into full narration needs usage caps
designed first — until then, "signature" is deliberately excluded from
the Voice enum in app/models/schemas.py so it can never be set as a
user's preferred narration voice.
"""

import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"


async def synthesize_speech(text: str):
    """
    Convert text to MP3 audio via ElevenLabs.

    Returns None (rather than raising) if ElevenLabs isn't configured or
    the request fails — callers already treat a None return as "couldn't
    generate a sample right now", same as the Google TTS path.
    """
    if not settings.ELEVENLABS_API_KEY or not settings.ELEVENLABS_VOICE_ID:
        return None

    url = ELEVENLABS_TTS_URL.format(voice_id=settings.ELEVENLABS_VOICE_ID)

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                url,
                headers={
                    "xi-api-key": settings.ELEVENLABS_API_KEY,
                    "Content-Type": "application/json",
                },
                json={
                    "text": text,
                    "model_id": "eleven_multilingual_v2",
                    "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
                },
            )
            response.raise_for_status()
            audio_bytes = response.content

        if not audio_bytes:
            logger.warning("ElevenLabs returned empty audio")
            return None

        logger.info(f"Generated ElevenLabs audio: {len(audio_bytes)} bytes")
        return audio_bytes

    except Exception as e:
        logger.error(f"ElevenLabs synthesis failed: {e}")
        return None
