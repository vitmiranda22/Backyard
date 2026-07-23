import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import SafetyModal from "../SafetyModal";

describe("SafetyModal", () => {
  it("renders the title, subtitle, all 5 tips, and the CTA when visible", async () => {
    const { getByText } = await render(<SafetyModal visible={true} onDismiss={jest.fn()} />);

    expect(getByText("activeTour.safety.title")).toBeTruthy();
    expect(getByText("activeTour.safety.subtitle")).toBeTruthy();
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

  it("does not render its content when visible is false", async () => {
    const { queryByText } = await render(<SafetyModal visible={false} onDismiss={jest.fn()} />);

    // RN's <Modal visible={false}> still mounts children in the tree but
    // doesn't display them -- content should still not be queryable via
    // the same text lookups a visible modal would expose.
    expect(queryByText("activeTour.safety.title")).toBeNull();
  });
});
