"""
Marketing site server.

Render's static-site hosting has no server-side component -- it can only
serve one fixed file per path, with path-based header rules at most. It
cannot inspect the Accept header and branch the response body, which is
required for Markdown content negotiation (acceptmarkdown.com) on the
homepage and on 404s. This tiny server exists for exactly that: everything
else is served byte-for-byte identical to the old static site.

Deliberately not using Starlette's StaticFiles mount for the whole site --
the Markdown 404 body requirement means 404 handling needs to be ours, not
the framework's default, so the catch-all route below resolves files from
disk itself rather than delegating to a mount.
"""

import mimetypes
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, PlainTextResponse, Response

SITE_DIR = Path(__file__).parent.parent / "site"
HOMEPAGE_MD = (Path(__file__).parent / "homepage.md").read_text(encoding="utf-8")

# Netlify-style rewrites from the old _redirects file: the browser URL stays
# /privacy, /terms, /support (that's what's linked from the app, App Store
# Connect, and everywhere else), serving the matching .html file at 200.
CLEAN_URL_REWRITES = {
    "/privacy": "privacy.html",
    "/terms": "terms.html",
    "/support": "support.html",
}

NOT_FOUND_MD = """# 404 Not Found

The page you requested doesn't exist on backyardexplorer.org.

See [the sitemap](https://backyardexplorer.org/sitemap.xml) for all pages,
or [llms.txt](https://backyardexplorer.org/llms.txt) for agent-oriented
guidance on this site.
"""

app = FastAPI()


def wants_markdown(request: Request) -> bool:
    """
    True if, per RFC 9110 Accept-header precedence (highest q-value wins,
    an exact match outranks a wildcard at equal q), the client prefers
    text/markdown over text/html for this request.
    """
    accept = request.headers.get("accept", "")
    if not accept:
        return False

    best_type, best_q, best_specificity = None, -1.0, -1
    for part in accept.split(","):
        part = part.strip()
        if not part:
            continue
        media_range, *params = part.split(";")
        media_range = media_range.strip().lower()
        q = 1.0
        for param in params:
            param = param.strip()
            if param.startswith("q="):
                try:
                    q = float(param[2:])
                except ValueError:
                    q = 1.0

        for candidate, specificity in (("text/markdown", 2), ("text/html", 2)):
            if media_range == candidate:
                matched, this_specificity = candidate, specificity
                break
            if media_range == "text/*" and candidate.startswith("text/"):
                matched, this_specificity = candidate, 1
                break
            if media_range == "*/*":
                matched, this_specificity = candidate, 0
                break
        else:
            continue

        if q > best_q or (q == best_q and this_specificity > best_specificity):
            best_type, best_q, best_specificity = matched, q, this_specificity

    return best_type == "text/markdown"


@app.get("/")
def homepage(request: Request):
    if wants_markdown(request):
        return Response(
            content=HOMEPAGE_MD,
            media_type="text/markdown; charset=utf-8",
            headers={"Vary": "Accept"},
        )
    return FileResponse(
        SITE_DIR / "index.html",
        media_type="text/html",
        headers={"Vary": "Accept"},
    )


@app.get("/{path:path}")
def catch_all(path: str, request: Request):
    url_path = "/" + path

    if url_path in CLEAN_URL_REWRITES:
        return FileResponse(SITE_DIR / CLEAN_URL_REWRITES[url_path], media_type="text/html")

    file_path = (SITE_DIR / path).resolve()
    # Refuse anything that escapes SITE_DIR (path traversal via ../).
    if SITE_DIR.resolve() in file_path.parents and file_path.is_file():
        content_type, _ = mimetypes.guess_type(str(file_path))
        return FileResponse(file_path, media_type=content_type or "application/octet-stream")

    if wants_markdown(request):
        return PlainTextResponse(
            NOT_FOUND_MD,
            status_code=404,
            media_type="text/markdown; charset=utf-8",
            headers={"Vary": "Accept"},
        )
    return PlainTextResponse("404 Not Found", status_code=404, media_type="text/html")
