"""
Tests for POST /tours/{tour_id}/report and POST /tours/{tour_id}/comments/
{comment_id}/report -- the content-moderation reporting endpoints. The
content_reports table and its RLS policies have existed since
001_initial_schema.sql; these are the first endpoints that actually use it.
"""

import pytest
from app.services import supabase_db

USER_ID = "44444444-4444-4444-4444-444444444444"
OWNER_ID = "55555555-5555-5555-5555-555555555555"
TOUR_ID = "66666666-6666-6666-6666-666666666666"
OTHER_TOUR_ID = "77777777-7777-7777-7777-777777777777"
COMMENT_ID = "88888888-8888-8888-8888-888888888888"


def _async(return_value):
    async def _fn(*args, **kwargs):
        return return_value
    return _fn


def _public_tour():
    return {"id": TOUR_ID, "creator_id": OWNER_ID, "is_public": True}


def _report_row(target_type="tour", target_id=TOUR_ID, reason="spam"):
    return {"id": "r1", "target_type": target_type, "target_id": target_id, "reason": reason, "status": "pending"}


class TestReportTour:
    def test_reports_a_public_tour_and_returns_the_created_report(self, app, client, auth_as, monkeypatch):
        monkeypatch.setattr(supabase_db, "get_tour", _async(_public_tour()))
        captured = {}

        async def _track_create(reporter_id, target_type, target_id, reason, detail=None):
            captured.update(reporter_id=reporter_id, target_type=target_type, target_id=target_id, reason=reason, detail=detail)
            return _report_row()
        monkeypatch.setattr(supabase_db, "create_content_report", _track_create)

        auth_as(app, USER_ID)
        resp = client.post(f"/api/tours/{TOUR_ID}/report", json={"reason": "spam", "detail": "looks like an ad"})

        assert resp.status_code == 200
        body = resp.json()
        assert body["report_id"] == "r1"
        assert body["target_type"] == "tour"
        assert body["status"] == "pending"
        assert captured == {
            "reporter_id": USER_ID, "target_type": "tour", "target_id": TOUR_ID,
            "reason": "spam", "detail": "looks like an ad",
        }

    def test_rejects_an_invalid_reason(self, app, client, auth_as, monkeypatch):
        monkeypatch.setattr(supabase_db, "get_tour", _async(_public_tour()))
        auth_as(app, USER_ID)

        resp = client.post(f"/api/tours/{TOUR_ID}/report", json={"reason": "not_a_real_reason"})

        assert resp.status_code == 422

    def test_missing_tour_is_404(self, app, client, auth_as, monkeypatch):
        monkeypatch.setattr(supabase_db, "get_tour", _async(None))
        auth_as(app, USER_ID)

        resp = client.post(f"/api/tours/{TOUR_ID}/report", json={"reason": "spam"})

        assert resp.status_code == 404

    def test_returns_500_when_the_write_fails(self, app, client, auth_as, monkeypatch):
        monkeypatch.setattr(supabase_db, "get_tour", _async(_public_tour()))
        monkeypatch.setattr(supabase_db, "create_content_report", _async(None))
        auth_as(app, USER_ID)

        resp = client.post(f"/api/tours/{TOUR_ID}/report", json={"reason": "spam"})

        assert resp.status_code == 500


class TestReportComment:
    def _comment(self, tour_id=TOUR_ID):
        return {"id": COMMENT_ID, "tour_id": tour_id, "body": "hi", "user_id": OWNER_ID}

    def test_reports_a_comment_on_a_public_tour(self, app, client, auth_as, monkeypatch):
        monkeypatch.setattr(supabase_db, "get_comment", _async(self._comment()))
        monkeypatch.setattr(supabase_db, "get_tour", _async(_public_tour()))
        monkeypatch.setattr(
            supabase_db, "create_content_report",
            _async(_report_row(target_type="comment", target_id=COMMENT_ID, reason="offensive")),
        )
        auth_as(app, USER_ID)

        resp = client.post(f"/api/tours/{TOUR_ID}/comments/{COMMENT_ID}/report", json={"reason": "offensive"})

        assert resp.status_code == 200
        assert resp.json()["target_type"] == "comment"
        assert resp.json()["target_id"] == COMMENT_ID

    def test_missing_comment_is_404(self, app, client, auth_as, monkeypatch):
        monkeypatch.setattr(supabase_db, "get_comment", _async(None))
        auth_as(app, USER_ID)

        resp = client.post(f"/api/tours/{TOUR_ID}/comments/{COMMENT_ID}/report", json={"reason": "spam"})

        assert resp.status_code == 404

    def test_comment_belonging_to_a_different_tour_is_404_not_leaked(self, app, client, auth_as, monkeypatch):
        # The comment is real, but its tour_id doesn't match the URL's --
        # must be treated the same as "not found," not silently accepted.
        monkeypatch.setattr(supabase_db, "get_comment", _async(self._comment(tour_id=OTHER_TOUR_ID)))
        auth_as(app, USER_ID)

        resp = client.post(f"/api/tours/{TOUR_ID}/comments/{COMMENT_ID}/report", json={"reason": "spam"})

        assert resp.status_code == 404

    def test_private_tour_blocks_non_owner_from_reporting_its_comment(self, app, client, auth_as, monkeypatch):
        monkeypatch.setattr(supabase_db, "get_comment", _async(self._comment()))
        monkeypatch.setattr(supabase_db, "get_tour", _async({"id": TOUR_ID, "creator_id": OWNER_ID, "is_public": False}))
        auth_as(app, USER_ID)

        resp = client.post(f"/api/tours/{TOUR_ID}/comments/{COMMENT_ID}/report", json={"reason": "spam"})

        assert resp.status_code == 403
