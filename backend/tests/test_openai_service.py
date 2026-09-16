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
