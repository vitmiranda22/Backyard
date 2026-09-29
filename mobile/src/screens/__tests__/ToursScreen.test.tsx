import React from "react";
import { Alert } from "react-native";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

jest.mock("../../services/api", () => ({
  getTours: jest.fn(),
  getNearbyRoutes: jest.fn(),
  getExploredCities: jest.fn(),
  getExploredCountries: jest.fn(),
}));
jest.mock("../../services/location", () => ({
  requestLocationPermission: jest.fn(),
  getCurrentLocation: jest.fn(),
}));
jest.mock("../../services/toast", () => ({ showToast: jest.fn() }));
jest.mock("../../services/haptics", () => ({ tap: jest.fn() }));

import ToursScreen from "../ToursScreen";
import { getTours, getNearbyRoutes, getExploredCities, getExploredCountries } from "../../services/api";
import { requestLocationPermission, getCurrentLocation } from "../../services/location";
import { showToast } from "../../services/toast";

const mockGetTours = getTours as jest.Mock;
const mockGetNearbyRoutes = getNearbyRoutes as jest.Mock;
const mockGetExploredCities = getExploredCities as jest.Mock;
const mockGetExploredCountries = getExploredCountries as jest.Mock;
const mockRequestPermission = requestLocationPermission as jest.Mock;
const mockGetCurrentLocation = getCurrentLocation as jest.Mock;
const mockShowToast = showToast as jest.Mock;

function myTour(overrides = {}) {
  return {
    tour_id: "t1",
    title: "Sunset Walk",
    mood: "time_machine",
    city: "San Francisco",
    blocks_visited: 5,
    total_distance_m: 2000,
    duration_sec: 1800,
    created_at: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

function nearbyRoute(overrides = {}) {
  return {
    tour_id: "r1",
    title: "Mission Murals",
    mood: "hidden_city",
    tour_type: "walking",
    city: "San Francisco",
    avg_rating: 4,
    rating_count: 3,
    blocks_visited: 6,
    total_distance_m: 1500,
    duration_sec: 1200,
    is_anonymous: false,
    content_safety_on: false,
    creator_display_name: "Sam",
    creator_avatar_url: null,
    distance_m: 450,
    created_at: "2026-07-01T00:00:00Z",
    lat: 37.75,
    lng: -122.41,
    is_low_info: false,
    ...overrides,
  };
}

describe("ToursScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockGetExploredCities.mockResolvedValue({ cities: [] });
    mockGetExploredCountries.mockResolvedValue({ countries: [] });
  });

  it("loads and shows the user's own tours on mount", async () => {
    mockGetTours.mockResolvedValue([myTour()]);

    const { findByText } = await render(<ToursScreen onSelectRoute={jest.fn()} onBack={jest.fn()} />);

    expect(await findByText("Sunset Walk")).toBeTruthy();
  });

  it("shows an empty state when there are no tours yet", async () => {
    mockGetTours.mockResolvedValue([]);

    const { findByText } = await render(<ToursScreen onSelectRoute={jest.fn()} onBack={jest.fn()} />);

    expect(await findByText("tours.noToursYet")).toBeTruthy();
  });

  it("shows a toast and a retry affordance (not a crash) when loading tours fails", async () => {
    mockGetTours.mockRejectedValue(new Error("network error"));

    const { findByText } = await render(<ToursScreen onSelectRoute={jest.fn()} onBack={jest.fn()} />);

    await findByText("tours.couldntLoadTours");
    expect(mockShowToast).toHaveBeenCalledWith("tours.couldntLoadTours");
  });

  it("retries loading tours when Try Again is pressed after a failure", async () => {
    mockGetTours.mockRejectedValueOnce(new Error("network error"));
    mockGetTours.mockResolvedValueOnce([myTour()]);

    const { findByText } = await render(<ToursScreen onSelectRoute={jest.fn()} onBack={jest.fn()} />);

    await fireEvent.press(await findByText("common.retry"));

    expect(await findByText(myTour().title)).toBeTruthy();
    expect(mockGetTours).toHaveBeenCalledTimes(2);
  });

  it("calls onSelectRoute with the tour_id when a tour card is pressed", async () => {
    mockGetTours.mockResolvedValue([myTour()]);
    const onSelectRoute = jest.fn();
    const { findByText } = await render(<ToursScreen onSelectRoute={onSelectRoute} onBack={jest.fn()} />);

    await fireEvent.press(await findByText("Sunset Walk"));

    expect(onSelectRoute).toHaveBeenCalledWith("t1");
  });

  it("switches to Discover and loads nearby routes once location is granted", async () => {
    mockGetTours.mockResolvedValue([]);
    mockRequestPermission.mockResolvedValue(true);
    mockGetCurrentLocation.mockResolvedValue({ lat: 37.7749, lng: -122.4194 });
    mockGetNearbyRoutes.mockResolvedValue([nearbyRoute()]);

    const { getByText, findByText } = await render(<ToursScreen onSelectRoute={jest.fn()} onBack={jest.fn()} />);
    await findByText("tours.noToursYet");

    await fireEvent.press(getByText("tours.discover"));

    expect(await findByText("Mission Murals")).toBeTruthy();
    expect(mockGetNearbyRoutes).toHaveBeenCalledWith(37.7749, -122.4194);
  });

  it("shows a location-required alert and an empty Discover list when permission is denied", async () => {
    mockGetTours.mockResolvedValue([]);
    mockRequestPermission.mockResolvedValue(false);

    const { getByText, findByText } = await render(<ToursScreen onSelectRoute={jest.fn()} onBack={jest.fn()} />);
    await findByText("tours.noToursYet");

    await fireEvent.press(getByText("tours.discover"));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("tours.locationRequiredTitle", "tours.locationRequiredBody"));
    expect(await findByText("tours.noRoutesNearby")).toBeTruthy();
    expect(mockGetNearbyRoutes).not.toHaveBeenCalled();
  });

  it("switches to Places and loads cities and countries only once selected", async () => {
    mockGetTours.mockResolvedValue([]);
    mockGetExploredCities.mockResolvedValue({ cities: [{ city: "San Francisco", count: 25, percentage: 20 }] });
    mockGetExploredCountries.mockResolvedValue({ countries: [{ country: "United States", count: 25 }] });

    const { getByText, findByText } = await render(<ToursScreen onSelectRoute={jest.fn()} onBack={jest.fn()} />);
    await findByText("tours.noToursYet");
    expect(mockGetExploredCities).not.toHaveBeenCalled();

    await fireEvent.press(getByText("tours.places"));

    expect(await findByText("San Francisco")).toBeTruthy();
    expect(await findByText("United States")).toBeTruthy();
    expect(mockGetExploredCities).toHaveBeenCalledTimes(1);
    expect(mockGetExploredCountries).toHaveBeenCalledTimes(1);
  });

  it("shows an empty state on Places when there are no explored cities or countries yet", async () => {
    mockGetTours.mockResolvedValue([]);

    const { getByText, findByText } = await render(<ToursScreen onSelectRoute={jest.fn()} onBack={jest.fn()} />);
    await findByText("tours.noToursYet");

    await fireEvent.press(getByText("tours.places"));

    expect(await findByText("cities.empty")).toBeTruthy();
  });

  it("shows a failed state and does not crash when loading Places fails", async () => {
    mockGetTours.mockResolvedValue([]);
    mockGetExploredCities.mockRejectedValue(new Error("network error"));

    const { getByText, findByText } = await render(<ToursScreen onSelectRoute={jest.fn()} onBack={jest.fn()} />);
    await findByText("tours.noToursYet");

    await fireEvent.press(getByText("tours.places"));

    expect(await findByText("cities.failedToLoad")).toBeTruthy();
    expect(mockShowToast).toHaveBeenCalledWith("cities.failedToLoad");
  });

  it("shows only the Countries section when a user has explored countries but no boundary-mapped cities data", async () => {
    mockGetTours.mockResolvedValue([]);
    mockGetExploredCities.mockResolvedValue({ cities: [] });
    mockGetExploredCountries.mockResolvedValue({ countries: [{ country: "Japan", count: 3 }] });

    const { getByText, findByText, queryByText } = await render(<ToursScreen onSelectRoute={jest.fn()} onBack={jest.fn()} />);
    await findByText("tours.noToursYet");

    await fireEvent.press(getByText("tours.places"));

    expect(await findByText("Japan")).toBeTruthy();
    expect(queryByText("cities.empty")).toBeNull();
  });
});
