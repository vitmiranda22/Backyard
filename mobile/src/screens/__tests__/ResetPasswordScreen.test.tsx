import React from "react";
import { Alert } from "react-native";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

jest.mock("../../services/auth", () => ({
  updatePassword: jest.fn(),
  signOut: jest.fn(),
}));

import ResetPasswordScreen from "../ResetPasswordScreen";
import { updatePassword, signOut } from "../../services/auth";

const mockUpdatePassword = updatePassword as jest.Mock;
const mockSignOut = signOut as jest.Mock;

function baseProps(overrides = {}) {
  return { onDone: jest.fn(), ...overrides };
}

describe("ResetPasswordScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  it("shows an alert instead of saving when the password is too short", async () => {
    const { getByText, getByPlaceholderText } = await render(<ResetPasswordScreen {...baseProps()} />);

    await fireEvent.changeText(getByPlaceholderText("resetPassword.newPasswordPlaceholder"), "abc");
    await fireEvent.changeText(getByPlaceholderText("resetPassword.confirmPasswordPlaceholder"), "abc");
    await fireEvent.press(getByText("resetPassword.save"));

    expect(Alert.alert).toHaveBeenCalledWith("common.error", "resetPassword.passwordTooShort");
    expect(mockUpdatePassword).not.toHaveBeenCalled();
  });

  it("shows an alert instead of saving when the passwords don't match", async () => {
    const { getByText, getByPlaceholderText } = await render(<ResetPasswordScreen {...baseProps()} />);

    await fireEvent.changeText(getByPlaceholderText("resetPassword.newPasswordPlaceholder"), "password123");
    await fireEvent.changeText(getByPlaceholderText("resetPassword.confirmPasswordPlaceholder"), "password456");
    await fireEvent.press(getByText("resetPassword.save"));

    expect(Alert.alert).toHaveBeenCalledWith("common.error", "resetPassword.passwordsDontMatch");
    expect(mockUpdatePassword).not.toHaveBeenCalled();
  });

  it("updates the password, signs out, and calls onDone on success", async () => {
    mockUpdatePassword.mockResolvedValue(undefined);
    mockSignOut.mockResolvedValue(undefined);
    const onDone = jest.fn();
    const { getByText, getByPlaceholderText } = await render(<ResetPasswordScreen {...baseProps({ onDone })} />);

    await fireEvent.changeText(getByPlaceholderText("resetPassword.newPasswordPlaceholder"), "newpassword123");
    await fireEvent.changeText(getByPlaceholderText("resetPassword.confirmPasswordPlaceholder"), "newpassword123");
    await fireEvent.press(getByText("resetPassword.save"));

    expect(mockUpdatePassword).toHaveBeenCalledWith("newpassword123");
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
    expect(Alert.alert).toHaveBeenCalledWith("common.success", "resetPassword.success");
    expect(onDone).toHaveBeenCalled();
  });

  it("shows an alert and never signs out or calls onDone when updatePassword fails", async () => {
    mockUpdatePassword.mockRejectedValue(new Error("recovery session expired"));
    const onDone = jest.fn();
    const { getByText, getByPlaceholderText } = await render(<ResetPasswordScreen {...baseProps({ onDone })} />);

    await fireEvent.changeText(getByPlaceholderText("resetPassword.newPasswordPlaceholder"), "newpassword123");
    await fireEvent.changeText(getByPlaceholderText("resetPassword.confirmPasswordPlaceholder"), "newpassword123");
    await fireEvent.press(getByText("resetPassword.save"));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("resetPassword.failed", "recovery session expired"));
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });
});
