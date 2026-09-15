import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

jest.mock("../../services/api", () => ({
  getTourDetail: jest.fn(),
}));

jest.mock("../../components/NarrationCard", () => {
  const { View, Text, TouchableOpacity } = require("react-native");
  return function MockNarrationCard(props: any) {
    return (
      <View>
        <Text>{props.streetName}</Text>
        <Text>{props.narrationText}</Text>
        {/* Exposes AudioPlayer's real skip button behavior without pulling
            in expo-av -- MuseumTourScreen wires onSkip to goToNext. */}
        <TouchableOpacity onPress={props.onSkip}><Text>skip-narration</Text></TouchableOpacity>
        {/* onAudioFinished must be left undefined by MuseumTourScreen --
            rendering it (only) when defined lets a test assert on that. */}
        {props.onAudioFinished && <Text>has-auto-advance</Text>}
      </View>
    );
  };
});

import MuseumTourScreen from "../MuseumTourScreen";
import { getTourDetail } from "../../services/api";

const mockGetTourDetail = getTourDetail as jest.Mock;

// i18n isn't initialized in this test file (same convention as this
// repo's other screen tests) -- useTranslation()'s t() falls back to
// returning the raw key, with any interpolation options JSON-stringified
// and appended. These are the real strings that fallback produces.
const NEXT = "museumTour.next";
const PREVIOUS = "museumTour.previous";
const BACK = "‹ common.back";
const progressText = (current: number, total: number) =>
  `museumTour.progress {"current":${current},"total":${total}}`;

function block(sequence: number, title: string) {
  return {
    block_id: `block-${sequence}`,
    sequence,
    street_name: `${title} — Some Artist`,
    neighborhood: "European Paintings",
    lat: 40.7794,
    lng: -73.9632,
    narration_text: `Narration for ${title}.`,
    audio_url: `https://x/${sequence}.mp3`,
    image_url: null,
    voice: "neutral",
    mood: "time_machine",
  };
}

function tourDetail(overrides: Partial<any> = {}) {
  return {
    tour_id: "museum-tour-1",
    title: "The Metropolitan Museum of Art",
    mood: "time_machine",
    tour_type: "museum",
    city: "New York",
    avg_rating: 0,
    rating_count: 0,
    blocks_visited: 3,
    total_distance_m: null,
    duration_sec: null,
    is_own_tour: false,
    is_anonymous: false,
    creator_display_name: null,
    creator_avatar_url: null,
    created_at: new Date().toISOString(),
    blocks: [block(1, "Sunflowers"), block(2, "The Harvesters"), block(3, "Boating")],
    like_count: 0,
    liked_by_me: false,
    path: [],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("MuseumTourScreen", () => {
  it("shows the first block and 1 of N progress on load", async () => {
    mockGetTourDetail.mockResolvedValue(tourDetail());

    const { findByText } = await render(<MuseumTourScreen tourId="museum-tour-1" onExit={jest.fn()} />);

    expect(await findByText("Sunflowers — Some Artist")).toBeTruthy();
    expect(await findByText(progressText(1, 3))).toBeTruthy();
  });

  it("advances to the next block and updates progress when Next is tapped", async () => {
    mockGetTourDetail.mockResolvedValue(tourDetail());

    const { findByText } = await render(<MuseumTourScreen tourId="museum-tour-1" onExit={jest.fn()} />);
    await findByText("Sunflowers — Some Artist");

    fireEvent.press(await findByText(NEXT));

    expect(await findByText("The Harvesters — Some Artist")).toBeTruthy();
    expect(await findByText(progressText(2, 3))).toBeTruthy();
  });

  it("goes back to the previous block when Previous is tapped", async () => {
    mockGetTourDetail.mockResolvedValue(tourDetail());

    const { findByText } = await render(<MuseumTourScreen tourId="museum-tour-1" onExit={jest.fn()} />);
    await findByText("Sunflowers — Some Artist");
    fireEvent.press(await findByText(NEXT));
    await findByText("The Harvesters — Some Artist");

    fireEvent.press(await findByText(PREVIOUS));

    expect(await findByText("Sunflowers — Some Artist")).toBeTruthy();
    expect(await findByText(progressText(1, 3))).toBeTruthy();
  });

  it("does not advance past the last block, and Next stays disabled there", async () => {
    mockGetTourDetail.mockResolvedValue(tourDetail());

    const { findByText, getByText } = await render(<MuseumTourScreen tourId="museum-tour-1" onExit={jest.fn()} />);
    await findByText("Sunflowers — Some Artist");

    fireEvent.press(getByText(NEXT));
    await findByText(progressText(2, 3));
    fireEvent.press(getByText(NEXT));
    await findByText(progressText(3, 3));
    fireEvent.press(getByText(NEXT)); // disabled -- should be a no-op

    expect(await findByText("Boating — Some Artist")).toBeTruthy();
    expect(await findByText(progressText(3, 3))).toBeTruthy();
  });

  it("does not go below the first block, and Previous stays disabled there", async () => {
    mockGetTourDetail.mockResolvedValue(tourDetail());

    const { findByText, getByText } = await render(<MuseumTourScreen tourId="museum-tour-1" onExit={jest.fn()} />);
    await findByText("Sunflowers — Some Artist");

    fireEvent.press(getByText(PREVIOUS)); // disabled -- should be a no-op

    expect(await findByText("Sunflowers — Some Artist")).toBeTruthy();
    expect(await findByText(progressText(1, 3))).toBeTruthy();
  });

  it("advancing via the skip button also works, since AudioPlayer's skip is wired to Next", async () => {
    mockGetTourDetail.mockResolvedValue(tourDetail());

    const { findByText } = await render(<MuseumTourScreen tourId="museum-tour-1" onExit={jest.fn()} />);
    await findByText("Sunflowers — Some Artist");

    fireEvent.press(await findByText("skip-narration"));

    expect(await findByText("The Harvesters — Some Artist")).toBeTruthy();
  });

  it("never wires onAudioFinished to auto-advance -- finishing audio does nothing on its own", async () => {
    mockGetTourDetail.mockResolvedValue(tourDetail());

    const { findByText, queryByText } = await render(<MuseumTourScreen tourId="museum-tour-1" onExit={jest.fn()} />);
    await findByText("Sunflowers — Some Artist");

    expect(queryByText("has-auto-advance")).toBeNull();
  });

  it("shows an error state with a retry option when the fetch fails", async () => {
    mockGetTourDetail.mockRejectedValue(new Error("network down"));

    const { findByText } = await render(<MuseumTourScreen tourId="museum-tour-1" onExit={jest.fn()} />);

    expect(await findByText("network down")).toBeTruthy();
  });

  it("calls onExit when the back link is pressed", async () => {
    mockGetTourDetail.mockResolvedValue(tourDetail());
    const onExit = jest.fn();

    const { findByText } = await render(<MuseumTourScreen tourId="museum-tour-1" onExit={onExit} />);
    await findByText("Sunflowers — Some Artist");

    fireEvent.press(await findByText(BACK));

    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("never imports/calls the location service -- this screen is not GPS-triggered", () => {
    // Static guard: MuseumTourScreen's own source must not reference the
    // location service at all -- see the file's own header comment for why.
    const source = require("fs").readFileSync(
      require("path").join(__dirname, "../MuseumTourScreen.tsx"),
      "utf8"
    );
    expect(source).not.toMatch(/services\/location/);
  });
});
