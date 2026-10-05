"""
/privacy, /terms, and /support moved to the marketing site
(backyardexplorer.org) on 2026-10-04/05 -- the backend now just
permanently redirects so anything already pointing at these URLs (App
Store Connect, search engines) keeps working.
"""


def test_privacy_redirects_to_the_marketing_site(client):
    response = client.get("/privacy", follow_redirects=False)

    assert response.status_code == 301
    assert response.headers["location"] == "https://backyardexplorer.org/privacy"


def test_terms_redirects_to_the_marketing_site(client):
    response = client.get("/terms", follow_redirects=False)

    assert response.status_code == 301
    assert response.headers["location"] == "https://backyardexplorer.org/terms"


def test_support_redirects_to_the_marketing_site(client):
    response = client.get("/support", follow_redirects=False)

    assert response.status_code == 301
    assert response.headers["location"] == "https://backyardexplorer.org/support"
