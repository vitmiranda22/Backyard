"""
Text-to-Speech service using Google Cloud TTS.

Converts narration text → MP3 audio bytes. The audio is then uploaded to
Cloudflare R2 and served to the client via a signed URL.

We use Journey voices — they're Google's newest, most natural-sounding voices.
Each of our three voice presets maps to a different Journey voice:

  neutral  → en-US-Journey-D  (calm, measured, documentary narrator)
  dramatic → en-US-Journey-F  (deeper, suspenseful, storyteller)
  warm     → en-US-Journey-O  (friendly, enthusiastic, conversational)

The free tier gives us 1M characters/month. A 90-second narration is about
2,000 characters, so we get ~500 narrations/month for free. With caching,
the same narration+voice combo is generated ONCE and then served from R2
forever (until the 30-day cache expires).
"""

import logging
from google.cloud import texttospeech

from app.config import settings

logger = logging.getLogger(__name__)

# Map our voice presets to Google TTS voice names.
# You can preview these at https://cloud.google.com/text-to-speech#demo
VOICE_MAP = {
    "neutral": "en-US-Journey-D",
    "dramatic": "en-US-Journey-F",
    "warm": "en-US-Journey-O",
}

# If Journey voices aren't available, fall back to WaveNet (still good quality)
VOICE_FALLBACK_MAP = {
    "neutral": "en-US-Wavenet-D",
    "dramatic": "en-US-Wavenet-A",
    "warm": "en-US-Wavenet-F",
}


def _get_tts_client():
    """
    Create a Google Cloud TTS client.

    We use the REST transport with an API key (simpler than service account auth).
    The API key was created in the Google Cloud Console and restricted to
    the Text-to-Speech API only.
    """
    return texttospeech.TextToSpeechClient(
        client_options={"api_key": settings.GOOGLE_TTS_API_KEY}
    )


async def synthesize_speech(text: str, voice: str = "neutral"):
    """
    Convert text to MP3 audio.

    Args:
        text: The narration text to speak. Should be 150-225 words.
        voice: One of "neutral", "dramatic", "warm".

    Returns:
        MP3 audio as bytes, or None if synthesis failed.
        A 90-second narration produces roughly 1.5MB of MP3 data.
    """
    voice_name = VOICE_MAP.get(voice, VOICE_MAP["neutral"])

    try:
        client = _get_tts_client()

        # Configure what we want to say
        synthesis_input = texttospeech.SynthesisInput(text=text)

        # Configure the voice
        voice_config = texttospeech.VoiceSelectionParams(
            language_code="en-US",
            name=voice_name,
        )

        # Configure the audio output
        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3,
            # Speaking rate: slightly slower for dramatic, slightly faster for warm
            speaking_rate=_get_speaking_rate(voice),
            # Pitch: deeper for dramatic, higher for warm
            pitch=_get_pitch(voice),
        )

        # Make the API call
        response = client.synthesize_speech(
            input=synthesis_input,
            voice=voice_config,
            audio_config=audio_config,
        )

        audio_bytes = response.audio_content

        if not audio_bytes:
            logger.warning("Google TTS returned empty audio")
            return None

        logger.info(
            f"Generated TTS audio: {len(audio_bytes)} bytes, "
            f"voice={voice_name}"
        )
        return audio_bytes

    except Exception as e:
        logger.error(f"Google TTS synthesis failed: {e}")

        # Try fallback voice if the primary failed
        fallback_name = VOICE_FALLBACK_MAP.get(voice)
        if fallback_name and fallback_name != voice_name:
            logger.info(f"Trying fallback voice: {fallback_name}")
            try:
                voice_config = texttospeech.VoiceSelectionParams(
                    language_code="en-US",
                    name=fallback_name,
                )
                response = client.synthesize_speech(
                    input=synthesis_input,
                    voice=voice_config,
                    audio_config=audio_config,
                )
                return response.audio_content
            except Exception as e2:
                logger.error(f"Fallback TTS also failed: {e2}")

        return None


def _get_speaking_rate(voice: str) -> float:
    """
    Adjust speaking rate per voice preset.

    Dramatic narrations sound better slower. Warm ones sound better with energy.
    These are subtle adjustments — the Journey voices are already expressive.
    """
    rates = {
        "neutral": 1.0,    # Default speed
        "dramatic": 0.92,  # Slightly slower for suspense
        "warm": 1.05,      # Slightly faster for energy
    }
    return rates.get(voice, 1.0)


def _get_pitch(voice: str) -> float:
    """
    Adjust pitch per voice preset.

    Values are in semitones: -20 to +20. 0 is default.
    We use very subtle adjustments — the voice selection already does most of the work.
    """
    pitches = {
        "neutral": 0.0,
        "dramatic": -1.0,  # Slightly deeper
        "warm": 0.5,       # Slightly brighter
    }
    return pitches.get(voice, 0.0)


def estimate_duration_ms(text: str, voice: str = "neutral") -> int:
    """
    Estimate audio duration from text length.

    Average speaking rate is ~150 words per minute. We adjust based on voice preset.
    This is a rough estimate — the actual duration depends on the TTS engine.
    Used for the audio_duration_ms field in the API response.
    """
    word_count = len(text.split())
    rate = _get_speaking_rate(voice)
    # Words per second, adjusted by speaking rate
    wps = (150 / 60) * rate
    duration_seconds = word_count / wps
    return int(duration_seconds * 1000)