import React from "react";
import { Alert } from "react-native";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";

// bearingBetween/distanceMeters/compassLabel are pure math — keep them
// real via requireActual, only mock the async/native calls.
jest.mock("../../services/location", () => {
  const actual = jest.requireActual("../../services/location");
  return {
    ...actual,
    watchPosition: jest.fn(),
    watchHeading: jest.fn(),
    getCurrentLocation: jest.fn(),
    snapToRoad: jest.fn().mockResolvedValue({ lat: 0, lng: 0 }),
  };
});
jest.mock("../../services/api", () => ({
  startTour: jest.fn(),
  narrateBlock: jest.fn(),
  saveBlock: jest.fn(),
  askQuestion: jest.fn(),
}));
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
        {props.streetName && <Text>{props.streetName}</Text>}
        <TouchableOpacity onPress={props.onAudioFinished}><Text>finish-audio</Text></TouchableOpacity>
        <TouchableOpacity onPress={props.onSkip}><Text>skip-narration</Text></TouchableOpacity>
      </View>
    );
  };
});
jest.mock("../../components/WaypointCompass", () => () => null);
jest.mock("../../components/AudioPlayer", () => () => null);

import ActiveTourScreen from "../ActiveTourScreen";
import { startTour, narrateBlock, saveBlock, askQuestion } from "../../services/api";
import { watchPosition, watchHeading, getCurrentLocation } from "../../services/location";
import { startRecording, stopRecording } from "../../services/recording";

const mockStartTour = startTour as jest.Mock;
const mockNarrateBlock = narrateBlock as jest.Mock;
const mockSaveBlock = saveBlock as jest.Mock;
const mockAskQuestion = askQuestion as jest.Mock;
const mockWatchPosition = watchPosition as jest.Mock;
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
  });

  afterEach(() => {
    jest.restoreAllMocks(); // undoes any per-test Date.now spy
  });

  it("starts a tour and narrates block 1 at the initial GPS fix", async () => {
    await renderStarted();

    expect(mockStartTour).toHaveBeenCalledWith("time_machine", "neutral", false);
    expect(mockNarrateBlock).toHaveBeenCalledWith(37.77, -122.41, "time_machine", "neutral", false, "auto", "tour-1");
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

  it("auto-completes the tour immediately when the block cap is hit with no audio to finish", async () => {
    // Free tier caps at 5 blocks (FREE_MAX_BLOCKS) -- return blocks with NO
    // audio_url so there's nothing to wait on, forcing immediate completion.
    let clock = 1_700_000_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => clock);

    mockNarrateBlock.mockResolvedValue(narration({ audio_url: null, audio_r2_key: null }));
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

  it("calls onEndTour with the current block count and path when End is pressed", async () => {
    const onEndTour = jest.fn();
    const { findByLabelText } = await renderStarted({ onEndTour });

    await fireEvent.press(await findByLabelText("activeTour.endTourA11y"));

    expect(onEndTour).toHaveBeenCalledWith("tour-1", 1, expect.any(Number), expect.any(Array));
    expect(removeSpy).toHaveBeenCalled();
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
});
