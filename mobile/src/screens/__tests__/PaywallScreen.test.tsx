import React from "react";
import { Alert } from "react-native";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

jest.mock("react-native-purchases", () => ({
  PACKAGE_TYPE: { MONTHLY: "MONTHLY", ANNUAL: "ANNUAL" },
}));
jest.mock("../../services/purchases", () => ({
  getPackages: jest.fn(),
  purchasePackage: jest.fn(),
  restorePurchases: jest.fn(),
}));
jest.mock("../../services/analytics", () => ({ track: jest.fn() }));

import PaywallScreen from "../PaywallScreen";
import { getPackages, purchasePackage, restorePurchases } from "../../services/purchases";
import { track } from "../../services/analytics";

const mockGetPackages = getPackages as jest.Mock;
const mockPurchasePackage = purchasePackage as jest.Mock;
const mockRestorePurchases = restorePurchases as jest.Mock;
const mockTrack = track as jest.Mock;

function monthlyPkg() {
  return { packageType: "MONTHLY", product: { priceString: "$4.99" } };
}
function annualPkg() {
  return { packageType: "ANNUAL", product: { priceString: "$39.99" } };
}

describe("PaywallScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  it("tracks paywall_viewed on mount", async () => {
    mockGetPackages.mockResolvedValue([]);
    await render(<PaywallScreen onClose={jest.fn()} />);

    expect(mockTrack).toHaveBeenCalledWith("paywall_viewed");
  });

  it("shows the coming-soon alert instead of purchasing when RevenueCat isn't configured", async () => {
    mockGetPackages.mockResolvedValue([]);
    const { getByText } = await render(<PaywallScreen onClose={jest.fn()} />);

    await waitFor(() => expect(mockGetPackages).toHaveBeenCalled());
    await fireEvent.press(getByText("$4.99 paywall.perMonth"));

    expect(Alert.alert).toHaveBeenCalledWith("paywall.comingSoonTitle", "paywall.comingSoonBody");
    expect(mockPurchasePackage).not.toHaveBeenCalled();
  });

  it("does not show the Restore Purchases option when nothing is configured", async () => {
    mockGetPackages.mockResolvedValue([]);
    const { queryByText } = await render(<PaywallScreen onClose={jest.fn()} />);

    await waitFor(() => expect(mockGetPackages).toHaveBeenCalled());
    expect(queryByText("paywall.restorePurchases")).toBeNull();
  });

  it("purchases the monthly plan and calls onPurchased + onClose on success", async () => {
    mockGetPackages.mockResolvedValue([monthlyPkg(), annualPkg()]);
    mockPurchasePackage.mockResolvedValue({ success: true, isPremium: true });
    const onClose = jest.fn();
    const onPurchased = jest.fn();
    const { getByText } = await render(<PaywallScreen onClose={onClose} onPurchased={onPurchased} />);

    await waitFor(() => expect(mockGetPackages).toHaveBeenCalled());
    await fireEvent.press(getByText("$4.99 paywall.perMonth"));

    await waitFor(() => expect(onPurchased).toHaveBeenCalled());
    expect(mockPurchasePackage).toHaveBeenCalledWith(monthlyPkg());
    expect(mockTrack).toHaveBeenCalledWith("purchase_completed", { plan: "monthly" });
    expect(onClose).toHaveBeenCalled();
  });

  it("shows a failure alert and does not close when the purchase fails (not cancelled)", async () => {
    mockGetPackages.mockResolvedValue([monthlyPkg(), annualPkg()]);
    mockPurchasePackage.mockResolvedValue({ success: false, userCancelled: false });
    const onClose = jest.fn();
    const { getByText } = await render(<PaywallScreen onClose={onClose} />);

    await waitFor(() => expect(mockGetPackages).toHaveBeenCalled());
    await fireEvent.press(getByText("$39.99 paywall.perYear"));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("paywall.purchaseFailedTitle", "paywall.purchaseFailedBody"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not show a failure alert when the user simply cancelled", async () => {
    mockGetPackages.mockResolvedValue([monthlyPkg()]);
    mockPurchasePackage.mockResolvedValue({ success: false, userCancelled: true });
    const { getByText } = await render(<PaywallScreen onClose={jest.fn()} />);

    await waitFor(() => expect(mockGetPackages).toHaveBeenCalled());
    await fireEvent.press(getByText("$4.99 paywall.perMonth"));

    await waitFor(() => expect(mockPurchasePackage).toHaveBeenCalled());
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("restores purchases and closes on success", async () => {
    mockGetPackages.mockResolvedValue([monthlyPkg()]);
    mockRestorePurchases.mockResolvedValue(true);
    const onClose = jest.fn();
    const onPurchased = jest.fn();
    const { getByText } = await render(<PaywallScreen onClose={onClose} onPurchased={onPurchased} />);

    await waitFor(() => expect(mockGetPackages).toHaveBeenCalled());
    await fireEvent.press(getByText("paywall.restorePurchases"));

    await waitFor(() => expect(onPurchased).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });

  it("shows an alert when there's nothing to restore", async () => {
    mockGetPackages.mockResolvedValue([monthlyPkg()]);
    mockRestorePurchases.mockResolvedValue(false);
    const onClose = jest.fn();
    const { getByText } = await render(<PaywallScreen onClose={onClose} />);

    await waitFor(() => expect(mockGetPackages).toHaveBeenCalled());
    await fireEvent.press(getByText("paywall.restorePurchases"));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("paywall.nothingToRestoreTitle", "paywall.nothingToRestoreBody"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose without purchasing when Not Now is pressed", async () => {
    mockGetPackages.mockResolvedValue([]);
    const onClose = jest.fn();
    const { getByText } = await render(<PaywallScreen onClose={onClose} />);

    await fireEvent.press(getByText("paywall.notNow"));

    expect(onClose).toHaveBeenCalled();
    expect(mockPurchasePackage).not.toHaveBeenCalled();
  });
});
