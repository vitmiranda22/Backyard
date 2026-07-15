import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

jest.mock("../../services/api", () => ({ getUserStats: jest.fn() }));
jest.mock("../../services/toast", () => ({ showToast: jest.fn() }));

import BadgeGalleryScreen from "../BadgeGalleryScreen";
import { getUserStats } from "../../services/api";
import { showToast } from "../../services/toast";

const mockGetUserStats = getUserStats as jest.Mock;
const mockShowToast = showToast as jest.Mock;

function stats(overrides = {}) {
  return {
    tours_completed: 0,
    total_distance_m: 0,
    cities_visited: 0,
    moods_tried: [],
    routes_published: 0,
    total_likes_received: 0,
    walked_at_night: false,
    walked_early: false,
    ...overrides,
  };
}

describe("BadgeGalleryScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows a badge as unlocked once its real requirement is met", async () => {
    mockGetUserStats.mockResolvedValue(stats({ tours_completed: 1 }));

    const { findByText } = await render(<BadgeGalleryScreen onBack={jest.fn()} />);

    expect(await findByText("badgeGallery.unlocked")).toBeTruthy();
  });

  it("shows a locked badge's requirement text, not 'unlocked', when nothing is earned", async () => {
    mockGetUserStats.mockResolvedValue(stats());

    const { findByText, queryByText } = await render(<BadgeGalleryScreen onBack={jest.fn()} />);

    await findByText("badges.first_steps.label");
    expect(queryByText("badgeGallery.unlocked")).toBeNull();
    expect(await findByText("badges.first_steps.requirement")).toBeTruthy();
  });

  it("shows a toast and stops loading (doesn't hang) when the stats fetch fails", async () => {
    mockGetUserStats.mockRejectedValue(new Error("network error"));

    const { findByText, queryByText } = await render(<BadgeGalleryScreen onBack={jest.fn()} />);

    // The .then() that populates badges never runs on a rejected promise,
    // so the list stays empty — the bar here is "stops loading and warns
    // the user," not "recovers with a full badge list."
    await findByText("badgeGallery.title");
    expect(queryByText("badges.first_steps.label")).toBeNull();
    expect(mockShowToast).toHaveBeenCalledWith("badgeGallery.couldntLoad");
  });

  it("calls onBack when the back button is pressed", async () => {
    mockGetUserStats.mockResolvedValue(stats());
    const onBack = jest.fn();

    const { getByText, findByText } = await render(<BadgeGalleryScreen onBack={onBack} />);
    await findByText("badges.first_steps.label");

    await fireEvent.press(getByText("‹ common.back"));

    expect(onBack).toHaveBeenCalled();
  });
});
