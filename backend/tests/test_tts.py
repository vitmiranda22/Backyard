"""
Tests for app/services/tts.py's retry/fallback behavior around Google TTS.

Regression motivation: a real free-tier tour lost audio on all 4 of its
blocks in a row, generated a few minutes apart, while replaying the exact
same text/voice/code minutes later synthesized fine -- meaning a transient
blip (network or Google-side) took out an entire walk's audio with the old
code, which never retried the primary voice call at all before giving up
on a voice. These tests exercise the retry/backoff/fallback logic directly
against a fake client, with time.sleep patched out so retries don't
actually slow the test suite down.
"""

from unittest.mock import MagicMock
from app.services import tts


class _FakeResponse:
    def __init__(self, audio_content):
        self.audio_content = audio_content


def _patch_client(monkeypatch, fake_client):
    monkeypatch.setattr(tts, "_get_tts_client", lambda: fake_client)


def _patch_no_sleep(monkeypatch):
    # Retries really do call time.sleep(_RETRY_BACKOFF_SEC) between
    # attempts -- patched to a no-op so these tests run instantly instead
    # of actually waiting out the backoff.
    monkeypatch.setattr(tts.time, "sleep", lambda *_args, **_kwargs: None)


def test_succeeds_on_the_first_attempt_with_no_retry(monkeypatch):
    _patch_no_sleep(monkeypatch)
    client = MagicMock()
    client.synthesize_speech.return_value = _FakeResponse(b"mp3-bytes")
    _patch_client(monkeypatch, client)

    result = tts._synthesize_speech_sync("Some narration.", "neutral", is_premium=False)

    assert result == b"mp3-bytes"
    assert client.synthesize_speech.call_count == 1


def test_retries_the_same_voice_before_giving_up(monkeypatch):
    _patch_no_sleep(monkeypatch)
    client = MagicMock()
    # Fails twice, succeeds on the 3rd (last allowed) attempt.
    client.synthesize_speech.side_effect = [
        Exception("transient network error"),
        Exception("transient network error"),
        _FakeResponse(b"mp3-bytes"),
    ]
    _patch_client(monkeypatch, client)

    result = tts._synthesize_speech_sync("Some narration.", "neutral", is_premium=False)

    assert result == b"mp3-bytes"
    assert client.synthesize_speech.call_count == 3


def test_falls_back_to_a_different_voice_after_the_primary_exhausts_its_retries(monkeypatch):
    _patch_no_sleep(monkeypatch)
    client = MagicMock()
    # Primary voice fails all 3 attempts, fallback voice succeeds on its first.
    client.synthesize_speech.side_effect = [
        Exception("primary down"),
        Exception("primary down"),
        Exception("primary down"),
        _FakeResponse(b"fallback-mp3-bytes"),
    ]
    _patch_client(monkeypatch, client)

    result = tts._synthesize_speech_sync("Some narration.", "neutral", is_premium=False)

    assert result == b"fallback-mp3-bytes"
    assert client.synthesize_speech.call_count == 4  # 3 primary + 1 fallback
    # The fallback call used a different voice name than the primary one.
    voice_names = [call.kwargs["voice"].name for call in client.synthesize_speech.call_args_list]
    assert len(set(voice_names)) == 2


def test_returns_none_when_the_primary_and_every_fallback_attempt_fail(monkeypatch):
    _patch_no_sleep(monkeypatch)
    client = MagicMock()
    client.synthesize_speech.side_effect = Exception("everything is down")
    _patch_client(monkeypatch, client)

    result = tts._synthesize_speech_sync("Some narration.", "neutral", is_premium=False)

    assert result is None
    # 3 primary attempts + 3 fallback attempts, never silently gives up early.
    assert client.synthesize_speech.call_count == 6


def test_empty_audio_content_returns_none_without_retrying(monkeypatch):
    # Not an exception -- Google returning genuinely empty audio is a
    # different (and much rarer) failure mode than a raised error, and
    # was never retried before this change either. Behavior unchanged.
    client = MagicMock()
    client.synthesize_speech.return_value = _FakeResponse(b"")
    _patch_client(monkeypatch, client)

    result = tts._synthesize_speech_sync("Some narration.", "neutral", is_premium=False)

    assert result is None
    assert client.synthesize_speech.call_count == 1
