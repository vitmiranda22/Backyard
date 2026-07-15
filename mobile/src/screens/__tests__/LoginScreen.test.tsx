import React from "react";
import { Alert } from "react-native";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

jest.mock("../../services/auth", () => ({
  signIn: jest.fn(),
  signUp: jest.fn(),
}));
jest.mock("../../services/analytics", () => ({
  track: jest.fn(),
}));

import LoginScreen from "../LoginScreen";
import { signIn, signUp } from "../../services/auth";
import { track } from "../../services/analytics";

const mockSignIn = signIn as jest.Mock;
const mockSignUp = signUp as jest.Mock;
const mockTrack = track as jest.Mock;

// This RTL version's render()/fireEvent both use async act() internally
// and must be awaited, or state updates from an event aren't guaranteed
// to have flushed before the next assertion runs (flaky pass/fail
// depending on microtask timing) — see docs/api/fire-event.md.
async function fillForm(getByPlaceholderText: any, email: string, password: string) {
  await fireEvent.changeText(getByPlaceholderText("login.emailPlaceholder"), email);
  await fireEvent.changeText(getByPlaceholderText("login.passwordPlaceholder"), password);
}

describe("LoginScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  it("shows a validation alert instead of calling signIn when fields are empty", async () => {
    const { getByText } = await render(<LoginScreen onLogin={jest.fn()} />);

    await fireEvent.press(getByText("login.signIn"));

    expect(Alert.alert).toHaveBeenCalledWith("common.error", "login.missingFields");
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("signs in, tracks the event, and calls onLogin on success", async () => {
    mockSignIn.mockResolvedValue({});
    const onLogin = jest.fn();
    const { getByPlaceholderText, getByText } = await render(<LoginScreen onLogin={onLogin} />);

    await fillForm(getByPlaceholderText, "a@b.com", "password123");
    await fireEvent.press(getByText("login.signIn"));

    await waitFor(() => expect(onLogin).toHaveBeenCalled());
    expect(mockSignIn).toHaveBeenCalledWith("a@b.com", "password123");
    expect(mockTrack).toHaveBeenCalledWith("login_completed");
  });

  it("shows the server's error message on a failed sign-in, never calls onLogin", async () => {
    mockSignIn.mockRejectedValue(new Error("Invalid credentials"));
    const onLogin = jest.fn();
    const { getByPlaceholderText, getByText } = await render(<LoginScreen onLogin={onLogin} />);

    await fillForm(getByPlaceholderText, "a@b.com", "wrongpass");
    await fireEvent.press(getByText("login.signIn"));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("login.signInFailed", "Invalid credentials"));
    expect(onLogin).not.toHaveBeenCalled();
  });

  it("rejects a short password on sign-up before ever calling signUp", async () => {
    const { getByPlaceholderText, getByText } = await render(<LoginScreen onLogin={jest.fn()} />);

    await fillForm(getByPlaceholderText, "a@b.com", "123");
    await fireEvent.press(getByText("login.createAccount"));

    expect(Alert.alert).toHaveBeenCalledWith("common.error", "login.passwordTooShort");
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("signs up and tracks the event on success, without calling onLogin", async () => {
    mockSignUp.mockResolvedValue({});
    const onLogin = jest.fn();
    const { getByPlaceholderText, getByText } = await render(<LoginScreen onLogin={onLogin} />);

    await fillForm(getByPlaceholderText, "new@b.com", "password123");
    await fireEvent.press(getByText("login.createAccount"));

    await waitFor(() => expect(mockTrack).toHaveBeenCalledWith("signup_completed"));
    expect(Alert.alert).toHaveBeenCalledWith("common.success", "login.accountCreated");
    // Sign-up requires email confirmation before the app treats you as
    // logged in — this screen must never fire onLogin itself.
    expect(onLogin).not.toHaveBeenCalled();
  });
});
