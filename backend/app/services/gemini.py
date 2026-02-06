"""
Gemini AI narration generation service.

This is the creative brain of WanderVox. It takes a location and mood,
then asks Gemini 2.5 Flash (with Google Search Grounding enabled) to
generate a compelling narration.

The search grounding is critical — it means Gemini searches the web IN REAL TIME
for information about the location. We don't need to pre-build a database of
every street in the world. Gemini does the research for us.

In Week 3, we'll also feed it city open data (DataSF) for even richer narrations.
For now, it relies on its training data + live web search.
"""

import logging
from google import genai
from google.genai.types import Tool, GoogleSearch, GenerateContentConfig

from app.config import settings
from app.core.prompts import build_prompt

logger = logging.getLogger(__name__)

# Initialize the Gemini client once at module level.
# This is reused across all requests — no need to create a new client each time.
client = genai.Client(api_key=settings.GEMINI_API_KEY)

# The model we're using. Flash is the fast, cheap one — perfect for narrations.
MODEL = "gemini-2.5-flash"

# Maximum time to wait for Gemini to respond. Narrations take a few seconds
# because of the search grounding (Gemini is literally searching Google).
TIMEOUT_SECONDS = 15


async def generate_narration(
    street: str,
    neighborhood: str,
    city: str,
    country: str,
    mood: str,
    content_safety: bool,
    zone_data: str = None,
) -> str:
    """
    Generate a narration for a specific location and mood.

    Uses Gemini 2.5 Flash with Google Search Grounding to produce a 60-90 second
    spoken narration. The AI searches the web in real time for facts about
    the location, then weaves them into a story matching the requested mood.

    Args:
        street: Street name from reverse geocoding
        neighborhood: Neighborhood name
        city: City name
        country: Country name
        mood: One of "informative", "haunted", "celebrity", "curiosities"
        content_safety: True = allow mature content, False = family-friendly
        zone_data: Optional JSON string of pre-fetched city data (Week 3+)

    Returns:
        The narration text (150-225 words, ready for TTS), or None if generation failed.
    """
    # Build the prompt from our templates
    system_prompt = build_prompt(
        street=street,
        neighborhood=neighborhood,
        city=city,
        country=country,
        mood=mood,
        content_safety=content_safety,
        zone_data=zone_data,
    )

    # The user message is simple — the system prompt does the heavy lifting.
    user_message = (
        f"Generate a {mood} tour narration for this location. "
        f"Use Google Search to find real, verifiable facts about "
        f"{street}, {neighborhood}, {city}. "
        f"Remember: 60-90 seconds of spoken audio, conversational tone, "
        f"end with a teaser about the next block."
    )

    try:
        # Enable Google Search grounding — this is the magic.
        google_search_tool = Tool(google_search=GoogleSearch())

        response = client.models.generate_content(
            model=MODEL,
            contents=user_message,
            config=GenerateContentConfig(
                system_instruction=system_prompt,
                tools=[google_search_tool],
                temperature=0.8,
                max_output_tokens=1024,
            ),
        )

        # Extract the text — handle various response formats
        narration = None
        try:
            narration = response.text
        except Exception:
            pass

        # If .text failed, try extracting from parts
        if not narration and response.candidates:
            parts = response.candidates[0].content.parts
            text_parts = [p.text for p in parts if hasattr(p, 'text') and p.text]
            if text_parts:
                narration = " ".join(text_parts)

        logger.info(f"Gemini raw response type: {type(response)}")
        logger.info(f"Gemini narration length: {len(narration) if narration else 0} chars")
        logger.info(f"Gemini narration preview: {narration[:200] if narration else 'EMPTY'}...")

        if not narration or len(narration) < 20:
            logger.warning(f"Gemini returned empty or too-short narration for {street}")
            return None

        # Basic sanity check: narration should be within expected range
        if len(narration) > 5000:
            logger.warning(f"Gemini narration too long ({len(narration)} chars), truncating")
            narration = narration[:5000]

        logger.info(
            f"Generated narration for {street}, {neighborhood} "
            f"({mood}, safety={'on' if content_safety else 'off'}): "
            f"{len(narration)} chars"
        )
        return narration

    except Exception as e:
        logger.error(f"Gemini generation failed for {street}: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return None