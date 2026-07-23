import React from "react";
import { Alert } from "react-native";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

jest.mock("../../services/auth", () => ({
  requestPasswordReset: jest.fn(),
}));

import ForgotPasswordScreen from "../ForgotPasswordScreen";
import { requestPasswordReset } from "../../services/auth";

const mockRequestPasswordReset = requestPasswordReset as jest.Mock;

function baseProps(overrides = {}) {
  return { onBack: jest.fn(), ...overrides };
}

describe("ForgotPasswordScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  it("shows a validation alert instead of calling requestPasswordReset when email is empty", async () => {
    const { getByText } = await render(<ForgotPasswordScreen {...baseProps()} />);

    await fireEvent.press(getByText("forgotPassword.sendLink"));

    expect(Alert.alert).toHaveBeenCalledWith("common.error", "forgotPassword.missingEmail");
    expect(mockRequestPasswordReset).not.toHaveBeenCalled();
  });

  it("sends the reset email and shows the confirmation state on success", async () => {
    mockRequestPasswordReset.mockResolvedValue(undefined);
    const { getByText, getByPlaceholderText, queryByText } = await render(
      <ForgotPasswordScreen {...baseProps()} />
    );

    await fireEvent.changeText(getByPlaceholderText("forgotPassword.emailPlaceholder"), "ada@example.com");
    await fireEvent.press(getByText("forgotPassword.sendLink"));

    expect(mockRequestPasswordReset).toHaveBeenCalledWith("ada@example.com");
    await waitFor(() => expect(getByText("forgotPassword.sentHeading")).toBeTruthy());
    expect(queryByText("forgotPassword.sendLink")).toBeNull();
  });

  it("shows an alert and stays on the form when the request fails", async () => {
    mockRequestPasswordReset.mockRejectedValue(new Error("network error"));
    const { getByText, getByPlaceholderText, queryByText } = await render(
      <ForgotPasswordScreen {...baseProps()} />
    );

    await fireEvent.changeText(getByPlaceholderText("forgotPassword.emailPlaceholder"), "ada@example.com");
    await fireEvent.press(getByText("forgotPassword.sendLink"));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("forgotPassword.failed", "network error"));
    expect(queryByText("forgotPassword.sentHeading")).toBeNull();
  });

  it("calls onBack from both the back arrow and the confirmation screen", async () => {
    mockRequestPasswordReset.mockResolvedValue(undefined);
    const onBack = jest.fn();
    const { getByText, getByLabelText, getByPlaceholderText } = await render(
      <ForgotPasswordScreen {...baseProps({ onBack })} />
    );

    await fireEvent.press(getByLabelText("forgotPassword.backA11y"));
    expect(onBack).toHaveBeenCalledTimes(1);

    await fireEvent.changeText(getByPlaceholderText("forgotPassword.emailPlaceholder"), "ada@example.com");
    await fireEvent.press(getByText("forgotPassword.sendLink"));
    await fireEvent.press(getByText("forgotPassword.backToSignIn"));
    expect(onBack).toHaveBeenCalledTimes(2);
  });
});
