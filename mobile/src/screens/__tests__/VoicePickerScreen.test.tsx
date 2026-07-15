import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

jest.mock("../../services/api", () => ({
  getSettings: jest.fn(),
  updateSettings: jest.fn(),
  getVoiceSample: jest.fn(),
}));
jest.mock("../../services/toast", () => ({ showToast: jest.fn() }));
jest.mock("../../services/haptics", () => ({ tap: jest.fn() }));
jest.mock("expo-av", () => ({
  Audio: { Sound: { createAsync: jest.fn() } },
}));

import VoicePickerScreen from "../VoicePickerScreen";
import { getSettings, updateSettings, getVoiceSample } from "../../services/api";
import { showToast } from "../../services/toast";
import { Audio } from "expo-av";

const mockGetSettings = getSettings as jest.Mock;
const mockUpdateSettings = updateSettings as jest.Mock;
const mockGetVoiceSample = getVoiceSample as jest.Mock;
const mockShowToast = showToast as jest.Mock;
const mockCreateAsync = Audio.Sound.createAsync as jest.Mock;

function baseProps(overrides = {}) {
  return {
    isPremium: false,
    onOpenPaywall: jest.fn(),
    onBack: jest.fn(),
    ...overrides,
  };
}

describe("VoicePickerScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSettings.mockResolvedValue({ preferred_voice: "neutral" });
  });

  it("selects a free voice directly and saves it", async () => {
    mockUpdateSettings.mockResolvedValue({});
    const { getByText, findByText } = await render(<VoicePickerScreen {...baseProps()} />);
    await findByText("voices.neutral.label");

    await fireEvent.press(getByText("voices.neutral.label"));

    await waitFor(() => expect(mockUpdateSettings).toHaveBeenCalledWith({ preferred_voice: "neutral" }));
  });

  it("opens the paywall instead of selecting a locked premium voice", async () => {
    const props = baseProps({ isPremium: false });
    const { getByText, findByText } = await render(<VoicePickerScreen {...props} />);
    await findByText("voices.dramatic.label");

    await fireEvent.press(getByText("voices.dramatic.label"));

    expect(props.onOpenPaywall).toHaveBeenCalled();
    expect(mockUpdateSettings).not.toHaveBeenCalled();
  });

  it("selects a premium voice directly once the user is premium", async () => {
    mockUpdateSettings.mockResolvedValue({});
    const props = baseProps({ isPremium: true });
    const { getByText, findByText } = await render(<VoicePickerScreen {...props} />);
    await findByText("voices.dramatic.label");

    await fireEvent.press(getByText("voices.dramatic.label"));

    await waitFor(() => expect(mockUpdateSettings).toHaveBeenCalledWith({ preferred_voice: "dramatic" }));
    expect(props.onOpenPaywall).not.toHaveBeenCalled();
  });

  it("shows a preview-only toast for the Signature voice, never selects or opens the paywall", async () => {
    const props = baseProps({ isPremium: false });
    const { getByText, findByText } = await render(<VoicePickerScreen {...props} />);
    await findByText("voices.signature.label");

    await fireEvent.press(getByText("voices.signature.label"));

    expect(mockShowToast).toHaveBeenCalledWith("voicePicker.previewOnlyToast");
    expect(props.onOpenPaywall).not.toHaveBeenCalled();
    expect(mockUpdateSettings).not.toHaveBeenCalled();
  });

  it("plays a preview on success", async () => {
    mockGetVoiceSample.mockResolvedValue({ audio_url: "https://example.com/warm.mp3" });
    const mockSound = { setOnPlaybackStatusUpdate: jest.fn(), unloadAsync: jest.fn() };
    mockCreateAsync.mockResolvedValue({ sound: mockSound });

    const { getByLabelText, findByText } = await render(<VoicePickerScreen {...baseProps()} />);
    await findByText("voices.neutral.label");

    await fireEvent.press(getByLabelText('voicePicker.previewA11y {"voice":"voices.neutral.label"}'));

    await waitFor(() => expect(mockCreateAsync).toHaveBeenCalledWith(
      { uri: "https://example.com/warm.mp3" },
      { shouldPlay: true }
    ));
  });

  it("shows a toast when loading the current setting fails, without crashing", async () => {
    mockGetSettings.mockRejectedValue(new Error("network error"));

    await render(<VoicePickerScreen {...baseProps()} />);

    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith("voicePicker.couldntLoad"));
  });

  it("calls onBack when the back button is pressed", async () => {
    const props = baseProps();
    const { getByText, findByText } = await render(<VoicePickerScreen {...props} />);
    await findByText("voices.neutral.label");

    await fireEvent.press(getByText("‹ common.back"));

    expect(props.onBack).toHaveBeenCalled();
  });
});
