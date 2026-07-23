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

describe("TourCompleteScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" } as any);
  });

  it("keeps Save disabled until a title is entered, on the one merged screen", async () => {
    mockEndTour.mockResolvedValue({ mood: "time_machine" });
    const { getByLabelText } = await render(<TourCompleteScreen {...baseProps()} />);

    const saveBtn = getByLabelText("tourComplete.saveTourA11y");
    expect(saveBtn.props.accessibilityState?.disabled).toBe(true);
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

  it("saves as a published route by default, tracks it, and shows the saved screen", async () => {
    mockEndTour.mockResolvedValue({ mood: "time_machine" });
    mockPublishTour.mockResolvedValue({});
    const { getByText, getByPlaceholderText, findByText } = await render(<TourCompleteScreen {...baseProps()} />);

    await waitFor(() => expect(mockEndTour).toHaveBeenCalled());
    await fireEvent.changeText(getByPlaceholderText("tourComplete.titlePlaceholder"), "Mission Walk");
    await fireEvent.press(getByText("tourComplete.save"));

    await waitFor(() => expect(mockPublishTour).toHaveBeenCalledWith("tour-1", true, "Mission Walk"));
    expect(mockTrack).toHaveBeenCalledWith("tour_saved", { published: true });
    expect(await findByText("tourComplete.savedPublished")).toBeTruthy();
  });

  it("saves privately (shareAsRoute off) and calls onDone directly, without the saved screen", async () => {
    mockEndTour.mockResolvedValue({ mood: "time_machine" });
    mockPublishTour.mockResolvedValue({});
    const onDone = jest.fn();
    const { getByText, getByPlaceholderText, getByLabelText } = await render(
      <TourCompleteScreen {...baseProps({ onDone })} />
    );

    await waitFor(() => expect(mockEndTour).toHaveBeenCalled());
    await fireEvent.changeText(getByPlaceholderText("tourComplete.titlePlaceholder"), "My Walk");
    await fireEvent(getByLabelText("tourComplete.publishToggleA11y"), "valueChange", false);
    await fireEvent.press(getByText("tourComplete.save"));

    await waitFor(() => expect(mockPublishTour).toHaveBeenCalledWith("tour-1", false, "My Walk"));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("shows a toast and does not advance when saving fails", async () => {
    mockEndTour.mockResolvedValue({ mood: "time_machine" });
    mockPublishTour.mockRejectedValue(new Error("network error"));
    const onDone = jest.fn();
    const { getByText, getByPlaceholderText } = await render(
      <TourCompleteScreen {...baseProps({ onDone })} />
    );

    await waitFor(() => expect(mockEndTour).toHaveBeenCalled());
    await fireEvent.changeText(getByPlaceholderText("tourComplete.titlePlaceholder"), "My Walk");
    await fireEvent.press(getByText("tourComplete.save"));

    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith("tourComplete.couldntSaveDetails"));
    expect(onDone).toHaveBeenCalled(); // still exits, even on a failed save
  });

  it("uses a prefetched result instead of calling endTour again (auto-completed tour)", async () => {
    // ActiveTourScreen already called /end-tour itself for an
    // auto-completed tour (and already played the outro there) -- this
    // screen must reuse that result, not fetch + generate the outro a
    // second time.
    const { getByLabelText } = await render(
      <TourCompleteScreen
        {...baseProps()}
        prefetchedResult={{
          tour_id: "tour-1",
          title: "Auto Title",
          blocks_visited: 4,
          total_distance_m: 600,
          duration_sec: 900,
          mood: "dark_side",
          outro_audio_url: "https://example.com/outro.mp3",
        }}
      />
    );

    await waitFor(() => expect(getByLabelText("tourComplete.saveTourA11y")).toBeTruthy());
    expect(mockEndTour).not.toHaveBeenCalled();
    expect(mockTrack).toHaveBeenCalledWith(
      "tour_completed",
      expect.objectContaining({ mood: "dark_side" })
    );
  });

  it("falls back to calling endTour itself when there's no prefetched result (manual end)", async () => {
    mockEndTour.mockResolvedValue({ mood: "time_machine" });
    await render(<TourCompleteScreen {...baseProps()} />);

    await waitFor(() => expect(mockEndTour).toHaveBeenCalledWith("tour-1", 4 * 150, expect.any(Number), [
      { lat: 37.77, lng: -122.41 },
    ]));
  });

  it("asks for confirmation before discarding via the Discard button, and only deletes on confirm", async () => {
    mockEndTour.mockResolvedValue({ mood: "time_machine" });
    const { findByText } = await render(<TourCompleteScreen {...baseProps()} />);

    await waitFor(() => expect(mockEndTour).toHaveBeenCalled());
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

  it("the X (close) button in the top corner triggers the same discard-confirm flow", async () => {
    mockEndTour.mockResolvedValue({ mood: "time_machine" });
    const { getByLabelText } = await render(<TourCompleteScreen {...baseProps()} />);

    await waitFor(() => expect(mockEndTour).toHaveBeenCalled());
    await fireEvent.press(getByLabelText("tourComplete.closeA11y"));

    expect(Alert.alert).toHaveBeenCalled();
    expect(mockDeleteTour).not.toHaveBeenCalled();
  });
});
