// authFetch isn't exported directly — exercised through narrateBlock, one
// of its many callers, since the retry-on-401 logic lives entirely inside
// authFetch and behaves identically regardless of which endpoint calls it.

jest.mock("../auth", () => ({
  getToken: jest.fn(),
  refreshToken: jest.fn(),
}));

import { narrateBlock } from "../api";
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

  it("prefers the top-level error message over the nested detail.error shape", async () => {
    mockGetToken.mockReturnValue("valid-token");
    global.fetch = jest.fn().mockResolvedValue({
      status: 400, ok: false,
      json: async () => ({ error: "top-level message", detail: { error: "nested message" } }),
    }) as any;

    await expect(callNarrateBlock()).rejects.toThrow("top-level message");
  });

  it("falls back to detail.error when there's no top-level error field", async () => {
    mockGetToken.mockReturnValue("valid-token");
    global.fetch = jest.fn().mockResolvedValue({
      status: 400, ok: false,
      json: async () => ({ detail: { error: "nested message" } }),
    }) as any;

    await expect(callNarrateBlock()).rejects.toThrow("nested message");
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
