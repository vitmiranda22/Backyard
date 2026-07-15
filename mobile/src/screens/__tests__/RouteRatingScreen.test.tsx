import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

jest.mock("../../services/api", () => ({ rateTour: jest.fn() }));
jest.mock("../../services/toast", () => ({ showToast: jest.fn() }));
jest.mock("../../services/haptics", () => ({ tap: jest.fn(), success: jest.fn() }));

import RouteRatingScreen from "../RouteRatingScreen";
import { rateTour } from "../../services/api";
import { showToast } from "../../services/toast";
import { success } from "../../services/haptics";

const mockRateTour = rateTour as jest.Mock;
const mockShowToast = showToast as jest.Mock;
const mockSuccess = success as jest.Mock;

function baseTour(overrides = {}) {
  return {
    tour_id: "tour-1",
    title: "Mission Murals",
    mood: "hidden_city",
    tour_type: "walking",
    city: "San Francisco",
    avg_rating: 4.5,
    rating_count: 10,
    blocks_visited: 5,
    total_distance_m: 2400,
    duration_sec: 1800,
    is_own_tour: false,
    is_anonymous: false,
    creator_display_name: "Alex",
    creator_avatar_url: null,
    created_at: "2026-07-01T00:00:00Z",
    blocks: [],
    like_count: 0,
    liked_by_me: false,
    path: [],
    ...overrides,
  };
}

describe("RouteRatingScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("disables the submit button until a star is selected", async () => {
    const { getByLabelText } = await render(<RouteRatingScreen tour={baseTour()} onDone={jest.fn()} />);

    const submitBtn = getByLabelText("routeRating.submitRatingA11y");
    expect(submitBtn.props.accessibilityState?.disabled).toBe(true);
  });

  it("submits the selected score and calls onDone", async () => {
    mockRateTour.mockResolvedValue({});
    const onDone = jest.fn();
    const { getByLabelText } = await render(<RouteRatingScreen tour={baseTour()} onDone={onDone} />);

    await fireEvent.press(getByLabelText('starRating.rateA11y {"star":4}'));
    await fireEvent.press(getByLabelText("routeRating.submitRatingA11y"));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(mockRateTour).toHaveBeenCalledWith("tour-1", 4);
    expect(mockSuccess).toHaveBeenCalled();
  });

  it("shows a toast but still calls onDone when submitting fails", async () => {
    mockRateTour.mockRejectedValue(new Error("network error"));
    const onDone = jest.fn();
    const { getByLabelText } = await render(<RouteRatingScreen tour={baseTour()} onDone={onDone} />);

    await fireEvent.press(getByLabelText('starRating.rateA11y {"star":3}'));
    await fireEvent.press(getByLabelText("routeRating.submitRatingA11y"));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(mockShowToast).toHaveBeenCalledWith("routeRating.couldntSubmit");
  });

  it("skips rating (calls onDone) without ever calling rateTour", async () => {
    const onDone = jest.fn();
    const { getByLabelText } = await render(<RouteRatingScreen tour={baseTour()} onDone={onDone} />);

    await fireEvent.press(getByLabelText("routeRating.skipRatingA11y"));

    expect(onDone).toHaveBeenCalled();
    expect(mockRateTour).not.toHaveBeenCalled();
  });

  it("falls back to 'Anonymous Explorer' when the tour has no creator name", async () => {
    const { getByText } = await render(
      <RouteRatingScreen tour={baseTour({ creator_display_name: null })} onDone={jest.fn()} />
    );

    expect(getByText('routeDetail.by {"name":"routeDetail.anonymousExplorer"}')).toBeTruthy();
  });
});
