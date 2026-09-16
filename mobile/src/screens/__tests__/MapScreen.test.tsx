import React from "react";
import { AppState } from "react-native";
import { render, waitFor, fireEvent } from "@testing-library/react-native";

jest.mock("../../services/location", () => ({
  requestLocationPermission: jest.fn(),
  getCurrentLocation: jest.fn(),
  watchPosition: jest.fn(),
}));
jest.mock("../../services/api", () => ({
  getNearbyRoutes: jest.fn(),
  getTourDetail: jest.fn(),
  getExploredCells: jest.fn(),
  reportExploredCell: jest.fn(),
}));
jest.mock("../../services/toast", () => ({ showToast: jest.fn() }));

import MapScreen from "../MapScreen";
import { requestLocationPermission, getCurrentLocation, watchPosition } from "../../services/location";
import { getNearbyRoutes, getExploredCells } from "../../services/api";

const mockRequestLocationPermission = requestLocationPermission as jest.Mock;
const mockGetCurrentLocation = getCurrentLocation as jest.Mock;
const mockGetNearbyRoutes = getNearbyRoutes as jest.Mock;
const mockWatchPosition = watchPosition as jest.Mock;
const mockGetExploredCells = getExploredCells as jest.Mock;

const MUSEUM_TOUR = {
  tour_id: "museum-tour-1",
  title: "The Metropolitan Museum of Art",
  mood: "time_machine",
  tour_type: "museum",
  city: "New York",
  avg_rating: 0,
  rating_count: 0,
  blocks_visited: 10,
  total_distance_m: null,
  duration_sec: null,
  is_anonymous: false,
  content_safety_on: false,
  creator_display_name: null,
  creator_avatar_url: null,
  distance_m: 5,
  created_at: new Date().toISOString(),
  lat: 40.7794,
  lng: -73.9632,
  is_low_info: false,
};

function defaultProps(overrides: Partial<React.ComponentProps<typeof MapScreen>> = {}) {
  return { onSelectRoute: jest.fn(), onSelectMuseumTour: jest.fn(), onBack: jest.fn(), ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequestLocationPermission.mockResolvedValue(true);
  mockGetCurrentLocation.mockResolvedValue({ lat: 37.7749, lng: -122.4194 });
  mockGetNearbyRoutes.mockResolvedValue([]);
  mockGetExploredCells.mockResolvedValue({ geo_hashes: [] });
  mockWatchPosition.mockResolvedValue({ remove: jest.fn() });
  // The RN jest mock ships AppState.currentState as an unconfigured
  // jest.fn(), not the real string property -- force it foreground for
  // these tests, matching what a real running app would have.
  (AppState as any).currentState = "active";
});

describe("MapScreen", () => {
  it("fetches nearby museum tours via a dedicated tourType-filtered call", async () => {
    render(<MapScreen {...defaultProps()} />);

    await waitFor(() => {
      expect(mockGetNearbyRoutes).toHaveBeenCalledWith(
        37.7749,
        -122.4194,
        expect.objectContaining({ tourType: "museum" })
      );
    });
  });

  it("renders a museum pin and routes its callout tap through onSelectMuseumTour", async () => {
    mockGetNearbyRoutes.mockImplementation((lat: number, lng: number, opts?: any) =>
      Promise.resolve(opts?.tourType === "museum" ? [MUSEUM_TOUR] : [])
    );
    const onSelectMuseumTour = jest.fn();

    const { findByTestId } = await render(<MapScreen {...defaultProps({ onSelectMuseumTour })} />);

    const pin = await findByTestId("museum-marker-museum-tour-1");
    fireEvent(pin, "calloutPress");

    expect(onSelectMuseumTour).toHaveBeenCalledWith("museum-tour-1");
  });

  it("still shows 10 walking-tour pins even when museum tours occupy slots in the unfiltered top results", async () => {
    // A rating-sorted top-N call can return museum tours mixed in with
    // walking tours -- fetching more than 10 and filtering + slicing
    // client-side keeps the walking-tour pin count at a real 10 instead
    // of silently shrinking whenever a museum tour outranks a walking one.
    const walkingTours = Array.from({ length: 12 }, (_, i) => ({
      ...MUSEUM_TOUR,
      tour_id: `walk-${i}`,
      tour_type: "walking",
      title: `Walking Tour ${i}`,
    }));
    const museumTours = Array.from({ length: 3 }, (_, i) => ({
      ...MUSEUM_TOUR,
      tour_id: `museum-${i}`,
    }));

    mockGetNearbyRoutes.mockImplementation((lat: number, lng: number, opts?: any) => {
      if (opts?.tourType === "museum") return Promise.resolve(museumTours);
      // Simulates the real top-20-by-rating call: museum tours interleaved
      // among the walking tours, exactly the scenario that used to dilute
      // the walking-pin count.
      return Promise.resolve([...museumTours, ...walkingTours].slice(0, 20));
    });

    const { findAllByTestId, queryAllByTestId } = await render(<MapScreen {...defaultProps()} />);

    const walkingPins = await findAllByTestId(/^route-marker-walk-/);
    expect(walkingPins).toHaveLength(10);
    expect(queryAllByTestId(/^route-marker-museum-/)).toHaveLength(0);
  });

  describe("Terra Incognita fog-of-war tracking", () => {
    it("hydrates the caller's explored history and starts foreground tracking once mounted", async () => {
      mockGetExploredCells.mockResolvedValue({ geo_hashes: ["9q8yyk8"] });

      render(<MapScreen {...defaultProps()} />);

      await waitFor(() => {
        expect(mockGetExploredCells).toHaveBeenCalled();
        expect(mockWatchPosition).toHaveBeenCalled();
      });
    });

    it("stops tracking when the app backgrounds, and resumes when it returns to active", async () => {
      const removeSpy = jest.fn();
      mockWatchPosition.mockResolvedValue({ remove: removeSpy });
      const addEventListenerSpy = jest.spyOn(AppState, "addEventListener");

      render(<MapScreen {...defaultProps()} />);

      await waitFor(() => expect(mockWatchPosition).toHaveBeenCalledTimes(1));

      const onChange = addEventListenerSpy.mock.calls.find(([event]) => event === "change")?.[1];
      expect(onChange).toBeDefined();

      onChange!("background");
      await waitFor(() => expect(removeSpy).toHaveBeenCalledTimes(1));

      onChange!("active");
      await waitFor(() => expect(mockWatchPosition).toHaveBeenCalledTimes(2));
    });

    it("removes the subscription instead of leaking it if the screen unmounts before watchPosition resolves", async () => {
      // Regression test: watchPosition's underlying GPS/provider startup
      // isn't instant -- if the screen unmounts while that await is still
      // pending, the effect's cleanup used to run before watchSubRef.current
      // was ever set, so stopFogTracking found nothing to remove, and the
      // subscription that landed afterward was stored with nothing left to
      // ever clean it up again (a leaked live GPS listener).
      const removeSpy = jest.fn();
      let resolveWatch: (sub: { remove: () => void }) => void;
      mockWatchPosition.mockReturnValue(
        new Promise((resolve) => {
          resolveWatch = resolve;
        })
      );

      const { unmount } = await render(<MapScreen {...defaultProps()} />);
      await waitFor(() => expect(mockWatchPosition).toHaveBeenCalledTimes(1));

      unmount();
      resolveWatch!({ remove: removeSpy });
      await waitFor(() => expect(removeSpy).toHaveBeenCalledTimes(1));
    });
  });
});
