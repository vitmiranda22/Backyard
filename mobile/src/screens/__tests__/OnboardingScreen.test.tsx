import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

jest.mock("../../services/haptics", () => ({ tap: jest.fn() }));

import OnboardingScreen from "../OnboardingScreen";

describe("OnboardingScreen", () => {
  it("starts on card 1 with a 'next' button, not 'get started'", async () => {
    const { getByText, queryByText } = await render(<OnboardingScreen onDone={jest.fn()} />);

    expect(getByText("onboarding.card1.title")).toBeTruthy();
    expect(getByText("onboarding.next")).toBeTruthy();
    expect(queryByText("onboarding.getStarted")).toBeNull();
  });

  it("advances through all 4 cards without calling onDone early", async () => {
    const onDone = jest.fn();
    const { getByText } = await render(<OnboardingScreen onDone={onDone} />);

    await fireEvent.press(getByText("onboarding.next")); // -> card2
    expect(getByText("onboarding.card2.title")).toBeTruthy();

    await fireEvent.press(getByText("onboarding.next")); // -> card3
    expect(getByText("onboarding.card3.title")).toBeTruthy();

    await fireEvent.press(getByText("onboarding.next")); // -> card4 (last)
    expect(getByText("onboarding.card4.title")).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("shows 'get started' on the last card and calls onDone when pressed", async () => {
    const onDone = jest.fn();
    const { getByText } = await render(<OnboardingScreen onDone={onDone} />);

    await fireEvent.press(getByText("onboarding.next")); // card2
    await fireEvent.press(getByText("onboarding.next")); // card3
    await fireEvent.press(getByText("onboarding.next")); // card4, last

    expect(getByText("onboarding.getStarted")).toBeTruthy();

    await fireEvent.press(getByText("onboarding.getStarted"));

    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("calls onDone immediately when skip is pressed, regardless of card index", async () => {
    const onDone = jest.fn();
    const { getByText } = await render(<OnboardingScreen onDone={onDone} />);

    await fireEvent.press(getByText("onboarding.next")); // now on card2
    await fireEvent.press(getByText("onboarding.skip"));

    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
