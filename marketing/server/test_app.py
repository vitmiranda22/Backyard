"""
Tests for the marketing site server. Run from this directory:
    pip install -r requirements-dev.txt && pytest -q
"""

import json
import re

import pytest
from fastapi.testclient import TestClient

from app import HTML, JSON, MARKDOWN, SITE_DIR, app, negotiate

client = TestClient(app)

BROWSER_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,*/*;q=0.8"


# --- negotiate() -----------------------------------------------------------------

@pytest.mark.parametrize(
    "accept, expected",
    [
        ("", HTML),
        ("*/*", HTML),  # a bare wildcard is the server default, not Markdown
        ("text/*", HTML),
        (BROWSER_ACCEPT, HTML),
        ("text/markdown", MARKDOWN),
        ("text/markdown, */*", MARKDOWN),  # explicit type beats wildcard at equal q
        ("text/markdown, text/html", MARKDOWN),  # tie at equal q: client's order
        ("text/markdown;q=0.5, text/html", HTML),
        ("text/html;q=0, */*", MARKDOWN),  # explicit q=0 overrides the wildcard
        ("application/json", None),
        ("text/markdown;q=0", None),
    ],
)
def test_negotiate(accept, expected):
    assert negotiate(accept, [HTML, MARKDOWN]) == expected


# --- homepage --------------------------------------------------------------------

def test_homepage_serves_markdown_when_asked():
    resp = client.get("/", headers={"Accept": "text/markdown"})

    assert resp.status_code == 200
    assert resp.headers["content-type"] == "text/markdown; charset=utf-8"
    assert resp.headers["vary"] == "Accept"
    assert resp.text.startswith("# Backyard")


def test_homepage_serves_the_unchanged_html_to_browsers():
    resp = client.get("/", headers={"Accept": BROWSER_ACCEPT})

    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/html")
    assert resp.headers["vary"] == "Accept"
    assert resp.content == (SITE_DIR / "index.html").read_bytes()


def test_homepage_bare_wildcard_gets_html_not_markdown():
    # Regression: */* used to resolve to Markdown, so curl and some link-
    # preview crawlers got the Markdown homepage without its OG tags.
    resp = client.get("/", headers={"Accept": "*/*"})

    assert resp.headers["content-type"].startswith("text/html")


def test_homepage_head_request_succeeds():
    # Regression: only GET was registered, so HEAD (link checkers, uptime
    # monitors) got 405 on every page.
    resp = client.head("/")

    assert resp.status_code == 200


def test_homepage_unsupported_type_is_406_with_json_error():
    resp = client.get("/", headers={"Accept": "application/json"})

    assert resp.status_code == 406
    assert resp.headers["content-type"] == JSON
    assert resp.json()["detail"]["code"] == "not_acceptable"


# --- errors ----------------------------------------------------------------------

def test_404_markdown_body_explains_the_error_and_links_out():
    resp = client.get("/no-such-page", headers={"Accept": "text/markdown"})

    assert resp.status_code == 404
    assert resp.headers["content-type"] == "text/markdown; charset=utf-8"
    assert resp.headers["vary"] == "Accept"
    assert len(resp.text) >= 20
    assert "llms.txt" in resp.text


def test_404_json_body_is_structured():
    resp = client.get("/no-such-page", headers={"Accept": "application/json"})

    assert resp.status_code == 404
    assert resp.headers["content-type"] == JSON
    detail = resp.json()["detail"]
    assert detail["code"] == "not_found"
    assert detail["error"]
    assert "sitemap.xml" in detail["hint"]


def test_404_for_browsers_stays_html():
    resp = client.get("/no-such-page", headers={"Accept": BROWSER_ACCEPT})

    assert resp.status_code == 404
    assert resp.headers["content-type"].startswith("text/html")


@pytest.mark.parametrize("path", ["/docs", "/redoc", "/openapi.json"])
def test_no_auto_generated_api_docs(path):
    # This is a website, not an API -- FastAPI's defaults published a
    # meaningless spec here that agent-readiness scanners read as an API.
    assert client.get(path).status_code == 404


def test_path_traversal_is_refused():
    assert client.get("/%2e%2e/server/app.py").status_code == 404


# --- existing static site ---------------------------------------------------------

@pytest.mark.parametrize("path, filename", [
    ("/privacy", "privacy.html"),
    ("/terms", "terms.html"),
    ("/support", "support.html"),
])
def test_clean_urls_serve_their_page(path, filename):
    resp = client.get(path)

    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/html")
    assert resp.content == (SITE_DIR / filename).read_bytes()


@pytest.mark.parametrize("path, content_type", [
    ("/about.html", "text/html"),
    ("/css/style.css", "text/css"),
    ("/assets/logo.png", "image/png"),
    ("/llms.txt", "text/plain"),
    ("/robots.txt", "text/plain"),
])
def test_static_files_are_served(path, content_type):
    resp = client.get(path)

    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith(content_type)


def test_head_on_a_static_file_succeeds():
    assert client.head("/about.html").status_code == 200


# --- homepage structured data ------------------------------------------------------

def _homepage_json_ld() -> dict:
    html = (SITE_DIR / "index.html").read_text(encoding="utf-8")
    blocks = re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, re.S)
    return {block["@type"]: block for block in map(json.loads, blocks)}


def test_homepage_json_ld_is_valid_and_complete():
    ld = _homepage_json_ld()

    app_entity, org = ld["SoftwareApplication"], ld["Organization"]
    assert app_entity["url"] == "https://backyardexplorer.org/"
    assert org["contactPoint"]["email"]
    assert org["contactPoint"]["contactType"]
    for entity in (app_entity, org):
        for url in entity.get("sameAs", []):
            assert url.startswith("https://"), url


def test_wikidata_link_is_on_the_app_not_the_organization():
    # The Wikidata item (Q141612761) is a "mobile app" entity, and a one-digit
    # typo once pointed Organization.sameAs at an unrelated scholarly article.
    ld = _homepage_json_ld()

    assert "https://www.wikidata.org/wiki/Q141612761" in ld["SoftwareApplication"]["sameAs"]
    assert not any("wikidata" in url for url in ld["Organization"].get("sameAs", []))
