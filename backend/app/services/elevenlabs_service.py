"""
ElevenLabs TTS — currently powers only preview samples (the generic
"Signature" voice sample, and now a per-mood preview so a walker can hear
each mood's distinct voice before picking one), not real tour narration.
ElevenLabs bills per character and costs meaningfully more than Google TTS
at scale, so wiring it into full narration needs usage caps designed first
— until then, "signature" is deliberately excluded from the Voice enum in
app/models/schemas.py so it can never be set as a user's preferred
narration voice, and MOOD_VOICE_IDS below is only ever used for a cached
preview clip, never for actual per-block narration audio.
"""

import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"

# One ElevenLabs voice per mood, picked by hand from the voice library —
# these are just identifiers, not secrets, so (unlike ELEVENLABS_API_KEY)
# they live in code rather than env vars, same reasoning as tts.py's
# VOICE_MAP for Google TTS.
MOOD_VOICE_IDS = {
    "time_machine": "lWDDHwXsJXJM7nv2YgHY",
    "hidden_city": "g14YnDYCsy3k7XLlcKlO",
    "dark_side": "IRHApOXLvnW57QJPQH2P",
    "behind_scenes": "yj30vwTGJxSHezdAGsv9",
    "unfiltered": "vSjOBQp24DUB2COr2xI9",
}


async def _synthesize(text: str, voice_id: str):
    """
    Shared ElevenLabs call. Returns None (rather than raising) on any
    failure — callers already treat a None return as "couldn't generate
    a sample right now", same as the Google TTS path.
    """
    if not settings.ELEVENLABS_API_KEY or not voice_id:
        return None

    url = ELEVENLABS_TTS_URL.format(voice_id=voice_id)

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

        logger.info(f"Generated ElevenLabs audio: {len(audio_bytes)} bytes (voice_id={voice_id})")
        return audio_bytes

    except Exception as e:
        logger.error(f"ElevenLabs synthesis failed: {e}")
        return None


async def synthesize_speech(text: str):
    """
    Convert text to MP3 audio via ElevenLabs, using the single generic
    "Signature" voice (ELEVENLABS_VOICE_ID) — the existing preview-only
    voice preset, unrelated to mood.
    """
    return await _synthesize(text, settings.ELEVENLABS_VOICE_ID)


async def synthesize_mood_preview(text: str, mood: str):
    """
    Convert text to MP3 audio via ElevenLabs, using that mood's own voice
    (MOOD_VOICE_IDS) — lets a walker hear a mood's distinct voice in the
    mood picker before choosing it. Returns None for an unrecognized mood.
    """
    return await _synthesize(text, MOOD_VOICE_IDS.get(mood))
