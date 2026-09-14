import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

jest.mock("../../services/haptics", () => ({ tap: jest.fn() }));
jest.mock("../../services/location", () => ({ getCurrentLocation: jest.fn() }));
jest.mock("../../services/api", () => ({
  getRichness: jest.fn(),
}));

import MoodPickerScreen from "../MoodPickerScreen";
import { getCurrentLocation } from "../../services/location";

const mockGetCurrentLocation = getCurrentLocation as jest.Mock;

function baseProps(overrides = {}) {
  return {
    onSelect: jest.fn(),
    onCancel: jest.fn(),
    isPremium: false,
    onRequirePremium: jest.fn(),
    ...overrides,
  };
}

describe("MoodPickerScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Every test's default: richness lookup never resolves usefully,
    // which is fine — it's a nice-to-have caption, not core behavior.
    mockGetCurrentLocation.mockRejectedValue(new Error("no location"));
  });

  it("selects a free mode directly, without going through the paywall", async () => {
    const props = baseProps();
    const { getByText } = await render(<MoodPickerScreen {...props} />);

    await fireEvent.press(getByText("moods.time_machine.label"));

    expect(props.onSelect).toHaveBeenCalledWith("time_machine");
    expect(props.onRequirePremium).not.toHaveBeenCalled();
  });

  it("routes a premium mode to the paywall when the user isn't premium", async () => {
    const props = baseProps({ isPremium: false });
    const { getByText } = await render(<MoodPickerScreen {...props} />);

    await fireEvent.press(getByText("moods.dark_side.label"));

    expect(props.onRequirePremium).toHaveBeenCalled();
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it("selects a premium mode directly when the user is premium", async () => {
    const props = baseProps({ isPremium: true });
    const { getByText } = await render(<MoodPickerScreen {...props} />);

    await fireEvent.press(getByText("moods.dark_side.label"));

    expect(props.onSelect).toHaveBeenCalledWith("dark_side");
    expect(props.onRequirePremium).not.toHaveBeenCalled();
  });

  it("calls onCancel when the cancel button is pressed", async () => {
    const props = baseProps();
    const { getByText } = await render(<MoodPickerScreen {...props} />);

    await fireEvent.press(getByText("common.cancel"));

    expect(props.onCancel).toHaveBeenCalled();
  });
});
