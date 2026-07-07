"""
Gemini AI narration generation service.

Takes a location, mood, and zone data, then asks Gemini 2.5 Flash
(with Google Search Grounding) to generate a compelling narration.

Zone data from 23 sources is fed directly into the prompt so Gemini
uses REAL facts about the location instead of generic filler.
"""

import logging
from google import genai
from google.genai.types import Tool, GoogleSearch, GenerateContentConfig

from app.config import settings
from app.core.prompts import build_prompt, build_connector_prompt

logger = logging.getLogger(__name__)

client = genai.Client(api_key=settings.GEMINI_API_KEY)

MODEL = "gemini-2.5-flash"
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

    Args:
        street: Street name from reverse geocoding
        neighborhood: Neighborhood name
        city: City name
        country: Country name
        mood: One of "time_machine", "hidden_city", "dark_side", "behind_scenes", "unfiltered"
        content_safety: True = allow mature content, False = family-friendly
        zone_data: Formatted string of zone data from 23 sources

    Returns:
        The narration text (150-225 words, ready for TTS), or None if generation failed.
    """
    system_prompt = build_prompt(
        street=street,
        neighborhood=neighborhood,
        city=city,
        country=country,
        mood=mood,
        content_safety=content_safety,
        zone_data=zone_data,
    )

    user_message = (
        f"Generate a {mood} narration for someone at "
        f"{street}, {neighborhood}, {city}. "
        f"You MUST use at least 3 specific facts from the zone data provided. "
        f"Do NOT start with a rhetorical question. "
        f"Start with a specific year, detail, or observation. "
        f"Use Google Search to find additional real facts about this exact location. "
        f"60-90 seconds of spoken audio."
    )

    try:
        google_search_tool = Tool(google_search=GoogleSearch())

        # DEBUG: Log what we're sending to Gemini
        logger.info(f"=== GEMINI CALL ===")
        logger.info(f"PROMPT FIRST 300 CHARS: {system_prompt[:300]}")
        logger.info(f"ZONE DATA IN PROMPT: {'YES' if zone_data and len(zone_data) > 50 else 'NO/EMPTY'}")
        logger.info(f"ZONE DATA LENGTH: {len(zone_data) if zone_data else 0} chars")
        logger.info(f"USER MESSAGE: {user_message}")

        response = client.models.generate_content(
            model=MODEL,
            contents=user_message,
            config=GenerateContentConfig(
                system_instruction=system_prompt,
                tools=[google_search_tool],
                temperature=0.8,
                # Gemini 2.5 Flash spends part of this budget on internal
                # "thinking" and search-grounding tool calls before writing
                # the actual narration — 1024 was letting that eat the whole
                # budget and cut the narration off mid-sentence. This SDK
                # version (google-genai 1.5.0) doesn't expose a separate
                # thinking-budget knob, so the fix is just more headroom.
                max_output_tokens=4096,
            ),
        )

        narration = None
        try:
            narration = response.text
        except Exception:
            pass

        if not narration and response.candidates:
            parts = response.candidates[0].content.parts
            text_parts = [p.text for p in parts if hasattr(p, 'text') and p.text]
            if text_parts:
                narration = " ".join(text_parts)

        logger.info(f"Gemini narration length: {len(narration) if narration else 0} chars")
        logger.info(f"Gemini narration preview: {narration[:300] if narration else 'EMPTY'}...")

        if not narration or len(narration) < 20:
            logger.warning(f"Gemini returned empty or too-short narration for {street}")
            return None

        if len(narration) > 5000:
            narration = narration[:5000]

        return narration

    except Exception as e:
        logger.error(f"Gemini generation failed for {street}: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return None


async def generate_connector(
    prior_summary: str,
    mood: str,
    current_narration: str,
) -> tuple:
    """
    Generate a short transition line connecting this block to the tour's
    running story, plus an updated rolling summary for the next block.

    Deliberately no search grounding and a small token budget — this is a
    cheap, tour-scoped call, not a replacement for the main narration call.

    Returns:
        (connector_text, updated_summary). connector_text is None if
        generation/parsing failed — callers should skip stitching in that
        case but can still persist updated_summary (falls back to a
        truncated version of current_narration) so future blocks keep
        building continuity.
    """
    prompt = build_connector_prompt(
        prior_summary=prior_summary,
        mood=mood,
        current_narration=current_narration,
    )
    fallback_summary = current_narration[:200]

    try:
        response = client.models.generate_content(
            model=MODEL,
            contents=prompt,
            config=GenerateContentConfig(
                temperature=0.8,
                # Same headroom issue as the main narration call — Gemini 2.5
                # Flash spends part of this budget on internal "thinking"
                # before writing output, independent of how short the final
                # text is, and that thinking budget varies call to call.
                # 300 got eaten entirely; 1024 still clipped some responses
                # mid-word. Unused budget costs nothing, so be generous.
                max_output_tokens=2048,
            ),
        )

        text = None
        try:
            text = response.text
        except Exception:
            pass

        if not text and response.candidates:
            parts = response.candidates[0].content.parts
            text_parts = [p.text for p in parts if hasattr(p, "text") and p.text]
            if text_parts:
                text = "".join(text_parts)

        text = text or ""
        transition = None
        summary = None

        # Find both markers by position rather than parsing line-by-line —
        # the model doesn't always keep each field on a single line, and a
        # per-line parse silently drops any wrapped continuation.
        upper_text = text.upper()
        t_idx = upper_text.find("TRANSITION:")
        s_idx = upper_text.find("SUMMARY:")

        if t_idx != -1 and s_idx != -1 and s_idx > t_idx:
            transition = text[t_idx + len("TRANSITION:"):s_idx].strip()
            summary = text[s_idx + len("SUMMARY:"):].strip()
        elif t_idx != -1:
            transition = text[t_idx + len("TRANSITION:"):].strip()

        if not transition:
            logger.warning("Connector generation returned no parseable TRANSITION line")
            return None, summary or fallback_summary

        return transition, summary or fallback_summary

    except Exception as e:
        logger.error(f"Connector generation failed: {e}")
        return None, fallback_summary