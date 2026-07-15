import React from "react";
import { Alert } from "react-native";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

jest.mock("../../services/location", () => ({
  requestLocationPermission: jest.fn(),
  getCurrentLocation: jest.fn(),
  reverseGeocode: jest.fn(),
}));
jest.mock("../../services/api", () => ({
  getNearbyRoutes: jest.fn(),
  getTourDetail: jest.fn(),
}));
jest.mock("../../services/toast", () => ({ showToast: jest.fn() }));
jest.mock("../../services/haptics", () => ({ tap: jest.fn() }));

import HomeScreen from "../HomeScreen";
import { requestLocationPermission, getCurrentLocation, reverseGeocode } from "../../services/location";
import { getNearbyRoutes } from "../../services/api";

const mockRequestPermission = requestLocationPermission as jest.Mock;
const mockGetCurrentLocation = getCurrentLocation as jest.Mock;
const mockReverseGeocode = reverseGeocode as jest.Mock;
const mockGetNearbyRoutes = getNearbyRoutes as jest.Mock;

function baseProps(overrides = {}) {
  return {
    onStartTour: jest.fn(),
    onQuickStart: jest.fn(),
    onSelectRoute: jest.fn(),
    isPremium: false,
    onRequirePremium: jest.fn(),
    ...overrides,
  };
}

describe("HomeScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  it("shows a location-required alert and a placeholder (no map) when permission is denied", async () => {
    mockRequestPermission.mockResolvedValue(false);

    const { findByText } = await render(<HomeScreen {...baseProps()} />);

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("home.locationRequiredTitle", "home.locationRequiredBody"));
    expect(await findByText("home.locationPermissionRequired")).toBeTruthy();
    expect(mockGetCurrentLocation).not.toHaveBeenCalled();
  });

  it("loads location, place label, and nearby routes once permission is granted", async () => {
    mockRequestPermission.mockResolvedValue(true);
    mockGetCurrentLocation.mockResolvedValue({ lat: 37.7749, lng: -122.4194 });
    mockReverseGeocode.mockResolvedValue({ neighborhood: "Mission", city: "San Francisco" });
    mockGetNearbyRoutes.mockResolvedValue([]);

    const { findByText } = await render(<HomeScreen {...baseProps()} />);

    expect(await findByText("Mission, San Francisco")).toBeTruthy();
    expect(mockGetNearbyRoutes).toHaveBeenCalledWith(37.7749, -122.4194, { sortBy: "rating", limit: 10 });
  });

  it("disables the start button until location resolves, then enables it", async () => {
    mockRequestPermission.mockResolvedValue(true);
    mockGetCurrentLocation.mockResolvedValue({ lat: 37.7749, lng: -122.4194 });
    mockReverseGeocode.mockResolvedValue(null);
    mockGetNearbyRoutes.mockResolvedValue([]);

    const { findByLabelText } = await render(<HomeScreen {...baseProps()} />);

    const startBtn = await findByLabelText("home.startWalkingTour");
    await waitFor(() => expect(startBtn.props.accessibilityState?.disabled).toBe(false));
  });

  it("calls onStartTour when the start button is pressed", async () => {
    mockRequestPermission.mockResolvedValue(true);
    mockGetCurrentLocation.mockResolvedValue({ lat: 37.7749, lng: -122.4194 });
    mockReverseGeocode.mockResolvedValue(null);
    mockGetNearbyRoutes.mockResolvedValue([]);
    const props = baseProps();

    const { findByLabelText } = await render(<HomeScreen {...props} />);
    const startBtn = await findByLabelText("home.startWalkingTour");
    await waitFor(() => expect(startBtn.props.accessibilityState?.disabled).toBe(false));

    await fireEvent.press(startBtn);

    expect(props.onStartTour).toHaveBeenCalled();
  });

  it("quick-starts a free mood directly", async () => {
    mockRequestPermission.mockResolvedValue(true);
    mockGetCurrentLocation.mockResolvedValue({ lat: 37.7749, lng: -122.4194 });
    mockReverseGeocode.mockResolvedValue(null);
    mockGetNearbyRoutes.mockResolvedValue([]);
    const props = baseProps();

    const { findByText } = await render(<HomeScreen {...props} />);
    await fireEvent.press(await findByText("moods.time_machine.label"));

    expect(props.onQuickStart).toHaveBeenCalledWith("time_machine");
    expect(props.onRequirePremium).not.toHaveBeenCalled();
  });

  it("routes a premium mood to the paywall for a free user", async () => {
    mockRequestPermission.mockResolvedValue(true);
    mockGetCurrentLocation.mockResolvedValue({ lat: 37.7749, lng: -122.4194 });
    mockReverseGeocode.mockResolvedValue(null);
    mockGetNearbyRoutes.mockResolvedValue([]);
    const props = baseProps({ isPremium: false });

    const { findByText } = await render(<HomeScreen {...props} />);
    await fireEvent.press(await findByText("moods.dark_side.label"));

    expect(props.onRequirePremium).toHaveBeenCalled();
    expect(props.onQuickStart).not.toHaveBeenCalled();
  });
});
