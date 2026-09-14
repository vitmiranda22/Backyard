import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import SafetyModal from "../SafetyModal";

describe("SafetyModal", () => {
  it("renders the title, all 5 tips, and the CTA when visible", async () => {
    const { getByText } = await render(<SafetyModal visible={true} onDismiss={jest.fn()} />);

    expect(getByText("activeTour.safety.title")).toBeTruthy();
    for (let i = 1; i <= 5; i++) {
      expect(getByText(`activeTour.safety.tip${i}`)).toBeTruthy();
    }
    expect(getByText("activeTour.safety.cta")).toBeTruthy();
  });

  it("calls onDismiss when the CTA is pressed", async () => {
    const onDismiss = jest.fn();
    const { getByText } = await render(<SafetyModal visible={true} onDismiss={onDismiss} />);

    await fireEvent.press(getByText("activeTour.safety.cta"));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("shows a waiting state instead of dismissing when the CTA is pressed before isReady", async () => {
    const onDismiss = jest.fn();
    const { getByText, queryByText } = await render(
      <SafetyModal visible={true} onDismiss={onDismiss} isReady={false} />
    );

    await fireEvent.press(getByText("activeTour.safety.cta"));

    expect(onDismiss).not.toHaveBeenCalled();
    expect(getByText("activeTour.safety.preparingWalk")).toBeTruthy();
    expect(queryByText("activeTour.safety.cta")).toBeNull();
  });

  it("auto-dismisses once isReady flips true after the walker already tapped the CTA", async () => {
    const onDismiss = jest.fn();
    const { getByText, rerender } = await render(
      <SafetyModal visible={true} onDismiss={onDismiss} isReady={false} />
    );

    await fireEvent.press(getByText("activeTour.safety.cta"));
    expect(onDismiss).not.toHaveBeenCalled();

    await rerender(<SafetyModal visible={true} onDismiss={onDismiss} isReady={true} />);

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("dismisses immediately on press when isReady is already true", async () => {
    const onDismiss = jest.fn();
    const { getByText } = await render(
      <SafetyModal visible={true} onDismiss={onDismiss} isReady={true} />
    );

    await fireEvent.press(getByText("activeTour.safety.cta"));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("does not render its content when visible is false", async () => {
    const { queryByText } = await render(<SafetyModal visible={false} onDismiss={jest.fn()} />);

    // RN's <Modal visible={false}> still mounts children in the tree but
    // doesn't display them -- content should still not be queryable via
    // the same text lookups a visible modal would expose.
    expect(queryByText("activeTour.safety.title")).toBeNull();
  });
});
