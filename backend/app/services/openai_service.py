"""
OpenAI narration generation service.

Takes a location, mood, and zone data, then asks gpt-4.1-mini (with the
Responses API's built-in web_search tool) to generate a compelling narration.

Zone data from 26 sources is fed directly into the prompt so the model
uses REAL facts about the location instead of generic filler.
"""

import logging
import random
import re
from openai import AsyncOpenAI

from app.config import settings
from app.core.prompts import build_prompt, build_connector_prompt, CONNECTOR_OPENER_CATEGORIES

logger = logging.getLogger(__name__)

# AsyncOpenAI, not the sync OpenAI client — this call happens on every
# narration request (with web_search enabled it's the longest-running
# call in the pipeline), and uvicorn runs a single worker here. A sync
# client's blocking call would freeze the whole event loop for its
# duration, including Render's health check — the same class of bug
# fixed in tts.py/r2.py for the TTS/R2 calls.
#
# Explicit timeout — the SDK default is 10 minutes, which is far longer
# than a mobile client will ever wait; a stalled web_search tool call
# shouldn't hang a request that long.
client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY, timeout=45.0)

MODEL = "gpt-4.1-mini"


def _strip_citations(text: str) -> str:
    """
    Remove any markdown-style citations/links the model included despite
    being told not to — a habit it can pick up from the web_search tool's
    citation style (e.g. "([redfin.com](https://...))"). This is spoken
    narration, not a written article with footnotes. Defense in depth
    alongside the prompt instruction, since prompt compliance alone isn't
    guaranteed.
    """
    # A citation fully wrapped in its own parens, e.g. "([redfin.com](https://...))"
    text = re.sub(r"\(\[[^\]]*\]\(https?://[^\)]+\)\)", "", text)
    # A bare markdown link, e.g. "[redfin.com](https://...)" — keep the link text
    text = re.sub(r"\[([^\]]*)\]\(https?://[^\)]+\)", r"\1", text)
    # Collapse any doubled-up whitespace left behind by the removal
    return re.sub(r"[ \t]{2,}", " ", text).strip()


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
        zone_data: Formatted string of zone data from 26 sources

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
        f"Use web search to find additional real facts about this exact location. "
        f"This is a spoken audio script — never include citations, footnotes, "
        f"source names, or markdown links like [text](url) anywhere in your "
        f"response, even when using web search. Write the fact directly as "
        f"spoken narration with no attribution attached. "
        f"60-90 seconds of spoken audio."
    )

    try:
        logger.info(f"=== OPENAI CALL ===")
        logger.info(f"PROMPT FIRST 300 CHARS: {system_prompt[:300]}")
        logger.info(f"ZONE DATA IN PROMPT: {'YES' if zone_data and len(zone_data) > 50 else 'NO/EMPTY'}")
        logger.info(f"ZONE DATA LENGTH: {len(zone_data) if zone_data else 0} chars")
        logger.info(f"USER MESSAGE: {user_message}")

        response = await client.responses.create(
            model=MODEL,
            instructions=system_prompt,
            input=user_message,
            tools=[{"type": "web_search"}],
            temperature=0.8,
            # Same class of issue Gemini had: some of this budget goes to
            # tool-call/reasoning overhead before the model writes the
            # actual narration, and that overhead varies call to call.
            # Unused budget costs nothing, so be generous rather than
            # re-tuning this later.
            max_output_tokens=8192,
        )

        if response.status == "incomplete" and response.incomplete_details and \
                response.incomplete_details.reason == "max_output_tokens":
            logger.warning(
                f"OpenAI narration for {street} ({mood}) hit max_output_tokens — "
                f"output was truncated mid-generation. Consider raising "
                f"max_output_tokens further."
            )

        narration = None
        try:
            narration = response.output_text
        except Exception:
            pass

        if not narration and response.output:
            text_parts = []
            for item in response.output:
                if getattr(item, "type", None) == "message":
                    for part in getattr(item, "content", []):
                        if getattr(part, "text", None):
                            text_parts.append(part.text)
            if text_parts:
                narration = " ".join(text_parts)

        if narration:
            narration = _strip_citations(narration)

        logger.info(f"OpenAI narration length: {len(narration) if narration else 0} chars")
        logger.info(f"OpenAI narration preview: {narration[:300] if narration else 'EMPTY'}...")

        if not narration or len(narration) < 20:
            logger.warning(f"OpenAI returned empty or too-short narration for {street}")
            return None

        if len(narration) > 5000:
            narration = narration[:5000]

        return narration

    except Exception as e:
        logger.error(f"OpenAI generation failed for {street}: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return None


def _pick_opener_category(used_openers: list) -> tuple:
    """
    Shuffle-bag pick: don't repeat any opener category until all of them
    have been used once this tour, then reshuffle. Guards the reshuffle
    boundary itself against a back-to-back repeat by excluding whichever
    category was used most recently from that one pick.

    Returns (chosen_category, new_used_openers_list).
    """
    all_categories = list(CONNECTOR_OPENER_CATEGORIES.keys())
    used_openers = used_openers or []

    available = [c for c in all_categories if c not in used_openers]
    if not available:
        last = used_openers[-1] if used_openers else None
        available = [c for c in all_categories if c != last]
        used_openers = []  # starting a fresh cycle

    chosen = random.choice(available)
    return chosen, used_openers + [chosen]


async def generate_connector(
    prior_summary: str,
    mood: str,
    current_narration: str,
    used_openers: list = None,
    last_transition: str = None,
) -> tuple:
    """
    Generate a short transition line connecting this block to the tour's
    running story, plus an updated rolling summary for the next block.

    Deliberately no search tool and a small-ish token budget — this is a
    cheap, tour-scoped call, not a replacement for the main narration call.

    last_transition (the literal text of the PRIOR block's transition, not
    just its category) is passed back in so the model can avoid repeating
    its own sentence shape even when a different opener category was
    assigned — category alone wasn't enough in testing, since the model
    can converge on the same template under different nominal categories.

    Returns:
        (connector_text, updated_summary, new_used_openers). connector_text
        is None if generation/parsing failed — callers should skip
        stitching in that case but can still persist updated_summary
        (falls back to a truncated version of current_narration) and
        new_used_openers so future blocks keep building continuity and
        the shuffle bag keeps advancing regardless.
    """
    opener_category, new_used_openers = _pick_opener_category(used_openers)
    prompt = build_connector_prompt(
        prior_summary=prior_summary,
        mood=mood,
        current_narration=current_narration,
        opener_category=opener_category,
        last_transition=last_transition,
    )
    fallback_summary = current_narration[:200]

    try:
        response = await client.responses.create(
            model=MODEL,
            input=prompt,
            temperature=0.8,
            max_output_tokens=2048,
        )

        text = None
        try:
            text = response.output_text
        except Exception:
            pass

        if not text and response.output:
            text_parts = []
            for item in response.output:
                if getattr(item, "type", None) == "message":
                    for part in getattr(item, "content", []):
                        if getattr(part, "text", None):
                            text_parts.append(part.text)
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
            return None, summary or fallback_summary, new_used_openers

        return transition, summary or fallback_summary, new_used_openers

    except Exception as e:
        logger.error(f"Connector generation failed: {e}")
        return None, fallback_summary, new_used_openers


async def transcribe_audio(audio_bytes: bytes, filename: str = "question.m4a") -> str:
    """
    Speech-to-text for a recorded voice question, via Whisper.

    Returns the transcribed text, or an empty string if transcription
    failed or produced nothing usable — callers should treat an empty
    result as "couldn't hear that," not raise on it.
    """
    try:
        response = await client.audio.transcriptions.create(
            model="whisper-1",
            file=(filename, audio_bytes),
        )
        return (response.text or "").strip()
    except Exception as e:
        logger.error(f"Whisper transcription failed: {e}")
        return ""


async def answer_question(
    question: str,
    street: str,
    neighborhood: str,
    city: str,
    mood: str,
    recent_narration: str = None,
) -> str:
    """
    Answer a free-form spoken question about the user's current
    surroundings — a follow-up to the ambient narration, not a fresh
    60-90s story. Short and conversational, with web_search for grounding
    since a specific factual question deserves a real answer, not a guess.

    Returns the answer text, or None if generation failed.
    """
    context_lines = [f"The walker is currently at: {street}, {neighborhood}, {city}."]
    if recent_narration:
        context_lines.append(f"They just heard this narration: \"{recent_narration[:400]}\"")
    context = "\n".join(context_lines)

    instructions = (
        f"You are a knowledgeable, friendly walking-tour guide answering a quick spoken "
        f"question from someone standing right where they are, mid-walk. Match the "
        f"'{mood}' tone of the tour they're on. Answer directly and conversationally in "
        f"2-4 sentences — this is spoken aloud, not read, so no headers, lists, citations, "
        f"or markdown. If you don't know the specific answer, say so briefly rather than "
        f"inventing details, and offer whatever related fact you're confident about instead."
    )

    try:
        response = await client.responses.create(
            model=MODEL,
            instructions=instructions,
            input=f"{context}\n\nTheir question: \"{question}\"",
            tools=[{"type": "web_search"}],
            temperature=0.7,
            max_output_tokens=2048,
        )

        answer = None
        try:
            answer = response.output_text
        except Exception:
            pass

        if not answer and response.output:
            text_parts = []
            for item in response.output:
                if getattr(item, "type", None) == "message":
                    for part in getattr(item, "content", []):
                        if getattr(part, "text", None):
                            text_parts.append(part.text)
            if text_parts:
                answer = " ".join(text_parts)

        if answer:
            answer = _strip_citations(answer)

        if not answer or len(answer) < 5:
            logger.warning(f"Question answering returned empty result for: {question[:100]}")
            return None

        return answer

    except Exception as e:
        logger.error(f"Question answering failed: {e}")
        return None

    except Exception as e:
        logger.error(f"Connector generation failed: {e}")
        return None, fallback_summary
