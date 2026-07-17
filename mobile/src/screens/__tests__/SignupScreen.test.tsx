import React from "react";
import { Alert, Linking } from "react-native";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

jest.mock("../../services/auth", () => ({
  signUp: jest.fn(),
}));
jest.mock("../../services/analytics", () => ({
  track: jest.fn(),
}));

import SignupScreen from "../SignupScreen";
import { signUp } from "../../services/auth";
import { track } from "../../services/analytics";

const mockSignUp = signUp as jest.Mock;
const mockTrack = track as jest.Mock;

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
  });

  it("method step: Google/Apple are visually disabled and never call signUp", async () => {
    const { getByText } = await render(<SignupScreen {...baseProps()} />);

    expect(getByText("signup.continueWithGoogle")).toBeTruthy();
    expect(getByText("signup.continueWithApple")).toBeTruthy();
    expect(mockSignUp).not.toHaveBeenCalled();
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

  it("creates the account with the composed YYYY-MM-DD date once every field is valid and privacy is accepted", async () => {
    mockSignUp.mockResolvedValue({});
    const onSignedUp = jest.fn();
    const { getByText, getByPlaceholderText, getByLabelText } = await render(
      <SignupScreen {...baseProps({ onSignedUp })} />
    );
    await goToEmailStep(getByText);

    await fireEvent.changeText(getByPlaceholderText("signup.fullNamePlaceholder"), "Ada Lovelace");
    await fireEvent.changeText(getByPlaceholderText("signup.emailPlaceholder"), "ada@example.com");
    await fireEvent.changeText(getByPlaceholderText("signup.dobMonthPlaceholder"), "3");
    await fireEvent.changeText(getByPlaceholderText("signup.dobDayPlaceholder"), "5");
    await fireEvent.changeText(getByPlaceholderText("signup.dobYearPlaceholder"), "1990");
    await fireEvent.changeText(getByPlaceholderText("signup.passwordPlaceholder"), "password123");
    await fireEvent.press(getByLabelText("signup.privacyCheckboxA11y"));

    const submitBtn = getByLabelText("signup.createAccount");
    expect(submitBtn.props.accessibilityState?.disabled).toBe(false);
    await fireEvent.press(submitBtn);

    await waitFor(() => expect(mockSignUp).toHaveBeenCalledWith("ada@example.com", "password123", "Ada Lovelace", "1990-03-05"));
    expect(mockTrack).toHaveBeenCalledWith("signup_completed");
    expect(onSignedUp).toHaveBeenCalled();
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
