"""
Marketing site server.

Render's static-site hosting has no server-side component -- it can only
serve one fixed file per path, with path-based header rules at most. It
cannot inspect the Accept header and branch the response body, which is
required for Markdown content negotiation (acceptmarkdown.com) on the
homepage and on errors. This tiny server exists for exactly that:
everything else is served byte-for-byte identical to the old static site.

Deliberately not using Starlette's StaticFiles mount for the whole site --
error responses need to be negotiated (Markdown/JSON/HTML), so 404 handling
has to be ours, not the framework's default.
"""

import json
import mimetypes
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, Response

SITE_DIR = Path(__file__).parent.parent / "site"
HOMEPAGE_MD = (Path(__file__).parent / "homepage.md").read_text(encoding="utf-8")

# Clean URLs from the old static site's _redirects file: the browser URL
# stays /privacy, /terms, /support (what's linked from the app and App Store
# Connect), serving the matching .html file at 200 -- a rewrite, not a redirect.
CLEAN_URL_REWRITES = {
    "/privacy": "privacy.html",
    "/terms": "terms.html",
    "/support": "support.html",
}

HTML, MARKDOWN, JSON = "text/html", "text/markdown", "application/json"
SITE = "https://backyardexplorer.org"
ERROR_HINT = f"See {SITE}/sitemap.xml for every page, or {SITE}/llms.txt for agent guidance."

# This is a website, not an API: FastAPI's default /docs, /redoc and
# /openapi.json would publish a meaningless spec for these two routes, and
# agent-readiness scanners read that as "this site offers an API".
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


def negotiate(accept: str, offered: list[str]) -> str | None:
    """
    Pick the best of `offered` for an Accept header (RFC 9110 §12.5.1).

    Each offered type takes its quality from the most specific range that
    matches it (type/subtype beats type/* beats */*), so an explicit q=0
    excludes a type even when a wildcard would allow it. Highest quality
    wins; ties go to the more specific match, then the client's listing
    order, then the server's order in `offered` (offered[0] is the default,
    which is what a bare */* resolves to). Returns None if nothing offered
    is acceptable (406).
    """
    if not accept.strip():
        return offered[0]

    ranges = []
    for part in accept.split(","):
        media_range, *params = [p.strip() for p in part.split(";")]
        if not media_range:
            continue
        q = 1.0
        for param in params:
            if param.lower().startswith("q="):
                try:
                    q = float(param[2:])
                except ValueError:
                    pass
        ranges.append((media_range.lower(), q))

    best_score, best_type = None, None
    for offered_index, media_type in enumerate(offered):
        wildcard_subtype = media_type.split("/")[0] + "/*"
        specificity, quality, position = -1, 0.0, 0
        for range_index, (media_range, q) in enumerate(ranges):
            if media_range == media_type:
                this = 2
            elif media_range == wildcard_subtype:
                this = 1
            elif media_range == "*/*":
                this = 0
            else:
                continue
            if this > specificity:
                specificity, quality, position = this, q, range_index
        if specificity < 0 or quality <= 0:
            continue
        score = (quality, specificity, -position, -offered_index)
        if best_score is None or score > best_score:
            best_score, best_type = score, media_type
    return best_type


def error_response(request: Request, status: int, code: str, message: str) -> Response:
    """
    Errors are negotiated too: agents that ask for JSON get a structured
    error envelope (same shape as backyard-api's), Markdown clients get
    Markdown, browsers get the plain page they always got. A client that
    accepts none of those still gets JSON -- an error has to say something
    machine-readable.
    """
    headers = {"Vary": "Accept"}
    chosen = negotiate(request.headers.get("accept", ""), [HTML, MARKDOWN, JSON]) or JSON

    if chosen == JSON:
        body = {"detail": {"error": message, "code": code, "retry": False, "hint": ERROR_HINT}}
        return Response(json.dumps(body), status_code=status, media_type=JSON, headers=headers)
    if chosen == MARKDOWN:
        body = (
            f"# {status} {message}\n\n"
            f"See [the sitemap]({SITE}/sitemap.xml) for every page on backyardexplorer.org,\n"
            f"or [llms.txt]({SITE}/llms.txt) for agent-oriented guidance on this site.\n"
        )
        return Response(body, status_code=status, media_type="text/markdown; charset=utf-8", headers=headers)
    return Response(f"{status} {message}", status_code=status, media_type=HTML, headers=headers)


@app.api_route("/", methods=["GET", "HEAD"])
def homepage(request: Request):
    chosen = negotiate(request.headers.get("accept", ""), [HTML, MARKDOWN])
    if chosen == MARKDOWN:
        return Response(HOMEPAGE_MD, media_type="text/markdown; charset=utf-8", headers={"Vary": "Accept"})
    if chosen == HTML:
        return FileResponse(SITE_DIR / "index.html", media_type=HTML, headers={"Vary": "Accept"})
    return error_response(request, 406, "not_acceptable", "Not Acceptable: this page is available as text/html or text/markdown")


@app.api_route("/{path:path}", methods=["GET", "HEAD"])
def catch_all(path: str, request: Request):
    url_path = "/" + path

    if url_path in CLEAN_URL_REWRITES:
        return FileResponse(SITE_DIR / CLEAN_URL_REWRITES[url_path], media_type=HTML)

    file_path = (SITE_DIR / path).resolve()
    # Refuse anything that escapes SITE_DIR (path traversal via ../).
    if SITE_DIR.resolve() in file_path.parents and file_path.is_file():
        content_type, _ = mimetypes.guess_type(str(file_path))
        return FileResponse(file_path, media_type=content_type or "application/octet-stream")

    return error_response(request, 404, "not_found", "Not Found")
