import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

// AudioPlayer pulls in expo-av's Audio.Sound -- not under test here, so a
// bare mock keeps this file focused on NarrationCard's own rendering.
jest.mock("expo-av", () => ({
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: { createAsync: jest.fn() },
  },
}));

import NarrationCard from "../NarrationCard";

function baseProps(overrides = {}) {
  return {
    isLoading: false,
    error: null,
    streetName: "24th St",
    narrationText: "This block was once a streetcar stop.",
    audioUrl: null,
    imageUrl: null,
    ...overrides,
  };
}

describe("NarrationCard", () => {
  it("renders the narration text with no transition prefix by default", async () => {
    const { getByText, queryByText } = await render(<NarrationCard {...baseProps()} />);

    expect(getByText(/This block was once a streetcar stop\./)).toBeTruthy();
    expect(queryByText(/Meanwhile,/)).toBeNull();
  });

  it("prepends the background-generated transition as an underlined leading span in the peek preview", async () => {
    const { getByText } = await render(
      <NarrationCard {...baseProps({ transitionPrefix: "Meanwhile, a few blocks over," })} />
    );

    const prefix = getByText(/Meanwhile, a few blocks over,/);
    expect(prefix).toBeTruthy();
    expect(prefix.props.style).toEqual(
      expect.objectContaining({ textDecorationLine: "underline" })
    );
  });

  it("also shows the underlined transition prefix in the full-story modal", async () => {
    const { getAllByText, getByLabelText } = await render(
      <NarrationCard {...baseProps({ transitionPrefix: "Meanwhile, a few blocks over," })} />
    );

    await fireEvent.press(getByLabelText("narrationCard.readFullStoryA11y"));

    // Two copies now exist -- the collapsed peek preview (still mounted
    // behind the modal) and the full-story modal's own render.
    expect(getAllByText(/Meanwhile, a few blocks over,/).length).toBe(2);
  });

  it("appends the closing beat as an underlined trailing span in the peek preview", async () => {
    const { getByText } = await render(
      <NarrationCard {...baseProps({ closingSuffix: "And that's the whole walk, right there." })} />
    );

    const suffix = getByText(/And that's the whole walk, right there\./);
    expect(suffix).toBeTruthy();
    expect(suffix.props.style).toEqual(
      expect.objectContaining({ textDecorationLine: "underline" })
    );
  });

  it("also shows the underlined closing beat in the full-story modal", async () => {
    const { getAllByText, getByLabelText } = await render(
      <NarrationCard {...baseProps({ closingSuffix: "And that's the whole walk, right there." })} />
    );

    await fireEvent.press(getByLabelText("narrationCard.readFullStoryA11y"));

    expect(getAllByText(/And that's the whole walk, right there\./).length).toBe(2);
  });

  it("renders both a transition prefix and a closing beat together on a tour's final block", async () => {
    const { getByText } = await render(
      <NarrationCard
        {...baseProps({
          transitionPrefix: "Meanwhile, a few blocks over,",
          closingSuffix: "And that's the whole walk, right there.",
        })}
      />
    );

    expect(getByText(/Meanwhile, a few blocks over,/)).toBeTruthy();
    expect(getByText(/And that's the whole walk, right there\./)).toBeTruthy();
  });
});
