import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

jest.mock("../../services/haptics", () => ({ tap: jest.fn() }));
jest.mock("../../services/toast", () => ({ showToast: jest.fn() }));
jest.mock("../../services/location", () => ({ getCurrentLocation: jest.fn() }));
jest.mock("../../services/api", () => ({
  getRichness: jest.fn(),
  getMoodSample: jest.fn(),
}));
jest.mock("expo-av", () => ({
  Audio: {
    Sound: {
      createAsync: jest.fn(),
    },
  },
}));

import MoodPickerScreen from "../MoodPickerScreen";
import { getCurrentLocation } from "../../services/location";
import { getRichness, getMoodSample } from "../../services/api";
import { showToast } from "../../services/toast";
import { Audio } from "expo-av";

const mockGetCurrentLocation = getCurrentLocation as jest.Mock;
const mockGetRichness = getRichness as jest.Mock;
const mockGetMoodSample = getMoodSample as jest.Mock;
const mockShowToast = showToast as jest.Mock;
const mockCreateAsync = Audio.Sound.createAsync as jest.Mock;

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

  it("plays a mood preview on success", async () => {
    mockGetMoodSample.mockResolvedValue({ audio_url: "https://example.com/sample.mp3" });
    const mockSound = { setOnPlaybackStatusUpdate: jest.fn(), unloadAsync: jest.fn() };
    mockCreateAsync.mockResolvedValue({ sound: mockSound });

    const props = baseProps();
    const { getByLabelText } = await render(<MoodPickerScreen {...props} />);

    await fireEvent.press(getByLabelText("moodPicker.previewA11y {\"mood\":\"moods.time_machine.label\"}"));

    await waitFor(() => expect(mockCreateAsync).toHaveBeenCalledWith(
      { uri: "https://example.com/sample.mp3" },
      { shouldPlay: true }
    ));
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it("shows a toast and never throws when the preview fails", async () => {
    mockGetMoodSample.mockRejectedValue(new Error("network error"));

    const props = baseProps();
    const { getByLabelText } = await render(<MoodPickerScreen {...props} />);

    await fireEvent.press(getByLabelText("moodPicker.previewA11y {\"mood\":\"moods.time_machine.label\"}"));

    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith("moodPicker.couldntPreview"));
  });
});
