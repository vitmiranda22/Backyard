"""
Regression tests for the comments/likes authorization fix (security audit,
2026-07). Before this fix, list_comments/post_comment/toggle_like only
checked that a tour existed, never that it was public or owned by the
caller — any authenticated user with a private tour's UUID could read or
write its comments/likes. These tests pin that behavior so it can't
silently regress.
"""

import pytest
from app.services import supabase_db

OWNER_ID = "11111111-1111-1111-1111-111111111111"
OTHER_ID = "22222222-2222-2222-2222-222222222222"
TOUR_ID = "33333333-3333-3333-3333-333333333333"


def _tour(is_public: bool, creator_id: str = OWNER_ID):
    return {"id": TOUR_ID, "creator_id": creator_id, "is_public": is_public}


@pytest.mark.parametrize("path,method,body", [
    ("/api/tours/{tour_id}/comments", "get", None),
    ("/api/tours/{tour_id}/comments", "post", {"body": "hi", "is_anonymous": False}),
    ("/api/tours/{tour_id}/like", "post", None),
])
def test_private_tour_blocks_non_owner(app, client, auth_as, monkeypatch, path, method, body):
    monkeypatch.setattr(supabase_db, "get_tour", _async(_tour(is_public=False, creator_id=OWNER_ID)))
    auth_as(app, OTHER_ID)

    kwargs = {"json": body} if body is not None else {}
    resp = getattr(client, method)(path.format(tour_id=TOUR_ID), **kwargs)

    assert resp.status_code == 403


@pytest.mark.parametrize("path,method,body,mock_fn,mock_return", [
    ("/api/tours/{tour_id}/comments", "get", None, "get_comments", []),
    ("/api/tours/{tour_id}/like", "post", None, "toggle_like", (True, 1)),
])
def test_private_tour_allows_owner(app, client, auth_as, monkeypatch, path, method, body, mock_fn, mock_return):
    monkeypatch.setattr(supabase_db, "get_tour", _async(_tour(is_public=False, creator_id=OWNER_ID)))
    monkeypatch.setattr(supabase_db, mock_fn, _async(mock_return))
    auth_as(app, OWNER_ID)

    kwargs = {"json": body} if body is not None else {}
    resp = getattr(client, method)(path.format(tour_id=TOUR_ID), **kwargs)

    assert resp.status_code == 200


def test_public_tour_allows_non_owner_to_read_comments(app, client, auth_as, monkeypatch):
    monkeypatch.setattr(supabase_db, "get_tour", _async(_tour(is_public=True, creator_id=OWNER_ID)))
    monkeypatch.setattr(supabase_db, "get_comments", _async([]))
    auth_as(app, OTHER_ID)

    resp = client.get(f"/api/tours/{TOUR_ID}/comments")

    assert resp.status_code == 200


def test_missing_tour_is_404_not_403(app, client, auth_as, monkeypatch):
    monkeypatch.setattr(supabase_db, "get_tour", _async(None))
    auth_as(app, OTHER_ID)

    resp = client.get(f"/api/tours/{TOUR_ID}/comments")

    assert resp.status_code == 404


def _async(return_value):
    async def _fn(*args, **kwargs):
        return return_value
    return _fn
