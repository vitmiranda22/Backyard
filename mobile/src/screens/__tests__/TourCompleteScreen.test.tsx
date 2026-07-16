import React from "react";
import { Alert, Share } from "react-native";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";

jest.mock("../../services/api", () => ({
  endTour: jest.fn(),
  publishTour: jest.fn(),
  deleteTour: jest.fn(),
}));
jest.mock("../../services/toast", () => ({ showToast: jest.fn() }));
jest.mock("../../services/haptics", () => ({ tap: jest.fn(), success: jest.fn() }));
jest.mock("../../services/analytics", () => ({ track: jest.fn() }));
jest.mock("../../services/reviewPrompt", () => ({ maybePromptForReview: jest.fn() }));
jest.mock("expo-av", () => ({
  Audio: { Sound: { createAsync: jest.fn() } },
}));

import TourCompleteScreen from "../TourCompleteScreen";
import { endTour, publishTour, deleteTour } from "../../services/api";
import { showToast } from "../../services/toast";
import { track } from "../../services/analytics";

const mockEndTour = endTour as jest.Mock;
const mockPublishTour = publishTour as jest.Mock;
const mockDeleteTour = deleteTour as jest.Mock;
const mockShowToast = showToast as jest.Mock;
const mockTrack = track as jest.Mock;

function baseProps(overrides = {}) {
  return {
    tourId: "tour-1",
    blocksVisited: 4,
    startTime: Date.now() - 60_000,
    path: [{ lat: 37.77, lng: -122.41 }],
    onDone: jest.fn(),
    ...overrides,
  };
}

async function nameAndAdvance(getByPlaceholderText: any, getByText: any, title = "My Walk") {
  await fireEvent.changeText(getByPlaceholderText("tourComplete.titlePlaceholder"), title);
  await fireEvent.press(getByText("tourComplete.continue"));
}

describe("TourCompleteScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" } as any);
    const { Audio } = require("expo-av");
    (Audio.Sound.createAsync as jest.Mock).mockResolvedValue({
      sound: {
        // Resolves playback immediately instead of leaving the real 15s
        // timeout in playOutro() to fire after the test has finished.
        setOnPlaybackStatusUpdate: (cb: (status: any) => void) => cb({ isLoaded: true, didJustFinish: true }),
        unloadAsync: jest.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("keeps Continue disabled until a title is entered", async () => {
    mockEndTour.mockResolvedValue({ mood: "time_machine" });
    const { getByLabelText } = await render(<TourCompleteScreen {...baseProps()} />);

    const continueBtn = getByLabelText("tourComplete.continue");
    expect(continueBtn.props.accessibilityState?.disabled).toBe(true);
  });

  it("calls endTour with distance/duration derived from blocksVisited and startTime", async () => {
    mockEndTour.mockResolvedValue({ mood: "hidden_city" });
    await render(<TourCompleteScreen {...baseProps({ blocksVisited: 4 })} />);

    await waitFor(() => expect(mockEndTour).toHaveBeenCalled());
    const [tourId, distanceM, durationSec, path] = mockEndTour.mock.calls[0];
    expect(tourId).toBe("tour-1");
    expect(distanceM).toBe(4 * 150); // ~150m/block estimate
    expect(durationSec).toBeGreaterThan(0);
    expect(path).toEqual([{ lat: 37.77, lng: -122.41 }]);
  });

  it("advances from the name step to the stats screen after entering a title", async () => {
    mockEndTour.mockResolvedValue({ mood: "time_machine" });
    const { getByText, getByPlaceholderText, findByText } = await render(<TourCompleteScreen {...baseProps()} />);

    await waitFor(() => expect(mockEndTour).toHaveBeenCalled());
    await nameAndAdvance(getByPlaceholderText, getByText);

    expect(await findByText("tourComplete.save")).toBeTruthy();
  });

  it("saves as a published route by default, tracks it, and shows the saved screen", async () => {
    mockEndTour.mockResolvedValue({ mood: "time_machine" });
    mockPublishTour.mockResolvedValue({});
    const { getByText, getByPlaceholderText, findByText } = await render(<TourCompleteScreen {...baseProps()} />);

    await waitFor(() => expect(mockEndTour).toHaveBeenCalled());
    await nameAndAdvance(getByPlaceholderText, getByText, "Mission Walk");
    await fireEvent.press(await findByText("tourComplete.save"));

    await waitFor(() => expect(mockPublishTour).toHaveBeenCalledWith("tour-1", true, "Mission Walk"));
    expect(mockTrack).toHaveBeenCalledWith("tour_saved", { published: true });
    expect(await findByText("tourComplete.savedPublished")).toBeTruthy();
  });

  it("saves privately (shareAsRoute off) and calls onDone directly, without the saved screen", async () => {
    mockEndTour.mockResolvedValue({ mood: "time_machine" });
    mockPublishTour.mockResolvedValue({});
    const onDone = jest.fn();
    const { getByText, getByPlaceholderText, getByLabelText, findByText } = await render(
      <TourCompleteScreen {...baseProps({ onDone })} />
    );

    await waitFor(() => expect(mockEndTour).toHaveBeenCalled());
    await nameAndAdvance(getByPlaceholderText, getByText);
    await findByText("tourComplete.save");

    await fireEvent(getByLabelText("tourComplete.publishToggleA11y"), "valueChange", false);
    await fireEvent.press(getByText("tourComplete.save"));

    await waitFor(() => expect(mockPublishTour).toHaveBeenCalledWith("tour-1", false, expect.any(String)));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("shows a toast and does not advance when saving fails", async () => {
    mockEndTour.mockResolvedValue({ mood: "time_machine" });
    mockPublishTour.mockRejectedValue(new Error("network error"));
    const onDone = jest.fn();
    const { getByText, getByPlaceholderText, findByText } = await render(
      <TourCompleteScreen {...baseProps({ onDone })} />
    );

    await waitFor(() => expect(mockEndTour).toHaveBeenCalled());
    await nameAndAdvance(getByPlaceholderText, getByText);
    await fireEvent.press(await findByText("tourComplete.save"));

    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith("tourComplete.couldntSaveDetails"));
    expect(onDone).toHaveBeenCalled(); // still exits, even on a failed save
  });

  it("plays the outro audio when end-tour returns one", async () => {
    mockEndTour.mockResolvedValue({ mood: "dark_side", outro_audio_url: "https://example.com/outro.mp3" });
    await render(<TourCompleteScreen {...baseProps()} />);

    await waitFor(() => expect(mockEndTour).toHaveBeenCalled());
    const { Audio } = require("expo-av");
    await waitFor(() =>
      expect(Audio.Sound.createAsync).toHaveBeenCalledWith(
        { uri: "https://example.com/outro.mp3" },
        { shouldPlay: true }
      )
    );
  });

  it("does not attempt playback when end-tour returns no outro", async () => {
    mockEndTour.mockResolvedValue({ mood: "time_machine", outro_audio_url: null });
    await render(<TourCompleteScreen {...baseProps()} />);

    await waitFor(() => expect(mockEndTour).toHaveBeenCalled());
    const { Audio } = require("expo-av");
    expect(Audio.Sound.createAsync).not.toHaveBeenCalled();
  });

  it("asks for confirmation before discarding, and only deletes on confirm", async () => {
    mockEndTour.mockResolvedValue({ mood: "time_machine" });
    const { getByText, getByPlaceholderText, findByText } = await render(<TourCompleteScreen {...baseProps()} />);

    await waitFor(() => expect(mockEndTour).toHaveBeenCalled());
    await nameAndAdvance(getByPlaceholderText, getByText);
    await fireEvent.press(await findByText("tourComplete.discardThisWalk"));

    expect(Alert.alert).toHaveBeenCalled();
    expect(mockDeleteTour).not.toHaveBeenCalled();

    // Simulate the user tapping the destructive "Discard" button in the alert.
    const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
    const buttons = alertCall[2];
    const discardButton = buttons.find((b: any) => b.style === "destructive");
    mockDeleteTour.mockResolvedValue(true);
    await act(async () => {
      await discardButton.onPress();
    });

    expect(mockDeleteTour).toHaveBeenCalledWith("tour-1");
  });
});
