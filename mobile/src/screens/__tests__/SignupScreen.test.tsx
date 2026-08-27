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
jest.mock("expo-apple-authentication", () => {
  const { TouchableOpacity } = require("react-native");
  return {
    isAvailableAsync: jest.fn(),
    // The real component renders Apple's own native, non-mockable button --
    // stand in with a plain pressable carrying the same testID/onPress so
    // tests can still find and press it.
    AppleAuthenticationButton: ({ onPress, testID }: any) =>
      require("react").createElement(TouchableOpacity, { onPress, testID }),
    AppleAuthenticationButtonType: { CONTINUE: 0 },
    AppleAuthenticationButtonStyle: { BLACK: 0 },
  };
});
// Stand-in for the real native spinner/dialog -- a single press fires
// onChange with whatever date the test queued up via setNextPickedDate,
// same shape (event, date) as the real component.
let mockNextPickedDate: Date | null = null;
jest.mock("@react-native-community/datetimepicker", () => {
  const { TouchableOpacity, Text } = require("react-native");
  return function MockDateTimePicker(props: any) {
    return require("react").createElement(
      TouchableOpacity,
      {
        testID: "date-time-picker",
        onPress: () => props.onChange({ type: "set" }, mockNextPickedDate ?? props.value),
      },
      require("react").createElement(Text, null, "mock-date-picker")
    );
  };
});

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

// Drives the iOS sheet flow: open the field, "scroll" the mock picker to
// the queued date, then tap Done to commit it -- mirrors how a real walker
// can only ever land on a structurally valid calendar date, never a
// malformed one like month 13.
async function setDob(rtl: any, year: number, month: number, day: number) {
  mockNextPickedDate = new Date(year, month - 1, day);
  await fireEvent.press(rtl.getByLabelText("signup.dobLabel"));
  await fireEvent.press(rtl.getByTestId("date-time-picker"));
  await fireEvent.press(rtl.getByText("signup.dobDone"));
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
    const { getByText, queryByTestId } = await render(<SignupScreen {...baseProps()} />);

    expect(getByText("signup.continueWithGoogle")).toBeTruthy();
    await waitFor(() => expect(queryByTestId("apple-auth-button")).toBeNull());
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
    const { findByTestId } = await render(<SignupScreen {...baseProps({ onSignedUp })} />);

    await fireEvent.press(await findByTestId("apple-auth-button"));

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
    const rtl = await render(<SignupScreen {...baseProps()} />);
    const { getByText, getByLabelText, getByPlaceholderText } = rtl;
    await goToEmailStep(getByText);

    const submitBtn = getByLabelText("signup.createAccount");
    expect(submitBtn.props.accessibilityState?.disabled).toBe(true);

    await fireEvent.changeText(getByPlaceholderText("signup.fullNamePlaceholder"), "Ada Lovelace");
    await fireEvent.changeText(getByPlaceholderText("signup.emailPlaceholder"), "ada@example.com");
    await setDob(rtl, 1990, 12, 10);
    await fireEvent.changeText(getByPlaceholderText("signup.passwordPlaceholder"), "password123");

    // Everything but the privacy checkbox is filled in -- still disabled.
    expect(getByLabelText("signup.createAccount").props.accessibilityState?.disabled).toBe(true);
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("email step: Create Account stays disabled while no date of birth has been picked yet", async () => {
    const rtl = await render(<SignupScreen {...baseProps()} />);
    const { getByText, getByPlaceholderText, getByLabelText } = rtl;
    await goToEmailStep(getByText);

    await fireEvent.changeText(getByPlaceholderText("signup.fullNamePlaceholder"), "Ada Lovelace");
    await fireEvent.changeText(getByPlaceholderText("signup.emailPlaceholder"), "ada@example.com");
    await fireEvent.changeText(getByPlaceholderText("signup.passwordPlaceholder"), "password123");
    await fireEvent.changeText(getByPlaceholderText("signup.confirmPasswordPlaceholder"), "password123");
    await fireEvent.press(getByLabelText("signup.privacyCheckboxA11y"));

    expect(getByText("signup.dobPlaceholder")).toBeTruthy();
    expect(getByLabelText("signup.createAccount").props.accessibilityState?.disabled).toBe(true);
  });

  it("email step: a date of birth under the 13-year minimum keeps Create Account disabled and alerts on submit", async () => {
    // Computed relative to today rather than a fixed year, so this stays
    // true regardless of when the suite runs -- a real 5-year-old today.
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);

    const rtl = await render(<SignupScreen {...baseProps()} />);
    const { getByText, getByPlaceholderText, getByLabelText } = rtl;
    await goToEmailStep(getByText);

    await fireEvent.changeText(getByPlaceholderText("signup.fullNamePlaceholder"), "Too Young");
    await fireEvent.changeText(getByPlaceholderText("signup.emailPlaceholder"), "young@example.com");
    await setDob(rtl, fiveYearsAgo.getFullYear(), fiveYearsAgo.getMonth() + 1, fiveYearsAgo.getDate());
    await fireEvent.changeText(getByPlaceholderText("signup.passwordPlaceholder"), "password123");
    await fireEvent.press(getByLabelText("signup.privacyCheckboxA11y"));

    // The structural date is valid (a real calendar date), but too young --
    // must stay disabled the same as any other invalid-DOB case, not just
    // silently accepted with an alert as the only guard.
    expect(getByLabelText("signup.createAccount").props.accessibilityState?.disabled).toBe(true);
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("email step: a mismatched confirm-password keeps Create Account disabled", async () => {
    const rtl = await render(<SignupScreen {...baseProps()} />);
    const { getByText, getByLabelText, getByPlaceholderText } = rtl;
    await goToEmailStep(getByText);

    await fireEvent.changeText(getByPlaceholderText("signup.fullNamePlaceholder"), "Ada Lovelace");
    await fireEvent.changeText(getByPlaceholderText("signup.emailPlaceholder"), "ada@example.com");
    await setDob(rtl, 1990, 3, 5);
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
    const rtl = await render(<SignupScreen {...baseProps({ onSignedUp, onBack })} />);
    const { getByText, getByPlaceholderText, getByLabelText } = rtl;
    await goToEmailStep(getByText);

    await fireEvent.changeText(getByPlaceholderText("signup.fullNamePlaceholder"), "Ada Lovelace");
    await fireEvent.changeText(getByPlaceholderText("signup.emailPlaceholder"), "ada@example.com");
    await setDob(rtl, 1990, 3, 5);
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
    const rtl = await render(<SignupScreen {...baseProps({ onSignedUp, onBack })} />);
    const { getByText, getByPlaceholderText, getByLabelText } = rtl;
    await goToEmailStep(getByText);

    await fireEvent.changeText(getByPlaceholderText("signup.fullNamePlaceholder"), "Ada Lovelace");
    await fireEvent.changeText(getByPlaceholderText("signup.emailPlaceholder"), "ada@example.com");
    await setDob(rtl, 1990, 3, 5);
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
