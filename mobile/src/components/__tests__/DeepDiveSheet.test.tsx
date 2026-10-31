import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

jest.mock("expo-av", () => ({
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: { createAsync: jest.fn() },
  },
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockOutline = jest.fn();
const mockChapter = jest.fn();
jest.mock("../../services/api", () => ({
  ApiError: class ApiError extends Error {},
  getDeepDiveOutline: (...args: any[]) => mockOutline(...args),
  getDeepDiveChapter: (...args: any[]) => mockChapter(...args),
}));

import DeepDiveSheet from "../DeepDiveSheet";

const OUTLINE = {
  place: "The Ferry Building",
  title: "The Building That Refused to Fall",
  chapters: ["The morning of 1906", "Before the bridges", "Behind a freeway", "Reborn as a market"],
};

function props(overrides = {}) {
  return {
    visible: true,
    origin: { lat: 37.7955, lng: -122.3937 },
    mood: "time_machine",
    voice: "neutral",
    contentSafety: false,
    onClose: jest.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  mockOutline.mockReset().mockResolvedValue(OUTLINE);
  mockChapter
    .mockReset()
    .mockImplementation((_lat, _lng, _m, _v, _c, _o, index) =>
      Promise.resolve({ text: `Chapter ${index + 1} story.`, audio_url: null, audio_duration_ms: 130000 })
    );
});

describe("DeepDiveSheet", () => {
  it("plans the story, plays chapter 1 and prefetches only chapter 2", async () => {
    const { findByText, getByText } = await render(<DeepDiveSheet {...props()} />);

    expect(await findByText("The Building That Refused to Fall")).toBeTruthy();
    expect(await findByText("Chapter 1 story.")).toBeTruthy();
    expect(getByText("Before the bridges")).toBeTruthy();
    await waitFor(() => expect(mockChapter).toHaveBeenCalledTimes(2));
    expect(mockChapter.mock.calls.map((c) => c[6])).toEqual([0, 1]);
  });

  it("jumps to a chapter when its row is tapped", async () => {
    const { findByText, getByText } = await render(<DeepDiveSheet {...props()} />);
    await findByText("Chapter 1 story.");

    fireEvent.press(getByText("Reborn as a market"));

    expect(await findByText("Chapter 4 story.")).toBeTruthy();
  });

  it("calls onClose from Back to walking", async () => {
    const onClose = jest.fn();
    const { getByLabelText } = await render(<DeepDiveSheet {...props({ onClose })} />);

    fireEvent.press(getByLabelText("deepDive.back"));

    expect(onClose).toHaveBeenCalled();
  });
});
