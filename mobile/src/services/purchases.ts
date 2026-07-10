// In-app purchases (RevenueCat) — scaffolded, inactive until
// REVENUECAT_IOS_API_KEY / REVENUECAT_ANDROID_API_KEY are filled in (see
// src/config.ts). Every export here degrades gracefully to a no-op/null
// when purchases aren't configured, so PaywallScreen falls back to its
// static "Coming soon" UI without any extra guards at the call site.

import { Platform } from "react-native";
import Purchases, { PurchasesPackage, PurchasesError } from "react-native-purchases";
import {
  REVENUECAT_IOS_API_KEY,
  REVENUECAT_ANDROID_API_KEY,
  REVENUECAT_ENTITLEMENT_ID,
} from "../config";

let configured = false;

function platformApiKey(): string {
  return Platform.OS === "ios" ? REVENUECAT_IOS_API_KEY : REVENUECAT_ANDROID_API_KEY;
}

export function isPurchasesConfigured(): boolean {
  return !!platformApiKey();
}

export function initPurchases(userId: string) {
  const apiKey = platformApiKey();
  if (!apiKey || configured) return;
  Purchases.configure({ apiKey, appUserID: userId });
  configured = true;
}

// Returns the current offering's packages, or [] if purchases aren't
// configured, the offering isn't set up yet, or the fetch fails.
export async function getPackages(): Promise<PurchasesPackage[]> {
  if (!configured) return [];
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current?.availablePackages ?? [];
  } catch (e: any) {
    console.warn("Failed to load offerings:", e.message);
    return [];
  }
}

interface PurchaseOutcome {
  success: boolean;
  userCancelled: boolean;
  isPremium: boolean;
}

export async function purchasePackage(pkg: PurchasesPackage): Promise<PurchaseOutcome> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const isPremium = !!customerInfo.entitlements.active[REVENUECAT_ENTITLEMENT_ID];
    return { success: true, userCancelled: false, isPremium };
  } catch (e: any) {
    const err = e as PurchasesError;
    return { success: false, userCancelled: !!err.userCancelled, isPremium: false };
  }
}

export async function restorePurchases(): Promise<boolean> {
  if (!configured) return false;
  try {
    const customerInfo = await Purchases.restorePurchases();
    return !!customerInfo.entitlements.active[REVENUECAT_ENTITLEMENT_ID];
  } catch (e: any) {
    console.warn("Failed to restore purchases:", e.message);
    return false;
  }
}
