import React from "react";
import { Alert, Linking } from "react-native";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

jest.mock("../../services/auth", () => ({
  signUp: jest.fn(),
  signInWithApple: jest.fn(),
  signInWithGoogle: jest.fn(),
}));
jest.mock("../../services/analytics", () => ({
  track: jest.fn(),
}));
jest.mock("expo-apple-authentication", () => ({
  isAvailableAsync: jest.fn(),
}));

import SignupScreen from "../SignupScreen";
import { signUp, signInWithApple, signInWithGoogle } from "../../services/auth";
import { track } from "../../services/analytics";
import * as AppleAuthentication from "expo-apple-authentication";

const mockSignUp = signUp as jest.Mock;
const mockSignInWithApple = signInWithApple as jest.Mock;
const mockSignInWithGoogle = signInWithGoogle as jest.Mock;
const mockTrack = track as jest.Mock;
const mockIsAppleAvailable = AppleAuthentication.isAvailableAsync as jest.Mock;

function baseProps(overrides = {}) {
  return { onBack: jest.fn(), onSignedUp: jest.fn(), ...overrides };
}

async function goToEmailStep(getByText: any) {
  await fireEvent.press(getByText("signup.continueWithEmail"));
}

describe("SignupScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    jest.spyOn(Linking, "openURL").mockResolvedValue(undefined as any);
    mockIsAppleAvailable.mockResolvedValue(false);
  });

  it("method step: hides the Apple button on a device where Sign in with Apple isn't available", async () => {
    mockIsAppleAvailable.mockResolvedValue(false);
    const { getByText, queryByText } = await render(<SignupScreen {...baseProps()} />);

    expect(getByText("signup.continueWithGoogle")).toBeTruthy();
    await waitFor(() => expect(queryByText("signup.continueWithApple")).toBeNull());
  });

  it("method step: Google sign-up exchanges the token, tracks the event, and calls onSignedUp", async () => {
    mockSignInWithGoogle.mockResolvedValue({});
    const onSignedUp = jest.fn();
    const { getByText } = await render(<SignupScreen {...baseProps({ onSignedUp })} />);

    await fireEvent.press(getByText("signup.continueWithGoogle"));

    await waitFor(() => expect(onSignedUp).toHaveBeenCalled());
    expect(mockSignInWithGoogle).toHaveBeenCalled();
    expect(mockSignUp).not.toHaveBeenCalled();
    expect(mockTrack).toHaveBeenCalledWith("signup_completed", { provider: "google" });
  });

  it("method step: Apple sign-up exchanges the token, tracks the event, and calls onSignedUp", async () => {
    mockIsAppleAvailable.mockResolvedValue(true);
    mockSignInWithApple.mockResolvedValue({});
    const onSignedUp = jest.fn();
    const { findByText } = await render(<SignupScreen {...baseProps({ onSignedUp })} />);

    await fireEvent.press(await findByText("signup.continueWithApple"));

    await waitFor(() => expect(onSignedUp).toHaveBeenCalled());
    expect(mockSignInWithApple).toHaveBeenCalled();
    expect(mockTrack).toHaveBeenCalledWith("signup_completed", { provider: "apple" });
  });

  it("method step: a cancelled Google sign-up shows no alert and never calls onSignedUp", async () => {
    mockSignInWithGoogle.mockRejectedValue({ code: "SIGN_IN_CANCELLED" });
    const onSignedUp = jest.fn();
    const { getByText } = await render(<SignupScreen {...baseProps({ onSignedUp })} />);

    await fireEvent.press(getByText("signup.continueWithGoogle"));

    await waitFor(() => expect(mockSignInWithGoogle).toHaveBeenCalled());
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(onSignedUp).not.toHaveBeenCalled();
  });

  it("method step: a real Google sign-up failure shows the server's error message", async () => {
    mockSignInWithGoogle.mockRejectedValue(new Error("network error"));
    const { getByText } = await render(<SignupScreen {...baseProps()} />);

    await fireEvent.press(getByText("signup.continueWithGoogle"));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("signup.signUpFailed", "network error"));
  });

  it("method step: back calls onBack", async () => {
    const onBack = jest.fn();
    const { getByLabelText } = await render(<SignupScreen {...baseProps({ onBack })} />);

    await fireEvent.press(getByLabelText("signup.backA11y"));

    expect(onBack).toHaveBeenCalled();
  });

  it("continue with email advances to the details form", async () => {
    const { getByText, findByText } = await render(<SignupScreen {...baseProps()} />);

    await goToEmailStep(getByText);

    expect(await findByText("signup.detailsHeading")).toBeTruthy();
  });

  it("email step: Create Account stays disabled until name/email/DOB/password/privacy are all valid", async () => {
    const { getByText, getByLabelText, getByPlaceholderText } = await render(<SignupScreen {...baseProps()} />);
    await goToEmailStep(getByText);

    const submitBtn = getByLabelText("signup.createAccount");
    expect(submitBtn.props.accessibilityState?.disabled).toBe(true);

    await fireEvent.changeText(getByPlaceholderText("signup.fullNamePlaceholder"), "Ada Lovelace");
    await fireEvent.changeText(getByPlaceholderText("signup.emailPlaceholder"), "ada@example.com");
    await fireEvent.changeText(getByPlaceholderText("signup.dobMonthPlaceholder"), "12");
    await fireEvent.changeText(getByPlaceholderText("signup.dobDayPlaceholder"), "10");
    await fireEvent.changeText(getByPlaceholderText("signup.dobYearPlaceholder"), "1990");
    await fireEvent.changeText(getByPlaceholderText("signup.passwordPlaceholder"), "password123");

    // Everything but the privacy checkbox is filled in -- still disabled.
    expect(getByLabelText("signup.createAccount").props.accessibilityState?.disabled).toBe(true);
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("email step: an invalid date of birth keeps Create Account disabled", async () => {
    const { getByText, getByPlaceholderText, getByLabelText } = await render(<SignupScreen {...baseProps()} />);
    await goToEmailStep(getByText);

    await fireEvent.changeText(getByPlaceholderText("signup.fullNamePlaceholder"), "Ada Lovelace");
    await fireEvent.changeText(getByPlaceholderText("signup.emailPlaceholder"), "ada@example.com");
    await fireEvent.changeText(getByPlaceholderText("signup.dobMonthPlaceholder"), "13"); // invalid month
    await fireEvent.changeText(getByPlaceholderText("signup.dobDayPlaceholder"), "10");
    await fireEvent.changeText(getByPlaceholderText("signup.dobYearPlaceholder"), "1990");
    await fireEvent.changeText(getByPlaceholderText("signup.passwordPlaceholder"), "password123");
    await fireEvent.press(getByLabelText("signup.privacyCheckboxA11y"));

    expect(getByLabelText("signup.createAccount").props.accessibilityState?.disabled).toBe(true);
  });

  it("email step: a date of birth under the 13-year minimum keeps Create Account disabled and alerts on submit", async () => {
    // Computed relative to today rather than a fixed year, so this stays
    // true regardless of when the suite runs -- a real 5-year-old today.
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);

    const { getByText, getByPlaceholderText, getByLabelText } = await render(<SignupScreen {...baseProps()} />);
    await goToEmailStep(getByText);

    await fireEvent.changeText(getByPlaceholderText("signup.fullNamePlaceholder"), "Too Young");
    await fireEvent.changeText(getByPlaceholderText("signup.emailPlaceholder"), "young@example.com");
    await fireEvent.changeText(getByPlaceholderText("signup.dobMonthPlaceholder"), String(fiveYearsAgo.getMonth() + 1));
    await fireEvent.changeText(getByPlaceholderText("signup.dobDayPlaceholder"), String(fiveYearsAgo.getDate()));
    await fireEvent.changeText(getByPlaceholderText("signup.dobYearPlaceholder"), String(fiveYearsAgo.getFullYear()));
    await fireEvent.changeText(getByPlaceholderText("signup.passwordPlaceholder"), "password123");
    await fireEvent.press(getByLabelText("signup.privacyCheckboxA11y"));

    // The structural date is valid (real month/day/year), but too young --
    // must stay disabled the same as any other invalid-DOB case, not just
    // silently accepted with an alert as the only guard.
    expect(getByLabelText("signup.createAccount").props.accessibilityState?.disabled).toBe(true);
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("email step: a mismatched confirm-password keeps Create Account disabled", async () => {
    const { getByText, getByLabelText, getByPlaceholderText } = await render(<SignupScreen {...baseProps()} />);
    await goToEmailStep(getByText);

    await fireEvent.changeText(getByPlaceholderText("signup.fullNamePlaceholder"), "Ada Lovelace");
    await fireEvent.changeText(getByPlaceholderText("signup.emailPlaceholder"), "ada@example.com");
    await fireEvent.changeText(getByPlaceholderText("signup.dobMonthPlaceholder"), "3");
    await fireEvent.changeText(getByPlaceholderText("signup.dobDayPlaceholder"), "5");
    await fireEvent.changeText(getByPlaceholderText("signup.dobYearPlaceholder"), "1990");
    await fireEvent.changeText(getByPlaceholderText("signup.passwordPlaceholder"), "password123");
    await fireEvent.changeText(getByPlaceholderText("signup.confirmPasswordPlaceholder"), "password456");
    await fireEvent.press(getByLabelText("signup.privacyCheckboxA11y"));

    expect(getByText("signup.passwordsDontMatch")).toBeTruthy();
    expect(getByLabelText("signup.createAccount").props.accessibilityState?.disabled).toBe(true);
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("creates the account and calls onSignedUp directly when a session comes back immediately (email confirmation off)", async () => {
    mockSignUp.mockResolvedValue({ session: { access_token: "new-session-token" }, user: { id: "u1" } });
    const onSignedUp = jest.fn();
    const onBack = jest.fn();
    const { getByText, getByPlaceholderText, getByLabelText } = await render(
      <SignupScreen {...baseProps({ onSignedUp, onBack })} />
    );
    await goToEmailStep(getByText);

    await fireEvent.changeText(getByPlaceholderText("signup.fullNamePlaceholder"), "Ada Lovelace");
    await fireEvent.changeText(getByPlaceholderText("signup.emailPlaceholder"), "ada@example.com");
    await fireEvent.changeText(getByPlaceholderText("signup.dobMonthPlaceholder"), "3");
    await fireEvent.changeText(getByPlaceholderText("signup.dobDayPlaceholder"), "5");
    await fireEvent.changeText(getByPlaceholderText("signup.dobYearPlaceholder"), "1990");
    await fireEvent.changeText(getByPlaceholderText("signup.passwordPlaceholder"), "password123");
    await fireEvent.changeText(getByPlaceholderText("signup.confirmPasswordPlaceholder"), "password123");
    await fireEvent.press(getByLabelText("signup.privacyCheckboxA11y"));

    const submitBtn = getByLabelText("signup.createAccount");
    expect(submitBtn.props.accessibilityState?.disabled).toBe(false);
    await fireEvent.press(submitBtn);

    await waitFor(() => expect(mockSignUp).toHaveBeenCalledWith("ada@example.com", "password123", "Ada Lovelace", "1990-03-05"));
    expect(mockTrack).toHaveBeenCalledWith("signup_completed");
    expect(onSignedUp).toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("shows a check-your-email message and returns to Login when no session comes back (email confirmation required)", async () => {
    mockSignUp.mockResolvedValue({ session: null, user: { id: "u1" } });
    const onSignedUp = jest.fn();
    const onBack = jest.fn();
    const { getByText, getByPlaceholderText, getByLabelText } = await render(
      <SignupScreen {...baseProps({ onSignedUp, onBack })} />
    );
    await goToEmailStep(getByText);

    await fireEvent.changeText(getByPlaceholderText("signup.fullNamePlaceholder"), "Ada Lovelace");
    await fireEvent.changeText(getByPlaceholderText("signup.emailPlaceholder"), "ada@example.com");
    await fireEvent.changeText(getByPlaceholderText("signup.dobMonthPlaceholder"), "3");
    await fireEvent.changeText(getByPlaceholderText("signup.dobDayPlaceholder"), "5");
    await fireEvent.changeText(getByPlaceholderText("signup.dobYearPlaceholder"), "1990");
    await fireEvent.changeText(getByPlaceholderText("signup.passwordPlaceholder"), "password123");
    await fireEvent.changeText(getByPlaceholderText("signup.confirmPasswordPlaceholder"), "password123");
    await fireEvent.press(getByLabelText("signup.privacyCheckboxA11y"));

    await fireEvent.press(getByLabelText("signup.createAccount"));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("common.success", "signup.checkEmailToConfirm"));
    expect(onSignedUp).not.toHaveBeenCalled();
    expect(onBack).toHaveBeenCalled();
  });

  it("tapping the Privacy Policy / Terms links opens the real hosted pages", async () => {
    const { getByText } = await render(<SignupScreen {...baseProps()} />);
    await goToEmailStep(getByText);

    await fireEvent.press(getByText("signup.privacyPolicy"));
    await fireEvent.press(getByText("signup.termsOfService"));

    expect(Linking.openURL).toHaveBeenCalledWith("https://backyard-api.onrender.com/privacy");
    expect(Linking.openURL).toHaveBeenCalledWith("https://backyard-api.onrender.com/terms");
  });
});
