from app.services import supabase_db, openai_service, tts, r2

USER_ID = "77777777-7777-7777-7777-777777777777"
RICH_ZONE = {
    "street_name": "The Embarcadero", "neighborhood": "Financial District", "city": "San Francisco",
    "raw_data": {"wikipedia": [{"title": "Ferry Building"}]},
    "sources_hit_count": 20, "sources_eligible_count": 20,
}
CHAPTER_BODY = {"lat": 37.7955, "lng": -122.3937, "title": "The Building That Refused to Fall",
                "chapters": ["The morning of 1906", "Before the bridges", "Behind a freeway", "Reborn"], "index": 1}


def _async(value):
    async def _fn(*args, **kwargs):
        return value
    return _fn


def _mock(monkeypatch, *, premium=True, zone=RICH_ZONE, underage=False):
    monkeypatch.setattr(supabase_db, "get_user_premium_status", _async(premium))
    monkeypatch.setattr(supabase_db, "get_cached_zone_data", _async(zone))
    monkeypatch.setattr(supabase_db, "check_rate_limit", _async((True, "")))
    monkeypatch.setattr(supabase_db, "is_user_underage", _async(underage))
    monkeypatch.setattr(tts, "synthesize_speech", _async(b"mp3"))
    monkeypatch.setattr(r2, "upload_audio", _async(True))
    monkeypatch.setattr(r2, "generate_signed_url", lambda key: f"https://r2/{key}")


def test_outline_requires_auth(client):
    assert client.post("/api/deep-dive/outline", json={"lat": 37.7, "lng": -122.4}).status_code == 401


def test_outline_is_premium_only(app, client, auth_as, monkeypatch):
    _mock(monkeypatch, premium=False)
    auth_as(app, USER_ID)
    resp = client.post("/api/deep-dive/outline", json={"lat": 37.7, "lng": -122.4})
    assert resp.status_code == 403
    assert resp.json()["detail"]["code"] == "premium_required"


def test_outline_refuses_a_thin_zone(app, client, auth_as, monkeypatch):
    _mock(monkeypatch, zone={**RICH_ZONE, "sources_hit_count": 1})
    auth_as(app, USER_ID)
    resp = client.post("/api/deep-dive/outline", json={"lat": 37.7, "lng": -122.4})
    assert resp.status_code == 404
    assert resp.json()["detail"]["code"] == "deep_dive_unavailable"


def test_outline_returns_the_plan(app, client, auth_as, monkeypatch):
    _mock(monkeypatch)
    plan = {"place": "The Ferry Building", "title": "The Building That Refused to Fall", "chapters": ["a", "b", "c", "d"]}
    monkeypatch.setattr(openai_service, "generate_deep_dive_outline", _async(plan))
    auth_as(app, USER_ID)
    resp = client.post("/api/deep-dive/outline", json={"lat": 37.7, "lng": -122.4})
    assert resp.status_code == 200
    assert resp.json() == plan


def test_chapter_returns_text_and_audio(app, client, auth_as, monkeypatch):
    _mock(monkeypatch)
    seen = {}

    async def _chapter(**kwargs):
        seen.update(kwargs)
        return "Before the bridges, fifty thousand people a day walked through this hall."
    monkeypatch.setattr(openai_service, "generate_deep_dive_chapter", _chapter)
    auth_as(app, USER_ID)
    resp = client.post("/api/deep-dive/chapter", json=CHAPTER_BODY)
    assert resp.status_code == 200
    assert resp.json()["audio_url"].startswith("https://r2/audio/deep-dive/")
    assert seen["index"] == 1 and seen["street"] == "The Embarcadero"


def test_chapter_index_out_of_range_is_rejected(app, client, auth_as, monkeypatch):
    _mock(monkeypatch)
    auth_as(app, USER_ID)
    resp = client.post("/api/deep-dive/chapter", json={**CHAPTER_BODY, "index": 4})
    assert resp.status_code == 400


def test_chapter_counts_against_the_daily_narration_limit(app, client, auth_as, monkeypatch):
    _mock(monkeypatch)
    monkeypatch.setattr(supabase_db, "check_rate_limit", _async((False, "daily_limit_exceeded")))
    auth_as(app, USER_ID)
    resp = client.post("/api/deep-dive/chapter", json=CHAPTER_BODY)
    assert resp.status_code == 429


def test_chapter_age_gate_forces_family_friendly(app, client, auth_as, monkeypatch):
    _mock(monkeypatch, underage=True)
    seen = {}

    async def _chapter(**kwargs):
        seen.update(kwargs)
        return "x" * 100
    monkeypatch.setattr(openai_service, "generate_deep_dive_chapter", _chapter)
    auth_as(app, USER_ID)
    client.post("/api/deep-dive/chapter", json={**CHAPTER_BODY, "content_safety": True})
    assert seen["content_safety"] is False


def test_chapter_prompt_names_only_its_own_chapter_as_the_one_to_write():
    from app.core.prompts import build_deep_dive_chapter_prompt
    prompt = build_deep_dive_chapter_prompt("Main St", "Downtown", "SF", "time_machine", False, "data",
                                            "Title", ["One", "Two", "Three"], 2)
    assert 'Write ONLY chapter 3: "Three"' in prompt
    assert "last chapter" in prompt
