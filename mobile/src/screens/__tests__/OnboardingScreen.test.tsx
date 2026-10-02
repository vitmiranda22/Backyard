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

  it("advances through all 6 cards without calling onDone early", async () => {
    const onDone = jest.fn();
    const { getByText } = await render(<OnboardingScreen onDone={onDone} />);

    await fireEvent.press(getByText("onboarding.next")); // -> card2
    expect(getByText("onboarding.card2.title")).toBeTruthy();

    await fireEvent.press(getByText("onboarding.next")); // -> card3
    expect(getByText("onboarding.card3.title")).toBeTruthy();

    await fireEvent.press(getByText("onboarding.next")); // -> card4
    expect(getByText("onboarding.card4.title")).toBeTruthy();

    await fireEvent.press(getByText("onboarding.next")); // -> card5
    expect(getByText("onboarding.card5.title")).toBeTruthy();

    await fireEvent.press(getByText("onboarding.next")); // -> card6 (last)
    expect(getByText("onboarding.card6.title")).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("shows 'get started' on the last card and calls onDone when pressed", async () => {
    const onDone = jest.fn();
    const { getByText } = await render(<OnboardingScreen onDone={onDone} />);

    await fireEvent.press(getByText("onboarding.next")); // card2
    await fireEvent.press(getByText("onboarding.next")); // card3
    await fireEvent.press(getByText("onboarding.next")); // card4
    await fireEvent.press(getByText("onboarding.next")); // card5
    await fireEvent.press(getByText("onboarding.next")); // card6, last

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

  it("shows the real Home FAB row preview on card 2", async () => {
    const { getByText } = await render(<OnboardingScreen onDone={jest.fn()} />);

    await fireEvent.press(getByText("onboarding.next")); // -> card2

    expect(getByText('↑ onboarding.card2.callout')).toBeTruthy();
  });

  it("shows the real WaypointCompass widget on card 3", async () => {
    const { getByText } = await render(<OnboardingScreen onDone={jest.fn()} />);

    await fireEvent.press(getByText("onboarding.next")); // card2
    await fireEvent.press(getByText("onboarding.next")); // -> card3

    expect(getByText("68m · NE")).toBeTruthy();
  });

  it("shows the real ask-question footer on card 4", async () => {
    const { getByText } = await render(<OnboardingScreen onDone={jest.fn()} />);

    await fireEvent.press(getByText("onboarding.next")); // card2
    await fireEvent.press(getByText("onboarding.next")); // card3
    await fireEvent.press(getByText("onboarding.next")); // -> card4

    expect(getByText("activeTour.holdToAsk")).toBeTruthy();
    expect(getByText("common.pro")).toBeTruthy();
  });

  it("shows the real Badges/Challenge crop on card 5", async () => {
    const { getByText } = await render(<OnboardingScreen onDone={jest.fn()} />);

    await fireEvent.press(getByText("onboarding.next")); // card2
    await fireEvent.press(getByText("onboarding.next")); // card3
    await fireEvent.press(getByText("onboarding.next")); // card4
    await fireEvent.press(getByText("onboarding.next")); // -> card5

    expect(getByText("profile.badges")).toBeTruthy();
    expect(getByText("home.challengeHeading")).toBeTruthy();
  });
});
