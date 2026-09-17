"""
Direct unit tests for openai_service.py's own parsing/formatting logic —
previously only exercised indirectly via test_narrate_block.py, which
mocks generate_narration/generate_connector out entirely rather than
testing their real internals. Mocks only the OpenAI client boundary
(client.responses.create), not the functions under test themselves.
"""

import pytest
from app.services import openai_service


class FakePart:
    def __init__(self, text):
        self.text = text


class FakeItem:
    def __init__(self, content, type_="message"):
        self.type = type_
        self.content = content


class FakeResponse:
    def __init__(self, output_text=None, output=None):
        self.output_text = output_text
        self.output = output or []


def _async_response(response):
    async def _create(*args, **kwargs):
        return response
    return _create


# --- _strip_citations --------------------------------------------------------

def test_strip_citations_removes_a_fully_parenthesized_link():
    text = "This block was built in 1928 ([redfin.com](https://redfin.com/x))."
    assert openai_service._strip_citations(text) == "This block was built in 1928 ."


def test_strip_citations_keeps_link_text_for_a_bare_markdown_link():
    text = "According to [the city archive](https://example.com/archive), it burned in 1906."
    assert openai_service._strip_citations(text) == "According to the city archive, it burned in 1906."


def test_strip_citations_collapses_doubled_whitespace_left_behind():
    text = "It happened here.  ([source.com](https://source.com))  Then it changed."
    result = openai_service._strip_citations(text)
    assert "  " not in result
    assert "source.com" not in result


# --- _fix_replacement_chars ---------------------------------------------------
# Regression coverage for a real corrupted tour: two of four blocks in a
# live walk had U+FFFD (the Unicode replacement character) in place of an
# em dash or curly apostrophe in the OpenAI response, reaching storage and
# (eventually) TTS unmangled. Confirmed nothing on this path touches raw
# bytes, so this is a defensive repair, not a fix to our own encoding bug.

def test_fix_replacement_chars_restores_a_contraction_apostrophe():
    text = "It�s 1906. The ground shakes beneath the street."
    assert openai_service._fix_replacement_chars(text) == "It's 1906. The ground shakes beneath the street."


def test_fix_replacement_chars_restores_a_contraction_that_isnt_reported():
    text = "a fire that hasn�t been reported yet"
    assert openai_service._fix_replacement_chars(text) == "a fire that hasn't been reported yet"


def test_fix_replacement_chars_turns_a_dash_like_gap_into_a_comma():
    text = "before you even see it�it's 9th Avenue and California Street"
    assert (
        openai_service._fix_replacement_chars(text)
        == "before you even see it, it's 9th Avenue and California Street"
    )


def test_fix_replacement_chars_handles_both_patterns_in_one_string():
    text = "That gleam � it�s the only calm here now."
    assert openai_service._fix_replacement_chars(text) == "That gleam, it's the only calm here now."


def test_fix_replacement_chars_leaves_clean_text_untouched():
    text = "It's 1915. The building you're looking at right now didn't exist yet."
    assert openai_service._fix_replacement_chars(text) == text


def test_strip_citations_also_repairs_replacement_characters():
    # _strip_citations is the shared post-processing entry point every
    # generate_* function already calls -- both fixes should land through
    # it without every call site needing its own extra step.
    text = "It�s 1906 ([source.com](https://source.com))."
    assert openai_service._strip_citations(text) == "It's 1906 ."


# --- generate_connector -------------------------------------------------------

@pytest.mark.asyncio
async def test_generate_connector_parses_transition_and_summary(monkeypatch):
    monkeypatch.setattr(
        openai_service.client.responses,
        "create",
        _async_response(FakeResponse(output_text="TRANSITION: Cross the street and look up.\nSUMMARY: The tour has covered two blocks so far.")),
    )

    transition, summary, used_openers = await openai_service.generate_connector(
        prior_summary="Nothing yet.", mood="hidden_city", current_narration="Next block text.",
    )

    assert transition == "Cross the street and look up."
    assert summary == "The tour has covered two blocks so far."
    assert len(used_openers) == 1


@pytest.mark.asyncio
async def test_generate_connector_strips_citations_from_transition_and_summary(monkeypatch):
    monkeypatch.setattr(
        openai_service.client.responses,
        "create",
        _async_response(FakeResponse(
            output_text="TRANSITION: Just past [the old depot](https://example.com), you'll see it.\n"
                        "SUMMARY: Visited the depot ([wiki.org](https://wiki.org))."
        )),
    )

    transition, summary, _ = await openai_service.generate_connector(
        prior_summary="", mood="time_machine", current_narration="",
    )

    assert "https://" not in transition
    assert "https://" not in summary
    assert "the old depot" in transition


@pytest.mark.asyncio
async def test_generate_connector_falls_back_to_truncated_narration_when_unparseable(monkeypatch):
    monkeypatch.setattr(
        openai_service.client.responses,
        "create",
        _async_response(FakeResponse(output_text="I'm not sure what to write here.")),
    )

    transition, summary, _ = await openai_service.generate_connector(
        prior_summary="", mood="dark_side", current_narration="A" * 300,
    )

    assert transition is None
    assert summary == ("A" * 300)[:200]


@pytest.mark.asyncio
async def test_generate_connector_space_joins_multiple_parts_in_the_output_text_fallback_path(monkeypatch):
    # Regression test: this fallback path (response.output_text absent,
    # manually walking response.output's message parts) used to join with
    # "".join(...) instead of " ".join(...), gluing words together with no
    # space whenever a response had more than one text part.
    fake_response = FakeResponse(
        output_text=None,
        output=[FakeItem(content=[FakePart("TRANSITION: Turn the corner and"), FakePart(" keep walking.\nSUMMARY: Ongoing.")])],
    )
    monkeypatch.setattr(openai_service.client.responses, "create", _async_response(fake_response))

    transition, summary, _ = await openai_service.generate_connector(
        prior_summary="", mood="unfiltered", current_narration="",
    )

    assert transition == "Turn the corner and keep walking."
    assert "corner andkeep" not in transition


# --- generate_closing_beat -----------------------------------------------------
# Only ever called for a block the client flagged as is_final_block (see
# narrate.py) -- a short beat resolving the whole tour, appended after that
# block's own narration instead of every other block's usual open ending.

@pytest.mark.asyncio
async def test_generate_closing_beat_returns_the_plain_text_response(monkeypatch):
    monkeypatch.setattr(
        openai_service.client.responses,
        "create",
        _async_response(FakeResponse(output_text="And that's the whole walk, right there.")),
    )

    result = await openai_service.generate_closing_beat(
        mood="time_machine", prior_summary="Visited three historic blocks.", current_narration="The final block's text.",
    )

    assert result == "And that's the whole walk, right there."


@pytest.mark.asyncio
async def test_generate_closing_beat_strips_citations(monkeypatch):
    monkeypatch.setattr(
        openai_service.client.responses,
        "create",
        _async_response(FakeResponse(output_text="You've seen it all, from [the old depot](https://example.com) to here.")),
    )

    result = await openai_service.generate_closing_beat(
        mood="hidden_city", prior_summary="So far so good.", current_narration="",
    )

    assert "https://" not in result
    assert "the old depot" in result


@pytest.mark.asyncio
async def test_generate_closing_beat_returns_none_with_no_prior_summary():
    # Guarded even though narrate.py's own caller already only invokes this
    # when prior_summary is truthy -- a closing beat can't call back to
    # "so far" if there's nothing there yet.
    result = await openai_service.generate_closing_beat(
        mood="time_machine", prior_summary="", current_narration="Some text.",
    )

    assert result is None


@pytest.mark.asyncio
async def test_generate_closing_beat_returns_none_on_empty_output(monkeypatch):
    monkeypatch.setattr(
        openai_service.client.responses,
        "create",
        _async_response(FakeResponse(output_text=None, output=[])),
    )

    result = await openai_service.generate_closing_beat(
        mood="time_machine", prior_summary="So far so good.", current_narration="",
    )

    assert result is None


@pytest.mark.asyncio
async def test_generate_closing_beat_returns_none_on_generation_error(monkeypatch):
    async def _raise(*args, **kwargs):
        raise RuntimeError("OpenAI is down")
    monkeypatch.setattr(openai_service.client.responses, "create", _raise)

    result = await openai_service.generate_closing_beat(
        mood="time_machine", prior_summary="So far so good.", current_narration="",
    )

    assert result is None


@pytest.mark.asyncio
async def test_generate_closing_beat_space_joins_multiple_parts_in_the_output_text_fallback_path(monkeypatch):
    fake_response = FakeResponse(
        output_text=None,
        output=[FakeItem(content=[FakePart("That's the whole walk,"), FakePart(" right there.")])],
    )
    monkeypatch.setattr(openai_service.client.responses, "create", _async_response(fake_response))

    result = await openai_service.generate_closing_beat(
        mood="time_machine", prior_summary="So far so good.", current_narration="",
    )

    assert result == "That's the whole walk, right there."
    assert "walk,right" not in result


@pytest.mark.asyncio
async def test_generate_closing_beat_includes_persona_name_in_the_prompt(monkeypatch):
    captured = {}
    async def _capture_create(*args, **kwargs):
        captured["input"] = kwargs.get("input")
        return FakeResponse(output_text="Closing line.")
    monkeypatch.setattr(openai_service.client.responses, "create", _capture_create)

    await openai_service.generate_closing_beat(
        mood="dark_side", prior_summary="So far so good.", current_narration="", persona_name="Silas",
    )

    assert "as Silas" in captured["input"]
