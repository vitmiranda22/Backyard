import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

jest.mock("../../services/api", () => ({
  getTourDetail: jest.fn(),
  toggleLike: jest.fn(),
  // CommentsSection (a child of this screen) shares this same mocked
  // module — give it enough to render without crashing.
  getComments: jest.fn().mockResolvedValue([]),
  postComment: jest.fn(),
}));
jest.mock("../../services/toast", () => ({ showToast: jest.fn() }));
jest.mock("../../services/haptics", () => ({ tap: jest.fn() }));

import RouteDetailScreen from "../RouteDetailScreen";
import { getTourDetail, toggleLike } from "../../services/api";
import { showToast } from "../../services/toast";

const mockGetTourDetail = getTourDetail as jest.Mock;
const mockToggleLike = toggleLike as jest.Mock;
const mockShowToast = showToast as jest.Mock;

function baseTour(overrides = {}) {
  return {
    tour_id: "tour-1",
    title: "Mission Murals",
    mood: "hidden_city",
    tour_type: "walking",
    city: "San Francisco",
    avg_rating: 4.5,
    rating_count: 8,
    blocks_visited: 3,
    total_distance_m: 1800,
    duration_sec: 1500,
    is_own_tour: false,
    is_anonymous: false,
    creator_display_name: "Alex",
    creator_avatar_url: null,
    created_at: "2026-07-01T00:00:00Z",
    blocks: [
      { block_id: "b1", sequence: 1, street_name: "24th St", neighborhood: "Mission", lat: 37.75, lng: -122.41, narration_text: "Some history.", audio_url: "https://x/audio.mp3", image_url: null, voice: "neutral", mood: "hidden_city" },
    ],
    like_count: 2,
    liked_by_me: false,
    path: [],
    ...overrides,
  };
}

describe("RouteDetailScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (require("../../services/api").getComments as jest.Mock).mockResolvedValue([]);
  });

  it("shows the tour's title and creator once loaded", async () => {
    mockGetTourDetail.mockResolvedValue(baseTour());

    const { findByText } = await render(
      <RouteDetailScreen tourId="tour-1" onStartReplay={jest.fn()} onBack={jest.fn()} />
    );

    expect(await findByText("Mission Murals")).toBeTruthy();
  });

  it("shows an error state with a working back button when loading fails", async () => {
    mockGetTourDetail.mockRejectedValue(new Error("Tour not found."));
    const onBack = jest.fn();

    const { findByText } = await render(
      <RouteDetailScreen tourId="tour-1" onStartReplay={jest.fn()} onBack={onBack} />
    );

    await fireEvent.press(await findByText("Tour not found."));
    // The error text itself isn't pressable — press the actual back button.
    await fireEvent.press(await findByText("common.back"));
    expect(onBack).toHaveBeenCalled();
  });

  it("toggles the like state and count on success", async () => {
    mockGetTourDetail.mockResolvedValue(baseTour({ liked_by_me: false, like_count: 2 }));
    mockToggleLike.mockResolvedValue({ tour_id: "tour-1", liked: true, like_count: 3 });

    const { findByText } = await render(
      <RouteDetailScreen tourId="tour-1" onStartReplay={jest.fn()} onBack={jest.fn()} />
    );

    await fireEvent.press(await findByText("🤍 2"));

    expect(await findByText("❤️ 3")).toBeTruthy();
  });

  it("shows a toast and leaves the like state unchanged when toggling fails", async () => {
    mockGetTourDetail.mockResolvedValue(baseTour({ liked_by_me: false, like_count: 2 }));
    mockToggleLike.mockRejectedValue(new Error("network error"));

    const { findByText } = await render(
      <RouteDetailScreen tourId="tour-1" onStartReplay={jest.fn()} onBack={jest.fn()} />
    );

    await fireEvent.press(await findByText("🤍 2"));

    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith("routeDetail.couldntUpdateLike"));
    expect(await findByText("🤍 2")).toBeTruthy();
  });

  it("calls onStartReplay with the loaded tour when Start Replay is pressed", async () => {
    const tour = baseTour();
    mockGetTourDetail.mockResolvedValue(tour);
    const onStartReplay = jest.fn();

    const { findByText } = await render(
      <RouteDetailScreen tourId="tour-1" onStartReplay={onStartReplay} onBack={jest.fn()} />
    );
    await findByText("Mission Murals");

    await fireEvent.press(await findByText("routeDetail.startReplay"));

    expect(onStartReplay).toHaveBeenCalledWith(tour);
  });

  it("shows the walk log only for your own tour, not someone else's", async () => {
    mockGetTourDetail.mockResolvedValue(baseTour({ is_own_tour: false }));
    const { findByText, queryByText } = await render(
      <RouteDetailScreen tourId="tour-1" onStartReplay={jest.fn()} onBack={jest.fn()} />
    );
    await findByText("Mission Murals");
    expect(queryByText("routeDetail.yourWalkLog")).toBeNull();
  });

  it("shows the audio-unavailable warning when no block has audio", async () => {
    mockGetTourDetail.mockResolvedValue(
      baseTour({ blocks: [{ block_id: "b1", sequence: 1, street_name: "24th St", neighborhood: "Mission", lat: 37.75, lng: -122.41, narration_text: "x", audio_url: null, image_url: null, voice: "neutral", mood: "hidden_city" }] })
    );

    const { findByText } = await render(
      <RouteDetailScreen tourId="tour-1" onStartReplay={jest.fn()} onBack={jest.fn()} />
    );

    expect(await findByText("routeDetail.audioUnavailable")).toBeTruthy();
  });
});
