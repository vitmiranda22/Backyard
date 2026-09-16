import React from "react";
import { render, waitFor, fireEvent } from "@testing-library/react-native";

jest.mock("../../services/location", () => ({
  requestLocationPermission: jest.fn(),
  getCurrentLocation: jest.fn(),
}));
jest.mock("../../services/api", () => ({
  getNearbyRoutes: jest.fn(),
  getTourDetail: jest.fn(),
  getNearbyEvents: jest.fn(),
}));
jest.mock("../../services/toast", () => ({ showToast: jest.fn() }));

jest.mock("../../components/EventDetailSheet", () => {
  const { View, Text } = require("react-native");
  return function MockEventDetailSheet(props: any) {
    if (!props.visible || !props.event) return null;
    return (
      <View>
        <Text>event-sheet-open: {props.event.name}</Text>
      </View>
    );
  };
});

import MapScreen from "../MapScreen";
import { requestLocationPermission, getCurrentLocation } from "../../services/location";
import { getNearbyRoutes, getNearbyEvents } from "../../services/api";

const mockRequestLocationPermission = requestLocationPermission as jest.Mock;
const mockGetCurrentLocation = getCurrentLocation as jest.Mock;
const mockGetNearbyRoutes = getNearbyRoutes as jest.Mock;
const mockGetNearbyEvents = getNearbyEvents as jest.Mock;

const EVENT = {
  id: "event-1",
  name: "Sunset Street Festival",
  description: "Live music and food stalls.",
  category: "festival",
  city: "San Francisco",
  center_lat: 37.7749,
  center_lng: -122.4194,
  radius_m: 300,
  start_time: new Date().toISOString(),
  end_time: new Date(Date.now() + 3600_000).toISOString(),
  source_url: null,
  distance_m: 50,
  phase: "happening",
};

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
  mockGetNearbyEvents.mockResolvedValue([]);
});

describe("MapScreen", () => {
  it("fetches nearby events alongside nearby routes once location is available", async () => {
    render(<MapScreen {...defaultProps()} />);

    await waitFor(() => {
      expect(mockGetNearbyEvents).toHaveBeenCalledWith(37.7749, -122.4194);
    });
  });

  it("does not blow up when getNearbyEvents fails -- events are a quiet bonus layer", async () => {
    mockGetNearbyEvents.mockRejectedValue(new Error("network down"));

    const { queryByText } = await render(<MapScreen {...defaultProps()} />);

    await waitFor(() => expect(mockGetNearbyEvents).toHaveBeenCalled());
    // No toast, no crash -- just quietly renders with zero event pins.
    expect(queryByText(/event-sheet-open/)).toBeNull();
  });

  it("opens the event detail sheet when an event pin is pressed", async () => {
    mockGetNearbyEvents.mockResolvedValue([EVENT]);

    const { findByTestId, findByText } = await render(<MapScreen {...defaultProps()} />);

    await waitFor(() => expect(mockGetNearbyEvents).toHaveBeenCalled());

    const pin = await findByTestId("event-marker-event-1");
    fireEvent(pin, "press");

    expect(await findByText("event-sheet-open: Sunset Street Festival")).toBeTruthy();
  });

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
});
