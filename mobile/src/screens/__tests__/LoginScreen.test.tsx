import React from "react";
import { Alert } from "react-native";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

jest.mock("../../services/auth", () => ({
  signIn: jest.fn(),
  signInWithApple: jest.fn(),
  signInWithGoogle: jest.fn(),
  setKeepSignedIn: jest.fn(),
}));
jest.mock("../../services/analytics", () => ({
  track: jest.fn(),
}));
jest.mock("expo-apple-authentication", () => ({
  isAvailableAsync: jest.fn(),
}));

import LoginScreen from "../LoginScreen";
import { signIn, signInWithApple, signInWithGoogle } from "../../services/auth";
import { track } from "../../services/analytics";
import * as AppleAuthentication from "expo-apple-authentication";

const mockSignIn = signIn as jest.Mock;
const mockSignInWithApple = signInWithApple as jest.Mock;
const mockSignInWithGoogle = signInWithGoogle as jest.Mock;
const mockTrack = track as jest.Mock;
const mockIsAppleAvailable = AppleAuthentication.isAvailableAsync as jest.Mock;

// This RTL version's render()/fireEvent both use async act() internally
// and must be awaited, or state updates from an event aren't guaranteed
// to have flushed before the next assertion runs (flaky pass/fail
// depending on microtask timing) — see docs/api/fire-event.md.
async function fillForm(getByPlaceholderText: any, email: string, password: string) {
  await fireEvent.changeText(getByPlaceholderText("login.emailPlaceholder"), email);
  await fireEvent.changeText(getByPlaceholderText("login.passwordPlaceholder"), password);
}

function baseProps(overrides = {}) {
  return { onLogin: jest.fn(), onCreateAccount: jest.fn(), onForgotPassword: jest.fn(), ...overrides };
}

describe("LoginScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockIsAppleAvailable.mockResolvedValue(false);
  });

  it("hides the Apple button on a device where Sign in with Apple isn't available", async () => {
    mockIsAppleAvailable.mockResolvedValue(false);
    const { getByText, queryByText } = await render(<LoginScreen {...baseProps()} />);

    expect(getByText("login.continueWithGoogle")).toBeTruthy();
    await waitFor(() => expect(queryByText("login.continueWithApple")).toBeNull());
  });

  it("Google sign-in exchanges the token, tracks the event, and calls onLogin", async () => {
    mockSignInWithGoogle.mockResolvedValue({});
    const onLogin = jest.fn();
    const { getByText } = await render(<LoginScreen {...baseProps({ onLogin })} />);

    await fireEvent.press(getByText("login.continueWithGoogle"));

    await waitFor(() => expect(onLogin).toHaveBeenCalled());
    expect(mockSignInWithGoogle).toHaveBeenCalled();
    expect(mockSignIn).not.toHaveBeenCalled();
    expect(mockTrack).toHaveBeenCalledWith("login_completed", { provider: "google" });
  });

  it("Apple sign-in exchanges the token, tracks the event, and calls onLogin", async () => {
    mockIsAppleAvailable.mockResolvedValue(true);
    mockSignInWithApple.mockResolvedValue({});
    const onLogin = jest.fn();
    const { findByText } = await render(<LoginScreen {...baseProps({ onLogin })} />);

    await fireEvent.press(await findByText("login.continueWithApple"));

    await waitFor(() => expect(onLogin).toHaveBeenCalled());
    expect(mockSignInWithApple).toHaveBeenCalled();
    expect(mockTrack).toHaveBeenCalledWith("login_completed", { provider: "apple" });
  });

  it("a cancelled Google sign-in shows no alert and never calls onLogin", async () => {
    mockSignInWithGoogle.mockRejectedValue({ code: "SIGN_IN_CANCELLED" });
    const onLogin = jest.fn();
    const { getByText } = await render(<LoginScreen {...baseProps({ onLogin })} />);

    await fireEvent.press(getByText("login.continueWithGoogle"));

    await waitFor(() => expect(mockSignInWithGoogle).toHaveBeenCalled());
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(onLogin).not.toHaveBeenCalled();
  });

  it("shows a validation alert instead of calling signIn when fields are empty", async () => {
    const { getByText } = await render(<LoginScreen {...baseProps()} />);

    await fireEvent.press(getByText("login.signIn"));

    expect(Alert.alert).toHaveBeenCalledWith("common.error", "login.missingFields");
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("signs in, tracks the event, and calls onLogin on success", async () => {
    mockSignIn.mockResolvedValue({});
    const onLogin = jest.fn();
    const { getByPlaceholderText, getByText } = await render(<LoginScreen {...baseProps({ onLogin })} />);

    await fillForm(getByPlaceholderText, "a@b.com", "password123");
    await fireEvent.press(getByText("login.signIn"));

    await waitFor(() => expect(onLogin).toHaveBeenCalled());
    expect(mockSignIn).toHaveBeenCalledWith("a@b.com", "password123");
    expect(mockTrack).toHaveBeenCalledWith("login_completed");
  });

  it("shows the server's error message on a failed sign-in, never calls onLogin", async () => {
    mockSignIn.mockRejectedValue(new Error("Invalid credentials"));
    const onLogin = jest.fn();
    const { getByPlaceholderText, getByText } = await render(<LoginScreen {...baseProps({ onLogin })} />);

    await fillForm(getByPlaceholderText, "a@b.com", "wrongpass");
    await fireEvent.press(getByText("login.signIn"));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("login.signInFailed", "Invalid credentials"));
    expect(onLogin).not.toHaveBeenCalled();
  });

  it("calls onCreateAccount when 'New here?' is pressed, without touching auth at all", async () => {
    const onCreateAccount = jest.fn();
    const { getByText } = await render(<LoginScreen {...baseProps({ onCreateAccount })} />);

    await fireEvent.press(getByText("login.newHere"));

    expect(onCreateAccount).toHaveBeenCalled();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("calls onForgotPassword when 'Forgot password?' is pressed, without touching auth at all", async () => {
    const onForgotPassword = jest.fn();
    const { getByText } = await render(<LoginScreen {...baseProps({ onForgotPassword })} />);

    await fireEvent.press(getByText("login.forgotPassword"));

    expect(onForgotPassword).toHaveBeenCalled();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("shows one of the rotating guide quotes, attributed to a real persona", async () => {
    const { getByText } = await render(<LoginScreen {...baseProps()} />);

    // Exactly one of these three names must appear -- proves the quote
    // pool is wired up and attributed, without pinning to which one this
    // particular random pick landed on.
    const names = ["Silas", "Roxie", "Frankie"];
    const matches = names.filter((name) => {
      try {
        getByText(new RegExp(name));
        return true;
      } catch {
        return false;
      }
    });
    expect(matches.length).toBe(1);
  });
});
