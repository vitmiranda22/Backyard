import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

jest.mock("../../services/api", () => ({
  getTours: jest.fn(),
  getUserStats: jest.fn(),
}));
jest.mock("../../services/haptics", () => ({ tap: jest.fn() }));

import HomeScreen from "../HomeScreen";
import { getTours, getUserStats } from "../../services/api";

const mockGetTours = getTours as jest.Mock;
const mockGetUserStats = getUserStats as jest.Mock;

function baseProps(overrides = {}) {
  return {
    onStartTour: jest.fn(),
    onSelectRoute: jest.fn(),
    onOpenMap: jest.fn(),
    onOpenJournal: jest.fn(),
    onOpenProfile: jest.fn(),
    onOpenBadges: jest.fn(),
    ...overrides,
  };
}

const NO_STATS = {
  tours_completed: 0,
  total_distance_m: 0,
  cities_visited: 0,
  moods_tried: [],
  routes_published: 0,
  total_likes_received: 0,
  longest_streak_days: 0,
  night_streak_days: 0,
  early_streak_days: 0,
};

describe("HomeScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetTours.mockResolvedValue([]);
    mockGetUserStats.mockResolvedValue(NO_STATS);
  });

  it("calls onStartTour when the Explore FAB is pressed", async () => {
    const props = baseProps();

    const { findByLabelText } = await render(<HomeScreen {...props} />);
    fireEvent.press(await findByLabelText("home.explore"));

    expect(props.onStartTour).toHaveBeenCalled();
  });

  it("calls onOpenMap and onOpenJournal from their FABs", async () => {
    const props = baseProps();

    const { findByLabelText } = await render(<HomeScreen {...props} />);
    fireEvent.press(await findByLabelText("home.map"));
    fireEvent.press(await findByLabelText("home.journal"));

    expect(props.onOpenMap).toHaveBeenCalled();
    expect(props.onOpenJournal).toHaveBeenCalled();
  });

  it("calls onOpenProfile when the settings badge on the Journal FAB is pressed", async () => {
    const props = baseProps();

    const { findByLabelText } = await render(<HomeScreen {...props} />);
    fireEvent.press(await findByLabelText("home.settingsA11y"));

    expect(props.onOpenProfile).toHaveBeenCalled();
  });

  it("shows an empty state when there are no recent tours", async () => {
    mockGetTours.mockResolvedValue([]);

    const { findByText } = await render(<HomeScreen {...baseProps()} />);

    expect(await findByText("home.noRecentStories")).toBeTruthy();
  });

  it("renders recent tours and calls onSelectRoute when one is tapped", async () => {
    mockGetTours.mockResolvedValue([
      {
        tour_id: "t1",
        title: "Mission Evening",
        mood: "time_machine",
        city: "San Francisco",
        blocks_visited: 8,
        total_distance_m: 2400,
        duration_sec: 1800,
        created_at: "2026-01-01T00:00:00Z",
      },
    ]);
    const props = baseProps();

    const { findByText } = await render(<HomeScreen {...props} />);
    fireEvent.press(await findByText("Mission Evening"));

    expect(props.onSelectRoute).toHaveBeenCalledWith("t1");
  });

  it("shows a finished zero-distance tour as 0.0 km, not 'in progress'", async () => {
    // Regression guard: total_distance_m is only ever null before a tour
    // is finalized. A tour ended seconds after it started legitimately
    // saves total_distance_m: 0 -- `!tour.total_distance_m` used to treat
    // that the same as "still in progress," which is wrong once the tour
    // actually has a real (if tiny) duration on file.
    mockGetTours.mockResolvedValue([
      {
        tour_id: "t1",
        title: "Lol",
        mood: "time_machine",
        city: null,
        blocks_visited: 0,
        total_distance_m: 0,
        duration_sec: 2,
        created_at: "2026-01-01T00:00:00Z",
      },
    ]);

    const { findByText, queryByText } = await render(<HomeScreen {...baseProps()} />);

    expect(await findByText("0.0 km")).toBeTruthy();
    expect(queryByText("tours.inProgress")).toBeNull();
  });

  it("shows stats once they load", async () => {
    mockGetUserStats.mockResolvedValue({
      ...NO_STATS,
      tours_completed: 4,
      total_distance_m: 12500,
      cities_visited: 2,
    });

    const { findByText } = await render(<HomeScreen {...baseProps()} />);

    expect(await findByText("4")).toBeTruthy();
    expect(await findByText("12.5")).toBeTruthy();
    expect(await findByText("2")).toBeTruthy();
  });

  it("calls onOpenBadges when the badges section is pressed", async () => {
    mockGetUserStats.mockResolvedValue({
      ...NO_STATS,
      tours_completed: 1,
    });
    const props = baseProps();

    const { findByLabelText } = await render(<HomeScreen {...props} />);
    fireEvent.press(await findByLabelText("profile.viewAllBadgesA11y"));

    expect(props.onOpenBadges).toHaveBeenCalled();
  });
});
