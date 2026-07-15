import React from "react";
import { Alert, TouchableOpacity, Text } from "react-native";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

jest.mock("../../services/location", () => ({
  getCurrentLocation: jest.fn(),
  watchPosition: jest.fn(),
}));
jest.mock("../../services/api", () => ({ getTourDetail: jest.fn() }));
jest.mock("../../services/toast", () => ({ showToast: jest.fn() }));

// NarrationCard pulls in AudioPlayer (expo-av) — out of scope for testing
// ReplayScreen's own waypoint-advancement logic, so replace it with a
// minimal stand-in that exposes its callback props as pressable buttons.
jest.mock("../../components/NarrationCard", () => {
  const { TouchableOpacity, Text } = require("react-native");
  return function MockNarrationCard(props: any) {
    return (
      <>
        <Text>{props.streetName}</Text>
        <TouchableOpacity onPress={props.onAudioFinished}><Text>finish-audio</Text></TouchableOpacity>
        <TouchableOpacity onPress={props.onSkip}><Text>skip</Text></TouchableOpacity>
        <TouchableOpacity onPress={props.onAudioError}><Text>audio-error</Text></TouchableOpacity>
      </>
    );
  };
});

import ReplayScreen from "../ReplayScreen";
import { getCurrentLocation, watchPosition } from "../../services/location";
import { getTourDetail } from "../../services/api";
import { showToast } from "../../services/toast";

const mockGetCurrentLocation = getCurrentLocation as jest.Mock;
const mockWatchPosition = watchPosition as jest.Mock;
const mockGetTourDetail = getTourDetail as jest.Mock;
const mockShowToast = showToast as jest.Mock;

// Block coordinates near San Francisco, spaced far enough apart (~1km+)
// that being "close" to one means being far from the others.
const BLOCK_A = { block_id: "b1", sequence: 1, street_name: "24th St", neighborhood: "", lat: 37.75, lng: -122.41, narration_text: "History A", audio_url: "https://x/a.mp3", image_url: null, voice: "neutral", mood: "hidden_city" };
const BLOCK_B = { block_id: "b2", sequence: 2, street_name: "Valencia St", neighborhood: "", lat: 37.76, lng: -122.42, narration_text: "History B", audio_url: "https://x/b.mp3", image_url: null, voice: "neutral", mood: "hidden_city" };

function baseTour(overrides = {}) {
  return {
    tour_id: "tour-1",
    title: "Mission Walk",
    mood: "hidden_city",
    tour_type: "walking",
    city: "San Francisco",
    avg_rating: 0,
    rating_count: 0,
    blocks_visited: 2,
    total_distance_m: 1000,
    duration_sec: 900,
    is_own_tour: false,
    is_anonymous: false,
    creator_display_name: "Sam",
    creator_avatar_url: null,
    created_at: "2026-07-01T00:00:00Z",
    blocks: [BLOCK_A, BLOCK_B],
    like_count: 0,
    liked_by_me: false,
    path: [],
    ...overrides,
  };
}

const removeSpy = jest.fn();

describe("ReplayScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockWatchPosition.mockResolvedValue({ remove: removeSpy });
  });

  it("shows the first block's narration immediately when starting right next to it", async () => {
    mockGetCurrentLocation.mockResolvedValue({ lat: BLOCK_A.lat, lng: BLOCK_A.lng });

    const { findByText } = await render(
      <ReplayScreen tour={baseTour()} onReplayComplete={jest.fn()} onExit={jest.fn()} />
    );

    expect(await findByText("24th St")).toBeTruthy();
  });

  it("shows the 'walk toward' prompt (not narration) when starting far from every block", async () => {
    mockGetCurrentLocation.mockResolvedValue({ lat: 10, lng: 10 }); // far from both blocks

    const { findByText, queryByText } = await render(
      <ReplayScreen tour={baseTour()} onReplayComplete={jest.fn()} onExit={jest.fn()} />
    );

    expect(await findByText('replay.walkToward {"street":"24th St"}')).toBeTruthy();
    expect(queryByText("History A")).toBeNull();
  });

  it("triggers narration once a GPS update brings the walker within range", async () => {
    mockGetCurrentLocation.mockResolvedValue({ lat: 10, lng: 10 });
    let positionCallback: (lat: number, lng: number) => void = () => {};
    mockWatchPosition.mockImplementation(async (cb: any) => {
      positionCallback = cb;
      return { remove: removeSpy };
    });

    const { findByText } = await render(
      <ReplayScreen tour={baseTour()} onReplayComplete={jest.fn()} onExit={jest.fn()} />
    );
    await findByText('replay.walkToward {"street":"24th St"}');

    await require("@testing-library/react-native").act(async () => {
      positionCallback(BLOCK_A.lat, BLOCK_A.lng);
    });

    expect(await findByText("24th St")).toBeTruthy();
  });

  it("advances to the next waypoint when the current audio finishes", async () => {
    mockGetCurrentLocation.mockResolvedValue({ lat: BLOCK_A.lat, lng: BLOCK_A.lng });

    const { findByText } = await render(
      <ReplayScreen tour={baseTour()} onReplayComplete={jest.fn()} onExit={jest.fn()} />
    );
    await findByText("24th St");

    await fireEvent.press(await findByText("finish-audio"));

    // Not yet close to block B, so it should show the walk-toward prompt for it.
    expect(await findByText('replay.walkToward {"street":"Valencia St"}')).toBeTruthy();
  });

  it("calls onReplayComplete after finishing the last block", async () => {
    // Single-block tour so the very next advance is the end.
    mockGetCurrentLocation.mockResolvedValue({ lat: BLOCK_A.lat, lng: BLOCK_A.lng });
    const onReplayComplete = jest.fn();

    const { findByText } = await render(
      <ReplayScreen tour={baseTour({ blocks: [BLOCK_A] })} onReplayComplete={onReplayComplete} onExit={jest.fn()} />
    );
    await findByText("24th St");

    await fireEvent.press(await findByText("skip"));

    expect(onReplayComplete).toHaveBeenCalledWith("tour-1");
    expect(removeSpy).toHaveBeenCalled();
  });

  it("refetches the tour for fresh signed URLs on an audio error", async () => {
    mockGetCurrentLocation.mockResolvedValue({ lat: BLOCK_A.lat, lng: BLOCK_A.lng });
    mockGetTourDetail.mockResolvedValue(baseTour({ blocks: [{ ...BLOCK_A, audio_url: "https://x/fresh.mp3" }, BLOCK_B] }));

    const { findByText } = await render(
      <ReplayScreen tour={baseTour()} onReplayComplete={jest.fn()} onExit={jest.fn()} />
    );
    await findByText("24th St");

    await fireEvent.press(await findByText("audio-error"));

    await waitFor(() => expect(mockGetTourDetail).toHaveBeenCalledWith("tour-1"));
  });

  it("shows a toast when refreshing audio fails", async () => {
    mockGetCurrentLocation.mockResolvedValue({ lat: BLOCK_A.lat, lng: BLOCK_A.lng });
    mockGetTourDetail.mockRejectedValue(new Error("network error"));

    const { findByText } = await render(
      <ReplayScreen tour={baseTour()} onReplayComplete={jest.fn()} onExit={jest.fn()} />
    );
    await findByText("24th St");

    await fireEvent.press(await findByText("audio-error"));

    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith("replay.couldntRefreshAudio"));
  });

  it("calls onExit when the exit link is pressed", async () => {
    mockGetCurrentLocation.mockResolvedValue({ lat: BLOCK_A.lat, lng: BLOCK_A.lng });
    const onExit = jest.fn();

    const { findByText } = await render(
      <ReplayScreen tour={baseTour()} onReplayComplete={jest.fn()} onExit={onExit} />
    );
    await findByText("24th St");

    await fireEvent.press(await findByText("‹ replay.exit"));

    expect(onExit).toHaveBeenCalled();
  });

  it("shows an alert when getting the initial location fails", async () => {
    mockGetCurrentLocation.mockRejectedValue(new Error("GPS unavailable"));

    await render(<ReplayScreen tour={baseTour()} onReplayComplete={jest.fn()} onExit={jest.fn()} />);

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith(
      "common.error",
      'replay.failedToGetLocation {"error":"GPS unavailable"}'
    ));
  });
});
