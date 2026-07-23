import React from "react";
import { Alert } from "react-native";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";

jest.mock("../../services/auth", () => ({
  getCurrentUserEmail: jest.fn(),
  signOut: jest.fn(),
}));
jest.mock("../../services/api", () => ({
  getSettings: jest.fn(),
  updateSettings: jest.fn(),
  getUserStats: jest.fn(),
  deleteAccount: jest.fn(),
}));
jest.mock("../../services/toast", () => ({ showToast: jest.fn() }));
jest.mock("../../i18n", () => ({
  SUPPORTED_LANGUAGES: [
    { code: "en", label: "English" },
    { code: "es", label: "Español" },
  ],
  setLanguage: jest.fn(),
}));

import ProfileScreen from "../ProfileScreen";
import { getCurrentUserEmail, signOut } from "../../services/auth";
import { getSettings, updateSettings, getUserStats, deleteAccount } from "../../services/api";
import { showToast } from "../../services/toast";

const mockGetCurrentUserEmail = getCurrentUserEmail as jest.Mock;
const mockSignOut = signOut as jest.Mock;
const mockGetSettings = getSettings as jest.Mock;
const mockUpdateSettings = updateSettings as jest.Mock;
const mockGetUserStats = getUserStats as jest.Mock;
const mockDeleteAccount = deleteAccount as jest.Mock;
const mockShowToast = showToast as jest.Mock;

function stats(overrides = {}) {
  return {
    tours_completed: 5,
    total_distance_m: 42_500,
    cities_visited: 1,
    moods_tried: ["time_machine"],
    routes_published: 1,
    total_likes_received: 0,
    walked_at_night: false,
    walked_early: false,
    ...overrides,
  };
}

function baseProps(overrides = {}) {
  return {
    onSignedOut: jest.fn(),
    isPremium: false,
    onOpenVoicePicker: jest.fn(),
    onOpenPaywall: jest.fn(),
    onOpenBadges: jest.fn(),
    ...overrides,
  };
}

describe("ProfileScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockGetCurrentUserEmail.mockResolvedValue("walker@example.com");
    mockGetSettings.mockResolvedValue({ content_safety: false, display_name: "Ada" });
    mockGetUserStats.mockResolvedValue(stats());
  });

  it("shows the signed-in email once loaded", async () => {
    const { findByText } = await render(<ProfileScreen {...baseProps()} />);

    expect(await findByText("walker@example.com")).toBeTruthy();
  });

  it("shows the upgrade button for a free user, and the premium badge for a premium one", async () => {
    const { findByText, queryByText, rerender } = await render(<ProfileScreen {...baseProps({ isPremium: false })} />);
    await findByText("walker@example.com");
    expect(await findByText("profile.upgradeToPremium")).toBeTruthy();

    await act(async () => {
      rerender(<ProfileScreen {...baseProps({ isPremium: true })} />);
    });
    expect(await findByText("profile.premiumMember")).toBeTruthy();
  });

  it("saves the content-safety toggle immediately on change", async () => {
    mockUpdateSettings.mockResolvedValue({});
    const { findByLabelText } = await render(<ProfileScreen {...baseProps()} />);

    const toggle = await findByLabelText("profile.matureContentToggleA11y");
    await fireEvent(toggle, "valueChange", true);

    await waitFor(() => expect(mockUpdateSettings).toHaveBeenCalledWith({ content_safety: true }));
  });

  it("shows a toast when saving the toggle fails", async () => {
    mockUpdateSettings.mockRejectedValue(new Error("network error"));
    const { findByLabelText } = await render(<ProfileScreen {...baseProps()} />);

    const toggle = await findByLabelText("profile.matureContentToggleA11y");
    await fireEvent(toggle, "valueChange", true);

    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith("profile.couldntSaveSetting"));
  });

  it("signs out and calls onSignedOut when Sign Out is pressed", async () => {
    mockSignOut.mockResolvedValue(undefined);
    const props = baseProps();
    const { findByText } = await render(<ProfileScreen {...props} />);

    await fireEvent.press(await findByText("profile.signOut"));

    await waitFor(() => expect(props.onSignedOut).toHaveBeenCalled());
    expect(mockSignOut).toHaveBeenCalled();
  });

  it("shows earned badges but not unearned ones", async () => {
    // first_steps needs >=1 tour, regular_walker needs >=5 — stats() has
    // exactly 5, so both should be earned; century_club (needs 100km) should not.
    const { findByText, queryByText } = await render(<ProfileScreen {...baseProps()} />);

    expect(await findByText("badges.first_steps.label")).toBeTruthy();
    expect(await findByText("badges.regular_walker.label")).toBeTruthy();
    expect(queryByText("badges.century_club.label")).toBeNull();
  });

  it("opens the badge gallery when the badges card is pressed", async () => {
    const props = baseProps();
    const { findByText } = await render(<ProfileScreen {...props} />);

    await fireEvent.press(await findByText("profile.badges"));

    expect(props.onOpenBadges).toHaveBeenCalled();
  });

  it("shows the current display name, and saves a new one once edited", async () => {
    mockUpdateSettings.mockResolvedValue({});
    const { findByText, findByLabelText, getByPlaceholderText } = await render(<ProfileScreen {...baseProps()} />);

    expect(await findByText("Ada")).toBeTruthy();
    await fireEvent.press(await findByLabelText("profile.editDisplayNameA11y"));

    await fireEvent.changeText(getByPlaceholderText("profile.displayName"), "Ada Lovelace");
    await fireEvent.press(await findByText("profile.saveDisplayName"));

    await waitFor(() => expect(mockUpdateSettings).toHaveBeenCalledWith({ display_name: "Ada Lovelace" }));
    expect(mockShowToast).toHaveBeenCalledWith("profile.displayNameSaved");
    expect(await findByText("Ada Lovelace")).toBeTruthy();
  });

  it("shows a validation alert instead of saving an empty display name", async () => {
    const { findByLabelText, getByPlaceholderText, findByText } = await render(<ProfileScreen {...baseProps()} />);

    await fireEvent.press(await findByLabelText("profile.editDisplayNameA11y"));
    await fireEvent.changeText(getByPlaceholderText("profile.displayName"), "   ");
    await fireEvent.press(await findByText("profile.saveDisplayName"));

    expect(Alert.alert).toHaveBeenCalledWith("common.error", "profile.nameCannotBeEmpty");
    expect(mockUpdateSettings).not.toHaveBeenCalled();
  });

  it("shows a toast when saving the display name fails", async () => {
    mockUpdateSettings.mockRejectedValue(new Error("network error"));
    const { findByLabelText, getByPlaceholderText, findByText } = await render(<ProfileScreen {...baseProps()} />);

    await fireEvent.press(await findByLabelText("profile.editDisplayNameA11y"));
    await fireEvent.changeText(getByPlaceholderText("profile.displayName"), "Ada Lovelace");
    await fireEvent.press(await findByText("profile.saveDisplayName"));

    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith("profile.couldntSaveDisplayName"));
  });

  it("shows an 'Add' prompt when no date of birth is on file, and saves one once entered", async () => {
    mockGetSettings.mockResolvedValue({ content_safety: false, date_of_birth: null });
    mockUpdateSettings.mockResolvedValue({});
    const { findByText, findByLabelText, getByPlaceholderText } = await render(<ProfileScreen {...baseProps()} />);

    expect(await findByText("profile.dateOfBirthMissingDesc")).toBeTruthy();
    await fireEvent.press(await findByLabelText("profile.editDateOfBirthA11y"));

    await fireEvent.changeText(getByPlaceholderText("signup.dobMonthPlaceholder"), "3");
    await fireEvent.changeText(getByPlaceholderText("signup.dobDayPlaceholder"), "5");
    await fireEvent.changeText(getByPlaceholderText("signup.dobYearPlaceholder"), "1990");
    await fireEvent.press(await findByText("profile.saveDateOfBirth"));

    await waitFor(() => expect(mockUpdateSettings).toHaveBeenCalledWith({ date_of_birth: "1990-03-05" }));
    expect(mockShowToast).toHaveBeenCalledWith("profile.dateOfBirthSaved");
  });

  it("shows the existing date of birth (not the 'Add' prompt) when one is already on file", async () => {
    mockGetSettings.mockResolvedValue({ content_safety: false, date_of_birth: "1990-03-05" });
    const { findByText, queryByText } = await render(<ProfileScreen {...baseProps()} />);

    expect(await findByText("03/05/1990")).toBeTruthy();
    expect(queryByText("profile.add")).toBeNull();
  });

  it("shows a toast when saving the date of birth fails", async () => {
    mockGetSettings.mockResolvedValue({ content_safety: false, date_of_birth: null });
    mockUpdateSettings.mockRejectedValue(new Error("network error"));
    const { findByLabelText, findByText, getByPlaceholderText } = await render(<ProfileScreen {...baseProps()} />);

    await fireEvent.press(await findByLabelText("profile.editDateOfBirthA11y"));
    await fireEvent.changeText(getByPlaceholderText("signup.dobMonthPlaceholder"), "3");
    await fireEvent.changeText(getByPlaceholderText("signup.dobDayPlaceholder"), "5");
    await fireEvent.changeText(getByPlaceholderText("signup.dobYearPlaceholder"), "1990");
    await fireEvent.press(await findByText("profile.saveDateOfBirth"));

    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith("profile.couldntSaveDateOfBirth"));
  });

  it("requires two confirmations before actually deleting the account", async () => {
    mockDeleteAccount.mockResolvedValue(true);
    mockSignOut.mockResolvedValue(undefined);
    const props = baseProps();
    const { findByText } = await render(<ProfileScreen {...props} />);

    await fireEvent.press(await findByText("profile.deleteAccount"));

    // First alert: Cancel / Delete (destructive) -> triggers a SECOND alert
    const firstAlertButtons = (Alert.alert as jest.Mock).mock.calls[0][2];
    const firstDestructive = firstAlertButtons.find((b: any) => b.style === "destructive");
    await act(async () => {
      firstDestructive.onPress();
    });

    expect(mockDeleteAccount).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledTimes(2);

    // Second alert: the real confirmation.
    const secondAlertButtons = (Alert.alert as jest.Mock).mock.calls[1][2];
    const secondDestructive = secondAlertButtons.find((b: any) => b.style === "destructive");
    await act(async () => {
      await secondDestructive.onPress();
    });

    expect(mockDeleteAccount).toHaveBeenCalled();
    await waitFor(() => expect(props.onSignedOut).toHaveBeenCalled());
  });

  it("warns a premium user that deleting the account doesn't cancel their subscription", async () => {
    const { findByText } = await render(<ProfileScreen {...baseProps({ isPremium: true })} />);

    await fireEvent.press(await findByText("profile.deleteAccount"));

    expect((Alert.alert as jest.Mock).mock.calls[0][1]).toBe("profile.deleteAccountBodyPremium");
  });

  it("does not show the subscription warning to a free user", async () => {
    const { findByText } = await render(<ProfileScreen {...baseProps({ isPremium: false })} />);

    await fireEvent.press(await findByText("profile.deleteAccount"));

    expect((Alert.alert as jest.Mock).mock.calls[0][1]).toBe("profile.deleteAccountBody");
  });
});
