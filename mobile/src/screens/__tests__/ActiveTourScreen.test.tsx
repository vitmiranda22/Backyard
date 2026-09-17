import React from "react";
import { Alert } from "react-native";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import ngeohash from "ngeohash";
import { GEOHASH_PRECISION } from "../../config";

// bearingBetween/distanceMeters/compassLabel are pure math — keep them
// real via requireActual, only mock the async/native calls.
jest.mock("../../services/location", () => {
  const actual = jest.requireActual("../../services/location");
  return {
    ...actual,
    watchPosition: jest.fn(),
    watchHeading: jest.fn(),
    getCurrentLocation: jest.fn(),
    snapSegmentToRoad: jest.fn().mockResolvedValue([{ lat: 0, lng: 0 }]),
  };
});
jest.mock("../../services/api", () => {
  // A standalone re-implementation, not jest.requireActual("../../services/api")
  // -- that module also imports ./auth, which has real side effects that
  // hang under the test renderer. Defined inline (not hoisted out of the
  // factory) since jest.mock factories can only reference out-of-scope
  // variables prefixed with "mock". This just needs to match the real
  // ApiError shape so `e instanceof ApiError` in the component under test
  // behaves the same way against errors these mocks reject with.
  class ApiError extends Error {
    status: number;
    code?: string;
    retry: boolean;
    constructor(message: string, status: number, code?: string, retry = false) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.code = code;
      this.retry = retry;
    }
  }

  return {
    ApiError,
    startTour: jest.fn(),
    narrateBlock: jest.fn(),
    prefetchZone: jest.fn().mockResolvedValue(undefined),
    getPendingTransition: jest.fn().mockResolvedValue({ ready: false, transition_text: null }),
    saveBlock: jest.fn(),
    askQuestion: jest.fn(),
    endTour: jest.fn(),
    reportExploredCell: jest.fn().mockResolvedValue({ geo_hash: "u0" }),
  };
});
jest.mock("../../services/recording", () => ({
  startRecording: jest.fn(),
  stopRecording: jest.fn(),
  cancelRecording: jest.fn(),
}));
jest.mock("../../services/notifications", () => ({
  scheduleUnfinishedTourReminder: jest.fn(),
  cancelReminder: jest.fn(),
}));
jest.mock("../../services/audioCache", () => ({ cacheAudio: jest.fn().mockResolvedValue(null) }));
jest.mock("../../services/toast", () => ({ showToast: jest.fn() }));
jest.mock("../../services/haptics", () => ({ tap: jest.fn() }));
// @sentry/react-native ships ESM that jest's default transformIgnorePatterns
// won't transform -- a bare mock avoids needing a transform override.
jest.mock("@sentry/react-native", () => ({ captureException: jest.fn() }));
jest.mock("expo-av", () => ({
  Audio: { Sound: { createAsync: jest.fn() } },
}));

let mockCheckZone: jest.Mock;
let mockCommitZone: jest.Mock;
let mockResetZones: jest.Mock;
jest.mock("../../hooks/useZoneTracker", () => ({
  useZoneTracker: () => ({
    checkZone: mockCheckZone,
    commitZone: mockCommitZone,
    reset: mockResetZones,
  }),
}));

jest.mock("../../components/NarrationCard", () => {
  const { View, Text, TouchableOpacity } = require("react-native");
  return function MockNarrationCard(props: any) {
    return (
      <View>
        {props.isLoading && <Text>narration-loading</Text>}
        {props.error && <Text>{props.error}</Text>}
        {props.streetName && <Text>{props.streetName}</Text>}
        {props.transitionPrefix && <Text>transition:{props.transitionPrefix}</Text>}
        {props.closingSuffix && <Text>closing:{props.closingSuffix}</Text>}
        <TouchableOpacity onPress={props.onAudioFinished}><Text>finish-audio</Text></TouchableOpacity>
        <TouchableOpacity onPress={props.onSkip}><Text>skip-narration</Text></TouchableOpacity>
        <TouchableOpacity onPress={props.onRetry}><Text>retry-narration</Text></TouchableOpacity>
      </View>
    );
  };
});
jest.mock("../../components/WaypointCompass", () => () => null);
jest.mock("../../components/AudioPlayer", () => () => null);

import ActiveTourScreen from "../ActiveTourScreen";
import { startTour, narrateBlock, getPendingTransition, saveBlock, askQuestion, endTour, ApiError } from "../../services/api";
import * as Sentry from "@sentry/react-native";
import { watchPosition, watchHeading, getCurrentLocation, snapSegmentToRoad } from "../../services/location";
import { startRecording, stopRecording } from "../../services/recording";

const mockStartTour = startTour as jest.Mock;
const mockNarrateBlock = narrateBlock as jest.Mock;
const mockGetPendingTransition = getPendingTransition as jest.Mock;
const mockSaveBlock = saveBlock as jest.Mock;
const mockAskQuestion = askQuestion as jest.Mock;
const mockEndTour = endTour as jest.Mock;
const mockWatchPosition = watchPosition as jest.Mock;
const mockSnapSegmentToRoad = snapSegmentToRoad as jest.Mock;
const mockWatchHeading = watchHeading as jest.Mock;
const mockGetCurrentLocation = getCurrentLocation as jest.Mock;
const mockStartRecording = startRecording as jest.Mock;
const mockStopRecording = stopRecording as jest.Mock;

const removeSpy = jest.fn();

function narration(overrides = {}) {
  return {
    street_name: "24th St",
    neighborhood: "Mission",
    city: "San Francisco",
    narration_text: "Some history.",
    audio_url: "https://x/audio.mp3",
    audio_r2_key: "audio/x.mp3",
    audio_duration_ms: 5000,
    image_url: null,
    image_r2_key: null,
    mood: "time_machine",
    content_safety_applied: false,
    cached: false,
    ...overrides,
  };
}

function baseProps(overrides = {}) {
  return {
    mood: "time_machine",
    voice: "neutral",
    contentSafety: false,
    isPremium: false,
    onEndTour: jest.fn(),
    ...overrides,
  };
}

async function renderStarted(propsOverrides = {}, startTourOverrides = {}) {
  mockStartTour.mockResolvedValue({
    tour_id: "tour-1", mood: "time_machine", voice: "neutral", tour_type: "walking",
    started_at: "2026-07-15T00:00:00Z", intro_audio_url: null, guide_name: null,
    ...startTourOverrides,
  });
  mockGetCurrentLocation.mockResolvedValue({ lat: 37.77, lng: -122.41 });
  const result = await render(<ActiveTourScreen {...baseProps(propsOverrides)} />);
  await result.findByText("24th St");
  return result;
}

describe("ActiveTourScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockCheckZone = jest.fn().mockReturnValue({ isNewZone: false, geoHash: "" });
    mockCommitZone = jest.fn();
    mockResetZones = jest.fn();
    mockWatchPosition.mockResolvedValue({ remove: removeSpy });
    mockWatchHeading.mockResolvedValue({ remove: removeSpy });
    mockNarrateBlock.mockResolvedValue(narration());
    mockSaveBlock.mockResolvedValue({ block_id: "b1", sequence: 1 });
    // No outro by default -- playOutro() is only exercised by the
    // dedicated auto-complete test below, which overrides this.
    mockEndTour.mockResolvedValue({ mood: "time_machine", outro_audio_url: null });
  });

  afterEach(() => {
    jest.restoreAllMocks(); // undoes any per-test Date.now spy
  });

  it("starts a tour and narrates block 1 at the initial GPS fix", async () => {
    await renderStarted();

    expect(mockStartTour).toHaveBeenCalledWith("time_machine", "neutral", false);
    expect(mockNarrateBlock).toHaveBeenCalledWith(37.77, -122.41, "time_machine", "neutral", false, "auto", "tour-1", false);
  });

  it("retries narration at the current location when Retry is pressed after a failure", async () => {
    mockStartTour.mockResolvedValue({
      tour_id: "tour-1", mood: "time_machine", voice: "neutral", tour_type: "walking",
      started_at: "2026-07-15T00:00:00Z", intro_audio_url: null, guide_name: null,
    });
    mockGetCurrentLocation.mockResolvedValue({ lat: 37.77, lng: -122.41 });
    // A plain Error (not an ApiError) means authFetch never got a real
    // response at all -- a timeout or dropped connection, not a backend
    // status/code. See the dedicated error-type tests below for the
    // ApiError-branch cases (rate limits, generation_failed, unexpected).
    mockNarrateBlock.mockRejectedValueOnce(new Error("network error"));

    const { findByText } = await render(<ActiveTourScreen {...baseProps()} />);
    await findByText("activeTour.narrationNetworkError");
    expect(mockNarrateBlock).toHaveBeenCalledTimes(1);

    await fireEvent.press(await findByText("retry-narration"));

    await findByText("24th St");
    expect(mockNarrateBlock).toHaveBeenCalledTimes(2);
    expect(mockNarrateBlock).toHaveBeenLastCalledWith(37.77, -122.41, "time_machine", "neutral", false, "manual", "tour-1", false);
  });

  it("shows the daily-limit message and does not report to Sentry for a daily_limit_exceeded ApiError", async () => {
    mockNarrateBlock.mockRejectedValueOnce(new ApiError("hit today's limit", 429, "daily_limit_exceeded", false));

    const { findByText } = await render(<ActiveTourScreen {...baseProps()} />);

    await findByText("activeTour.narrationDailyLimitError");
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("shows the minute-limit message for a minute_limit_exceeded ApiError", async () => {
    mockNarrateBlock.mockRejectedValueOnce(new ApiError("slow down", 429, "minute_limit_exceeded", true));

    const { findByText } = await render(<ActiveTourScreen {...baseProps()} />);

    await findByText("activeTour.narrationMinuteLimitError");
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("shows the original keep-walking message for a generation_failed ApiError", async () => {
    mockNarrateBlock.mockRejectedValueOnce(new ApiError("no story here", 408, "generation_failed", true));

    const { findByText } = await render(<ActiveTourScreen {...baseProps()} />);

    await findByText("activeTour.narrationError");
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("reports an unrecognized ApiError to Sentry with location/mood/tour context", async () => {
    mockNarrateBlock.mockRejectedValueOnce(new ApiError("server exploded", 500, undefined, false));

    const { findByText } = await render(<ActiveTourScreen {...baseProps()} />);

    await findByText("activeTour.narrationError");
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    const [error, context] = (Sentry.captureException as jest.Mock).mock.calls[0];
    expect(error.message).toBe("server exploded");
    expect(context.extra).toMatchObject({
      lat: 37.77, lng: -122.41, mood: "time_machine", tourId: "tour-1", status: 500,
    });
  });

  it("shows the safety modal immediately, and it doesn't block the tour from starting and narrating block 1 underneath it", async () => {
    const { getByText } = await renderStarted();

    // renderStarted() already waits for block 1's narration to land ("24th
    // St") -- getting there proves startTour/narrateBlock ran to
    // completion while the modal was still up, since nothing here ever
    // pressed its CTA.
    expect(getByText("activeTour.safety.title")).toBeTruthy();
    expect(mockStartTour).toHaveBeenCalled();
    expect(mockNarrateBlock).toHaveBeenCalled();
  });

  it("dismisses the safety modal when its CTA is pressed", async () => {
    const { getByText, queryByText } = await renderStarted();
    expect(getByText("activeTour.safety.title")).toBeTruthy();

    await fireEvent.press(getByText("activeTour.safety.cta"));

    expect(queryByText("activeTour.safety.title")).toBeNull();
  });

  it("keeps the safety modal up as a loading screen if its CTA is pressed before block 1 is ready, then auto-continues", async () => {
    // The safety modal doubles as the tour's loading screen -- pressing
    // "let's walk" before the map/first block are actually ready shouldn't
    // reveal the bare loading placeholder underneath. It should show a
    // brief waiting state and continue on its own once narration lands.
    let resolveNarration: (v: any) => void = () => {};
    mockNarrateBlock.mockReturnValue(new Promise((resolve) => { resolveNarration = resolve; }));
    mockGetCurrentLocation.mockResolvedValue({ lat: 37.77, lng: -122.41 });
    mockStartTour.mockResolvedValue({
      tour_id: "tour-1", mood: "time_machine", voice: "neutral", tour_type: "walking",
      started_at: "2026-07-15T00:00:00Z", intro_audio_url: null, guide_name: null,
    });

    const { getByText, queryByText, findByText } = await render(<ActiveTourScreen {...baseProps()} />);

    await fireEvent.press(getByText("activeTour.safety.cta"));
    expect(queryByText("activeTour.safety.title")).toBeTruthy();
    expect(await findByText("activeTour.safety.preparingWalk")).toBeTruthy();

    await act(async () => {
      resolveNarration(narration());
    });

    await waitFor(() => expect(queryByText("activeTour.safety.title")).toBeNull());
  });

  it("saves the block once narration succeeds", async () => {
    await renderStarted();

    await waitFor(() => expect(mockSaveBlock).toHaveBeenCalled());
    expect(mockSaveBlock.mock.calls[0][0]).toMatchObject({
      tour_id: "tour-1", sequence: 1, street_name: "24th St",
    });
  });

  it("does not trigger a new narration while the current block's audio is still active", async () => {
    let positionCallback: (lat: number, lng: number) => void = () => {};
    mockWatchPosition.mockImplementation(async (cb: any) => {
      positionCallback = cb;
      return { remove: removeSpy };
    });
    mockCheckZone.mockReturnValue({ isNewZone: true, geoHash: "zone2" });
    await renderStarted();
    expect(mockNarrateBlock).toHaveBeenCalledTimes(1);

    await act(async () => {
      positionCallback(37.78, -122.42);
    });

    // hasActiveAudioRef is still true (onAudioFinished never fired) -- must
    // not have fired a second narration.
    expect(mockNarrateBlock).toHaveBeenCalledTimes(1);
    expect(mockCommitZone).not.toHaveBeenCalled();
  });

  it("triggers a new narration on a new zone once the previous audio has finished", async () => {
    // triggerNarration debounces on real Date.now() (10s), independent of
    // React state/fake timers -- advance the mocked clock past it before
    // the second simulated GPS update, or it gets silently swallowed.
    let clock = 1_700_000_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => clock);

    let positionCallback: (lat: number, lng: number) => void = () => {};
    mockWatchPosition.mockImplementation(async (cb: any) => {
      positionCallback = cb;
      return { remove: removeSpy };
    });
    mockCheckZone.mockReturnValue({ isNewZone: true, geoHash: "zone2" });
    const { findByText } = await renderStarted();
    expect(mockNarrateBlock).toHaveBeenCalledTimes(1);

    await fireEvent.press(await findByText("finish-audio"));

    mockNarrateBlock.mockResolvedValue(narration({ street_name: "Valencia St" }));
    clock += 11_000;
    await act(async () => {
      positionCallback(37.78, -122.42);
    });

    await waitFor(() => expect(mockNarrateBlock).toHaveBeenCalledTimes(2));
    expect(mockCommitZone).toHaveBeenCalledWith("zone2");
  });

  it("caps the drawn route line's point count on a long tour instead of letting it grow unbounded", async () => {
    let positionCallback: (lat: number, lng: number) => void = () => {};
    mockWatchPosition.mockImplementation(async (cb: any) => {
      positionCallback = cb;
      return { remove: removeSpy };
    });
    // Every GPS fix resolves a 4-point road-matched segment (not just one
    // point) -- this is what actually made the raw path grow fast enough
    // to matter on a real long tour (see snapSegmentToRoad in location.ts).
    mockSnapSegmentToRoad.mockImplementation(() =>
      Promise.resolve([{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }, { lat: 3, lng: 3 }, { lat: 4, lng: 4 }])
    );
    const { getByTestId } = await renderStarted();

    // 130 fixes x 4 points/fix + the initial point = 521 raw points --
    // comfortably past the 500-point display cap. Each step is ~33m
    // (0.0003 degrees latitude), safely over MIN_SNAP_SEGMENT_METERS so
    // every fix actually goes through snapSegmentToRoad instead of being
    // drawn as a short straight raw segment.
    for (let i = 0; i < 130; i++) {
      await act(async () => {
        positionCallback(37.78 + i * 0.0003, -122.42);
      });
    }

    const drawnPoints = getByTestId("route-polyline").props.coordinates.length;
    expect(drawnPoints).toBeLessThanOrEqual(500);
    // Not just capped -- actually thinned, not coincidentally under the cap.
    expect(drawnPoints).toBeLessThan(521);
  });

  it("draws a short GPS fix as a straight raw segment instead of map-matching it, when it's under the minimum snap distance", async () => {
    // Regression guard: watchPosition can fire as often as every 5m, well
    // within normal GPS jitter -- map-matching a segment that short was
    // occasionally snapping onto the wrong nearby pedestrian way (a
    // parking lot walkway, a courtyard) instead of the street, drawing
    // the live trail visibly through a building.
    let positionCallback: (lat: number, lng: number) => void = () => {};
    mockWatchPosition.mockImplementation(async (cb: any) => {
      positionCallback = cb;
      return { remove: removeSpy };
    });
    const { getByTestId } = await renderStarted();
    mockSnapSegmentToRoad.mockClear();

    // ~11m north of the initial (37.77, -122.41) fix -- past the noise
    // floor (8m) but comfortably under MIN_SNAP_SEGMENT_METERS (15m).
    await act(async () => {
      positionCallback(37.7701, -122.41);
    });

    expect(mockSnapSegmentToRoad).not.toHaveBeenCalled();
    const coords = getByTestId("route-polyline").props.coordinates;
    expect(coords).toEqual([
      { latitude: 37.77, longitude: -122.41 },
      { latitude: 37.7701, longitude: -122.41 },
    ]);
  });

  it("does not add a point (or advance its anchor) for a GPS fix under the noise floor", async () => {
    // Regression guard: ordinary GPS noise while standing still (worse in
    // "urban canyon" spots) routinely reports a few meters of "movement"
    // that never happened. Below MIN_DRAW_SEGMENT_METERS this must be
    // ignored entirely -- not drawn, and not advance the anchor used to
    // measure the NEXT fix -- or repeated noise in different directions
    // tangles into a visible scribble on the map.
    let positionCallback: (lat: number, lng: number) => void = () => {};
    mockWatchPosition.mockImplementation(async (cb: any) => {
      positionCallback = cb;
      return { remove: removeSpy };
    });
    const { queryByTestId } = await renderStarted();
    mockSnapSegmentToRoad.mockClear();

    // ~4.4m north of the initial (37.77, -122.41) fix -- under
    // MIN_DRAW_SEGMENT_METERS (8m).
    await act(async () => {
      positionCallback(37.77004, -122.41);
    });

    expect(mockSnapSegmentToRoad).not.toHaveBeenCalled();
    // RoutePolyline only renders once there are 2+ points -- still just
    // the initial point, so nothing should have been added at all.
    expect(queryByTestId("route-polyline")).toBeNull();
  });

  it("keeps measuring from the original anchor after a below-floor fix, so real sustained movement still gets drawn correctly", async () => {
    let positionCallback: (lat: number, lng: number) => void = () => {};
    mockWatchPosition.mockImplementation(async (cb: any) => {
      positionCallback = cb;
      return { remove: removeSpy };
    });
    const { getByTestId } = await renderStarted();
    mockSnapSegmentToRoad.mockClear();

    // First a below-floor jitter (~4.4m, ignored)...
    await act(async () => {
      positionCallback(37.77004, -122.41);
    });
    // ...then a fix that's ~8.9m from the ORIGINAL anchor (37.77), not
    // from the ignored jitter point -- still measured against the real
    // last-drawn point, so it correctly crosses the noise floor.
    await act(async () => {
      positionCallback(37.77008, -122.41);
    });

    expect(mockSnapSegmentToRoad).not.toHaveBeenCalled();
    expect(getByTestId("route-polyline").props.coordinates).toEqual([
      { latitude: 37.77, longitude: -122.41 },
      { latitude: 37.77008, longitude: -122.41 },
    ]);
  });

  it("auto-completes the tour immediately when the block cap is hit with no audio to finish, calling /end-tour and playing the outro before onEndTour fires", async () => {
    // Free tier caps at 5 blocks (FREE_MAX_BLOCKS) -- return blocks with NO
    // audio_url so there's nothing to wait on, forcing immediate completion.
    let clock = 1_700_000_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => clock);

    mockNarrateBlock.mockResolvedValue(narration({ audio_url: null, audio_r2_key: null }));
    const endTourResult = { mood: "time_machine", outro_audio_url: "https://x/outro.mp3" };
    mockEndTour.mockResolvedValue(endTourResult);
    const { Audio } = require("expo-av");
    (Audio.Sound.createAsync as jest.Mock).mockResolvedValue({
      sound: {
        // Resolves playback immediately instead of leaving the real 15s
        // timeout in playOutro() to fire after the test has finished.
        setOnPlaybackStatusUpdate: (cb: (status: any) => void) => cb({ isLoaded: true, didJustFinish: true }),
        unloadAsync: jest.fn().mockResolvedValue(undefined),
      },
    });
    let positionCallback: (lat: number, lng: number) => void = () => {};
    mockWatchPosition.mockImplementation(async (cb: any) => {
      positionCallback = cb;
      return { remove: removeSpy };
    });
    let zoneCounter = 0;
    mockCheckZone.mockImplementation(() => ({ isNewZone: true, geoHash: `zone${++zoneCounter}` }));
    const onEndTour = jest.fn();
    await renderStarted({ onEndTour });

    for (let i = 0; i < 4; i++) {
      clock += 11_000;
      await act(async () => {
        positionCallback(37.77 + i * 0.001, -122.41);
      });
    }

    await waitFor(() => expect(onEndTour).toHaveBeenCalled());
    expect(onEndTour.mock.calls[0][0]).toBe("tour-1");
    expect(onEndTour.mock.calls[0][1]).toBe(5); // blocksVisited === MAX_BLOCKS
    expect(mockEndTour).toHaveBeenCalledWith("tour-1", 5 * 150, expect.any(Number), expect.any(Array));
    expect(Audio.Sound.createAsync).toHaveBeenCalledWith({ uri: "https://x/outro.mp3" }, { shouldPlay: true });
    // The prefetched result travels up through onEndTour so
    // TourCompleteScreen never has to fetch (and re-generate) it itself.
    expect(onEndTour.mock.calls[0][4]).toEqual(endTourResult);
  });

  it("ends the tour gracefully with an outro when today's daily limit is hit mid-walk, instead of a dead-end error", async () => {
    // Real-world case: a free walker's daily narration budget got spent by
    // something other than this tour's own blocks (see the investigation --
    // a failed generation attempt earlier the same day silently used a
    // slot), so the walker hits daily_limit_exceeded after only 1 real
    // block instead of the full 5-block cap. This should read as "your
    // tour is done" (outro + save flow), not a dead-end error with a
    // "Try Again" that can never actually succeed before tomorrow.
    let clock = 1_700_000_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => clock);

    const endTourResult = { mood: "time_machine", outro_audio_url: "https://x/outro.mp3" };
    mockEndTour.mockResolvedValue(endTourResult);
    const { Audio } = require("expo-av");
    (Audio.Sound.createAsync as jest.Mock).mockResolvedValue({
      sound: {
        setOnPlaybackStatusUpdate: (cb: (status: any) => void) => cb({ isLoaded: true, didJustFinish: true }),
        unloadAsync: jest.fn().mockResolvedValue(undefined),
      },
    });
    let positionCallback: (lat: number, lng: number) => void = () => {};
    mockWatchPosition.mockImplementation(async (cb: any) => {
      positionCallback = cb;
      return { remove: removeSpy };
    });
    mockCheckZone.mockReturnValue({ isNewZone: true, geoHash: "zone2" });
    const onEndTour = jest.fn();

    const { findByText } = await renderStarted({ onEndTour }); // block 1 succeeds normally
    await fireEvent.press(await findByText("finish-audio")); // clears hasActiveAudioRef so the next zone can trigger

    mockNarrateBlock.mockRejectedValueOnce(new ApiError("hit today's limit", 429, "daily_limit_exceeded", false));
    clock += 11_000;
    await act(async () => {
      positionCallback(37.78, -122.42); // block 2's attempt hits the daily limit
    });

    await waitFor(() => expect(onEndTour).toHaveBeenCalled());
    expect(onEndTour.mock.calls[0][0]).toBe("tour-1");
    expect(onEndTour.mock.calls[0][1]).toBe(1); // only block 1 ever landed
    expect(mockEndTour).toHaveBeenCalledWith("tour-1", 1 * 150, expect.any(Number), expect.any(Array));
    expect(Audio.Sound.createAsync).toHaveBeenCalledWith({ uri: "https://x/outro.mp3" }, { shouldPlay: true });
  });

  it("still shows the plain daily-limit error when the very first block of a walk hits it (nothing yet to end gracefully)", async () => {
    mockNarrateBlock.mockRejectedValueOnce(new ApiError("hit today's limit", 429, "daily_limit_exceeded", false));

    const { findByText } = await render(<ActiveTourScreen {...baseProps()} />);

    await findByText("activeTour.narrationDailyLimitError");
    expect(mockEndTour).not.toHaveBeenCalled();
  });

  it("shows an alert and does not crash when startTour fails", async () => {
    mockStartTour.mockRejectedValue(new Error("Rate limited"));
    mockGetCurrentLocation.mockResolvedValue({ lat: 37.77, lng: -122.41 });

    await render(<ActiveTourScreen {...baseProps()} />);

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith(
      "common.error",
      'activeTour.startFailed {"error":"Rate limited"}'
    ));
  });

  it("shows a premium-required alert and never records when a free user holds the ask button", async () => {
    const { findByLabelText } = await renderStarted({ isPremium: false });

    const askBtn = await findByLabelText("activeTour.askPremiumA11y");
    await fireEvent(askBtn, "pressIn");

    expect(Alert.alert).toHaveBeenCalledWith("activeTour.premiumFeatureTitle", "activeTour.premiumFeatureBody");
    expect(mockStartRecording).not.toHaveBeenCalled();
  });

  it("records and asks a question for a premium user holding the ask button", async () => {
    mockStartRecording.mockResolvedValue(true);
    mockStopRecording.mockResolvedValue("file://recording.m4a");
    mockAskQuestion.mockResolvedValue({
      question_text: "What happened here?",
      answer_text: "Something interesting.",
      audio_url: null,
      audio_duration_ms: null,
    });
    const { findByLabelText, findByText } = await renderStarted({ isPremium: true });

    const askBtn = await findByLabelText("activeTour.holdToAsk");
    await fireEvent(askBtn, "pressIn");
    expect(mockStartRecording).toHaveBeenCalled();

    await fireEvent(askBtn, "pressOut");

    expect(await findByText("“What happened here?”")).toBeTruthy();
    expect(await findByText("Something interesting.")).toBeTruthy();
  });

  it("calls onEndTour with the current block count and path when End is pressed, without calling /end-tour or playing an outro (the walker chose to stop, not the app)", async () => {
    const onEndTour = jest.fn();
    const { findByLabelText } = await renderStarted({ onEndTour });

    await fireEvent.press(await findByLabelText("activeTour.endTourA11y"));

    expect(onEndTour).toHaveBeenCalledWith("tour-1", 1, expect.any(Number), expect.any(Array), null);
    expect(removeSpy).toHaveBeenCalled();
    expect(mockEndTour).not.toHaveBeenCalled();
    const { Audio } = require("expo-av");
    expect(Audio.Sound.createAsync).not.toHaveBeenCalled();
  });

  it("gives up on a guide intro that never loads and still starts block 1 (found in the field: a stalled network fetch previously had no bound at all)", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    mockStartTour.mockResolvedValue({
      tour_id: "tour-1", mood: "dark_side", voice: "neutral", tour_type: "walking",
      started_at: "2026-07-15T00:00:00Z", intro_audio_url: "https://x/intro.mp3", guide_name: "Silas",
    });
    mockGetCurrentLocation.mockResolvedValue({ lat: 37.77, lng: -122.41 });
    // Never resolves -- simulates a stalled fetch on a weak connection.
    const { Audio } = require("expo-av");
    (Audio.Sound.createAsync as jest.Mock).mockReturnValue(new Promise(() => {}));

    const { findByText } = await render(<ActiveTourScreen {...baseProps({ mood: "dark_side" })} />);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(8001);
    });

    expect(await findByText("24th St")).toBeTruthy();
    expect(mockNarrateBlock).toHaveBeenCalled();

    jest.useRealTimers();
  });

  describe("background connector transition poll", () => {
    // Matches the real pollForTransition constants (2s interval, 5 attempts)
    // in ActiveTourScreen.tsx -- kept in sync manually since they aren't exported.
    const POLL_INTERVAL_MS = 2000;

    it("picks up a connector transition once the background poll reports it ready, and shows it underlined", async () => {
      jest.useFakeTimers({ advanceTimers: true });
      mockGetPendingTransition
        .mockResolvedValueOnce({ ready: false, transition_text: null })
        .mockResolvedValueOnce({ ready: true, transition_text: "Meanwhile," });

      const { findByText } = await renderStarted();

      await act(async () => {
        await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2 + 100);
      });

      expect(await findByText("transition:Meanwhile,")).toBeTruthy();
      expect(mockGetPendingTransition).toHaveBeenCalledWith("tour-1", expect.any(String));

      jest.useRealTimers();
    });

    it("drops a late-arriving transition once the walker has advanced to a new block", async () => {
      jest.useFakeTimers({ advanceTimers: true });
      let clock = 1_700_000_000_000;
      jest.spyOn(Date, "now").mockImplementation(() => clock);

      let positionCallback: (lat: number, lng: number) => void = () => {};
      mockWatchPosition.mockImplementation(async (cb: any) => {
        positionCallback = cb;
        return { remove: removeSpy };
      });
      mockCheckZone.mockReturnValue({ isNewZone: true, geoHash: "zone2" });
      // Keyed by geohash (matching what pollForTransition itself computes
      // from lat/lng) rather than a plain call sequence, so this stays
      // correct regardless of which block's poll loop happens to fire
      // first once both are running concurrently: only block 1's geohash
      // ever reports ready=true, and it must still never surface, since by
      // then sequenceRef has already moved to block 2.
      const block1Hash = ngeohash.encode(37.77, -122.41, GEOHASH_PRECISION);
      mockGetPendingTransition.mockImplementation((_tourId: string, geoHash: string) =>
        Promise.resolve(
          geoHash === block1Hash
            ? { ready: true, transition_text: "Stale transition." }
            : { ready: false, transition_text: null }
        )
      );

      const { findByText, queryByText } = await renderStarted();
      expect(mockNarrateBlock).toHaveBeenCalledTimes(1);

      await fireEvent.press(await findByText("finish-audio"));

      mockNarrateBlock.mockResolvedValue(narration({ street_name: "Valencia St" }));
      clock += 11_000;
      await act(async () => {
        positionCallback(37.78, -122.42);
      });
      await waitFor(() => expect(mockNarrateBlock).toHaveBeenCalledTimes(2));
      await findByText("Valencia St");

      await act(async () => {
        await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 5 + 500);
      });

      expect(queryByText(/transition:/)).toBeNull();

      jest.useRealTimers();
    });

    it("flags the block expected to hit the free block cap as isFinalBlock, and shows its closing beat once ready", async () => {
      jest.useFakeTimers({ advanceTimers: true });
      let clock = 1_700_000_000_000;
      jest.spyOn(Date, "now").mockImplementation(() => clock);

      // No audio, so each block completes without needing a "finish-audio"
      // press between zone crossings (same trick the auto-complete test uses).
      mockNarrateBlock.mockResolvedValue(narration({ audio_url: null, audio_r2_key: null }));
      mockGetPendingTransition.mockResolvedValue({
        ready: true,
        transition_text: null,
        closing_text: "And that's the whole walk, right there.",
      });
      let positionCallback: (lat: number, lng: number) => void = () => {};
      mockWatchPosition.mockImplementation(async (cb: any) => {
        positionCallback = cb;
        return { remove: removeSpy };
      });
      let zoneCounter = 0;
      mockCheckZone.mockImplementation(() => ({ isNewZone: true, geoHash: `zone${++zoneCounter}` }));

      const { findByText } = await renderStarted(); // block 1 of 5 (FREE_MAX_BLOCKS)

      for (let i = 0; i < 4; i++) {
        clock += 11_000;
        await act(async () => {
          positionCallback(37.77 + i * 0.001, -122.41);
        });
      }
      await waitFor(() => expect(mockNarrateBlock).toHaveBeenCalledTimes(5));

      // isFinalBlock (the 8th positional arg) is only true on the 5th call.
      expect(mockNarrateBlock.mock.calls[0][7]).toBe(false);
      expect(mockNarrateBlock.mock.calls[3][7]).toBe(false);
      expect(mockNarrateBlock.mock.calls[4][7]).toBe(true);

      await act(async () => {
        await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS + 500);
      });

      expect(await findByText("closing:And that's the whole walk, right there.")).toBeTruthy();

      jest.useRealTimers();
    });
  });
});
