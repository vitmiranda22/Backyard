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

beforeEach(() => {
  jest.clearAllMocks();
  mockRequestLocationPermission.mockResolvedValue(true);
  mockGetCurrentLocation.mockResolvedValue({ lat: 37.7749, lng: -122.4194 });
  mockGetNearbyRoutes.mockResolvedValue([]);
  mockGetNearbyEvents.mockResolvedValue([]);
});

describe("MapScreen", () => {
  it("fetches nearby events alongside nearby routes once location is available", async () => {
    render(<MapScreen onSelectRoute={jest.fn()} onBack={jest.fn()} />);

    await waitFor(() => {
      expect(mockGetNearbyEvents).toHaveBeenCalledWith(37.7749, -122.4194);
    });
  });

  it("does not blow up when getNearbyEvents fails -- events are a quiet bonus layer", async () => {
    mockGetNearbyEvents.mockRejectedValue(new Error("network down"));

    const { queryByText } = await render(<MapScreen onSelectRoute={jest.fn()} onBack={jest.fn()} />);

    await waitFor(() => expect(mockGetNearbyEvents).toHaveBeenCalled());
    // No toast, no crash -- just quietly renders with zero event pins.
    expect(queryByText(/event-sheet-open/)).toBeNull();
  });

  it("opens the event detail sheet when an event pin is pressed", async () => {
    mockGetNearbyEvents.mockResolvedValue([EVENT]);

    const { findByTestId, findByText } = await render(<MapScreen onSelectRoute={jest.fn()} onBack={jest.fn()} />);

    await waitFor(() => expect(mockGetNearbyEvents).toHaveBeenCalled());

    const pin = await findByTestId("event-marker-event-1");
    fireEvent(pin, "press");

    expect(await findByText("event-sheet-open: Sunset Street Festival")).toBeTruthy();
  });
});
