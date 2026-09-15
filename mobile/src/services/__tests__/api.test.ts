// authFetch isn't exported directly — exercised through narrateBlock, one
// of its many callers, since the retry-on-401 logic lives entirely inside
// authFetch and behaves identically regardless of which endpoint calls it.

jest.mock("../auth", () => ({
  getToken: jest.fn(),
  refreshToken: jest.fn(),
}));

import { narrateBlock, getNearbyEvents, ApiError } from "../api";
import { getToken, refreshToken } from "../auth";

const mockGetToken = getToken as jest.Mock;
const mockRefreshToken = refreshToken as jest.Mock;

function callNarrateBlock() {
  return narrateBlock(37.77, -122.41, "time_machine", "neutral", false, "auto");
}

describe("authFetch (via narrateBlock)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockGetToken.mockClear();
    mockRefreshToken.mockClear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("throws immediately without ever calling fetch when there's no token", async () => {
    mockGetToken.mockReturnValue(null);
    global.fetch = jest.fn() as any;

    await expect(callNarrateBlock()).rejects.toThrow("Not authenticated");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns parsed JSON on a successful response", async () => {
    mockGetToken.mockReturnValue("valid-token");
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ narration_text: "hello" }),
    }) as any;

    const result = await callNarrateBlock();

    expect(result).toEqual({ narration_text: "hello" });
  });

  it("sends the token as a Bearer Authorization header", async () => {
    mockGetToken.mockReturnValue("my-jwt");
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({}),
    }) as any;

    await callNarrateBlock();

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(options.headers.Authorization).toBe("Bearer my-jwt");
  });

  it("on a 401, refreshes the token and retries exactly once", async () => {
    mockGetToken.mockReturnValue("stale-token");
    mockRefreshToken.mockResolvedValue("fresh-token");

    let callCount = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) {
        return Promise.resolve({ status: 401, ok: false, json: async () => ({ error: "expired" }) });
      }
      return Promise.resolve({ status: 200, ok: true, json: async () => ({ narration_text: "ok" }) });
    }) as any;

    const result = await callNarrateBlock();

    expect(mockRefreshToken).toHaveBeenCalledTimes(1);
    expect(callCount).toBe(2);
    expect(result).toEqual({ narration_text: "ok" });
  });

  it("does not retry a second time if the retried request is also a 401", async () => {
    mockGetToken.mockReturnValue("stale-token");
    mockRefreshToken.mockResolvedValue("still-stale-somehow");

    global.fetch = jest.fn().mockResolvedValue({
      status: 401, ok: false, json: async () => ({ error: "still unauthorized" }),
    }) as any;

    await expect(callNarrateBlock()).rejects.toThrow("still unauthorized");
    expect(mockRefreshToken).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(2); // original + one retry, never a third
  });

  it("falls through to normal error handling if refreshToken itself throws", async () => {
    mockGetToken.mockReturnValue("stale-token");
    mockRefreshToken.mockRejectedValue(new Error("refresh failed"));

    global.fetch = jest.fn().mockResolvedValue({
      status: 401, ok: false, json: async () => ({ error: "unauthorized" }),
    }) as any;

    await expect(callNarrateBlock()).rejects.toThrow("unauthorized");
    expect(global.fetch).toHaveBeenCalledTimes(1); // no retry attempted
  });

  it("prefers detail.error when detail is an object, even alongside a top-level error field", async () => {
    // Every real backend error is HTTPException(detail={"error":...,
    // "code":...,"retry":...}) -- a bare top-level `error` never coexists
    // with a real `detail` object in practice, but when it's present,
    // `detail` wins: it's also the only place `code`/`retry` live, so
    // preferring the top-level field would silently lose them.
    mockGetToken.mockReturnValue("valid-token");
    global.fetch = jest.fn().mockResolvedValue({
      status: 400, ok: false,
      json: async () => ({ error: "top-level message", detail: { error: "nested message" } }),
    }) as any;

    await expect(callNarrateBlock()).rejects.toThrow("nested message");
  });

  it("falls back to detail.error when there's no top-level error field", async () => {
    mockGetToken.mockReturnValue("valid-token");
    global.fetch = jest.fn().mockResolvedValue({
      status: 400, ok: false,
      json: async () => ({ detail: { error: "nested message" } }),
    }) as any;

    await expect(callNarrateBlock()).rejects.toThrow("nested message");
  });

  it("throws an ApiError carrying the real status/code/retry from a rate-limit response", async () => {
    // This is what let ActiveTourScreen tell a real 429 apart from a
    // generation_failed 408 or a genuine crash -- previously authFetch
    // discarded everything but the message string.
    mockGetToken.mockReturnValue("valid-token");
    global.fetch = jest.fn().mockResolvedValue({
      status: 429, ok: false,
      json: async () => ({
        detail: { error: "Too many requests", code: "minute_limit_exceeded", retry: true },
      }),
    }) as any;

    let caught: any;
    try {
      await callNarrateBlock();
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect(caught.status).toBe(429);
    expect(caught.code).toBe("minute_limit_exceeded");
    expect(caught.retry).toBe(true);
    expect(caught.message).toBe("Too many requests");
  });

  it("falls back to a generic HTTP-status message when the error body isn't JSON", async () => {
    mockGetToken.mockReturnValue("valid-token");
    global.fetch = jest.fn().mockResolvedValue({
      status: 500, ok: false,
      json: async () => { throw new Error("not json"); },
    }) as any;

    await expect(callNarrateBlock()).rejects.toThrow("HTTP 500");
  });

  it("aborts and throws a friendly message when a request hangs past the timeout", async () => {
    mockGetToken.mockReturnValue("valid-token");
    global.fetch = jest.fn().mockImplementation(
      (_url: string, options: any) =>
        new Promise((_resolve, reject) => {
          // A real hung request: nothing ever resolves fetch() on its own --
          // only AbortController firing (via authFetch's own timeout) ends it.
          options.signal.addEventListener("abort", () => {
            const err = new Error("Aborted");
            err.name = "AbortError";
            reject(err);
          });
        })
    ) as any;

    jest.useFakeTimers();
    const pending = callNarrateBlock();
    // Flushes pending microtasks between advancing the timer and awaiting
    // the rejection below, so the abort listener above has a chance to run.
    await Promise.resolve();
    jest.advanceTimersByTime(45000);
    await expect(pending).rejects.toThrow("too long to respond");
    jest.useRealTimers();
  });
});

describe("getNearbyEvents", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("builds the request URL with lat/lng and default radius/limit", async () => {
    mockGetToken.mockReturnValue("valid-token");
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => [],
    }) as any;

    await getNearbyEvents(37.7749, -122.4194);

    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain("/events/nearby?");
    expect(url).toContain("lat=37.7749");
    expect(url).toContain("lng=-122.4194");
    expect(url).toContain("radius_m=5000");
    expect(url).toContain("limit=50");
    expect(url).not.toContain("category=");
  });

  it("includes category only when explicitly passed", async () => {
    mockGetToken.mockReturnValue("valid-token");
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => [],
    }) as any;

    await getNearbyEvents(37.7749, -122.4194, { category: "festival", radiusM: 1000, limit: 10 });

    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain("category=festival");
    expect(url).toContain("radius_m=1000");
    expect(url).toContain("limit=10");
  });

  it("returns the parsed event list", async () => {
    mockGetToken.mockReturnValue("valid-token");
    const events = [{ id: "1", name: "Sunset Festival", phase: "happening" }];
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => events,
    }) as any;

    const result = await getNearbyEvents(37.7749, -122.4194);

    expect(result).toEqual(events);
  });
});
