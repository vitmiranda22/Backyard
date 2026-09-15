"""
Tests for met_museum.fetch_met_object/fetch_met_image_bytes — mocks httpx
entirely via a fake client passed directly in (matching the real function
signatures), never makes a real call to the Met's API.
"""

from app.services import met_museum


class _FakeResponse:
    def __init__(self, json_data=None, content=b"", status_code=200):
        self._json = json_data
        self.content = content
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            raise Exception(f"HTTP {self.status_code}")

    def json(self):
        return self._json


class _FakeAsyncClient:
    def __init__(self, response=None, exc=None):
        self._response = response
        self._exc = exc

    async def get(self, url, headers=None, timeout=None):
        if self._exc:
            raise self._exc
        return self._response


def _object_json(**overrides):
    data = {
        "title": "Sunflowers",
        "artistDisplayName": "Vincent van Gogh",
        "artistDisplayBio": "Dutch, 1853–1890",
        "objectDate": "1887",
        "medium": "Oil on canvas",
        "culture": "",
        "department": "European Paintings",
        "classification": "Paintings",
        "primaryImage": "https://images.metmuseum.org/example.jpg",
        "objectURL": "https://www.metmuseum.org/art/collection/search/436524",
        "GalleryNumber": "825",
    }
    data.update(overrides)
    return data


async def test_fetch_met_object_on_view_when_gallery_number_present():
    client = _FakeAsyncClient(response=_FakeResponse(_object_json()))

    result = await met_museum.fetch_met_object(436524, client)

    assert result["title"] == "Sunflowers"
    assert result["artist_display_name"] == "Vincent van Gogh"
    assert result["gallery_number"] == "825"
    assert result["is_on_view"] is True
    assert result["primary_image"] == "https://images.metmuseum.org/example.jpg"


async def test_fetch_met_object_not_on_view_when_gallery_number_empty():
    client = _FakeAsyncClient(response=_FakeResponse(_object_json(GalleryNumber="")))

    result = await met_museum.fetch_met_object(45734, client)

    assert result["is_on_view"] is False
    assert result["gallery_number"] == ""


async def test_fetch_met_object_returns_none_on_http_error():
    client = _FakeAsyncClient(response=_FakeResponse({}, status_code=404))

    result = await met_museum.fetch_met_object(999999999, client)

    assert result is None


async def test_fetch_met_object_returns_none_on_request_exception():
    client = _FakeAsyncClient(exc=Exception("connection reset"))

    result = await met_museum.fetch_met_object(436524, client)

    assert result is None


async def test_fetch_met_image_bytes_returns_content_on_success():
    client = _FakeAsyncClient(response=_FakeResponse(content=b"fake-jpeg-bytes"))

    result = await met_museum.fetch_met_image_bytes("https://images.metmuseum.org/example.jpg", client)

    assert result == b"fake-jpeg-bytes"


async def test_fetch_met_image_bytes_returns_none_for_empty_url():
    client = _FakeAsyncClient()

    result = await met_museum.fetch_met_image_bytes("", client)

    assert result is None


async def test_fetch_met_image_bytes_returns_none_on_failure():
    client = _FakeAsyncClient(exc=Exception("timeout"))

    result = await met_museum.fetch_met_image_bytes("https://images.metmuseum.org/example.jpg", client)

    assert result is None
