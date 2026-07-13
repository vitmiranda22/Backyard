// Paywall — shown when a free user taps a premium mood or voice.
//
// Purchases go through RevenueCat (src/services/purchases.ts). Until
// REVENUECAT_IOS_API_KEY/REVENUECAT_ANDROID_API_KEY are filled in (see
// src/config.ts) and an offering is set up in the RevenueCat dashboard,
// getPackages() returns [] and this screen falls back to the same
// "Coming soon" stub it always showed — nothing breaks in the meantime.

import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { PurchasesPackage, PACKAGE_TYPE } from "react-native-purchases";
import { colors, font, radius } from "../theme";
import { getPackages, purchasePackage, restorePurchases } from "../services/purchases";
import { track } from "../services/analytics";

const PERK_KEYS = [
  { emoji: "🕵️", key: "paywall.perkMoods" },
  { emoji: "🎙️", key: "paywall.perkVoices" },
  { emoji: "⚡", key: "paywall.perkLimit" },
  { emoji: "💬", key: "paywall.perkQuestions" },
];

interface PaywallScreenProps {
  onClose: () => void;
  onPurchased?: () => void;
}

export default function PaywallScreen({ onClose, onPurchased }: PaywallScreenProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [packages, setPackages] = useState<PurchasesPackage[] | null>(null);
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    track("paywall_viewed");
    getPackages().then(setPackages);
  }, []);

  async function handleUpgrade(pkg: PurchasesPackage | null, planLabel: string) {
    if (!pkg) {
      Alert.alert(t("paywall.comingSoonTitle"), t("paywall.comingSoonBody"));
      return;
    }
    track("upgrade_tapped", { plan: planLabel });
    setPurchasing(true);
    const result = await purchasePackage(pkg);
    setPurchasing(false);
    if (result.success && result.isPremium) {
      track("purchase_completed", { plan: planLabel });
      onPurchased?.();
      onClose();
    } else if (!result.userCancelled) {
      track("purchase_failed", { plan: planLabel });
      Alert.alert(t("paywall.purchaseFailedTitle"), t("paywall.purchaseFailedBody"));
    }
  }

  async function handleRestore() {
    setPurchasing(true);
    const restored = await restorePurchases();
    setPurchasing(false);
    if (restored) {
      onPurchased?.();
      onClose();
    } else {
      Alert.alert(t("paywall.nothingToRestoreTitle"), t("paywall.nothingToRestoreBody"));
    }
  }

  const monthly = packages?.find((p) => p.packageType === PACKAGE_TYPE.MONTHLY) ?? null;
  const annual = packages?.find((p) => p.packageType === PACKAGE_TYPE.ANNUAL) ?? null;
  const configured = !!packages && packages.length > 0;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.closeBtn, { top: Math.max(insets.top, 54) + 12 }]}
        onPress={onClose}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityRole="button"
        accessibilityLabel={t("common.cancel")}
      >
        <Text style={styles.closeText}>✕</Text>
      </TouchableOpacity>

      <Text style={styles.emoji}>✨</Text>
      <Text style={styles.title}>{t("paywall.title")}</Text>
      <Text style={styles.subtitle}>{t("paywall.subtitle")}</Text>

      <View style={styles.perks}>
        {PERK_KEYS.map((perk) => (
          <View key={perk.key} style={styles.perkRow}>
            <Text style={styles.perkEmoji}>{perk.emoji}</Text>
            <Text style={styles.perkText}>{t(perk.key)}</Text>
          </View>
        ))}
      </View>

      {purchasing ? (
        <ActivityIndicator size="large" color={colors.pro} style={{ marginBottom: 20 }} />
      ) : (
        <>
          <TouchableOpacity
            style={styles.planBtn}
            onPress={() => handleUpgrade(monthly, "monthly")}
            accessibilityRole="button"
            accessibilityLabel={t("paywall.upgradeMonthlyA11y", { price: monthly?.product.priceString ?? "$4.99" })}
          >
            <Text style={styles.planBtnText}>
              {monthly?.product.priceString ?? "$4.99"} {t("paywall.perMonth")}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.planBtnOutline}
            onPress={() => handleUpgrade(annual, "annual")}
            accessibilityRole="button"
            accessibilityLabel={t("paywall.upgradeYearlyA11y", { price: annual?.product.priceString ?? "$39.99" })}
          >
            <Text style={styles.planBtnOutlineText}>
              {annual?.product.priceString ?? "$39.99"} {t("paywall.perYear")}
            </Text>
            <Text style={styles.planBtnSub}>{t("paywall.save33")}</Text>
          </TouchableOpacity>
        </>
      )}

      {configured && (
        <TouchableOpacity
          onPress={handleRestore}
          disabled={purchasing}
          accessibilityRole="button"
          accessibilityLabel={t("paywall.restorePurchases")}
        >
          <Text style={styles.restoreText}>{t("paywall.restorePurchases")}</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel={t("paywall.notNow")}>
        <Text style={styles.notNow}>{t("paywall.notNow")}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: 24,
    paddingTop: 60,
    justifyContent: "center",
  },
  closeBtn: {
    position: "absolute",
    right: 20,
  },
  closeText: {
    color: colors.muted,
    fontSize: 20,
  },
  emoji: {
    fontSize: 44,
    textAlign: "center",
    marginBottom: 8,
  },
  title: {
    fontFamily: font.display,
    fontSize: 26,
    color: colors.text,
    textAlign: "center",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    marginBottom: 28,
  },
  perks: {
    marginBottom: 32,
  },
  perkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  perkEmoji: {
    fontSize: 20,
  },
  perkText: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
  },
  planBtn: {
    backgroundColor: colors.pro,
    padding: 16,
    borderRadius: radius.md,
    marginBottom: 12,
  },
  planBtnText: {
    color: colors.proText,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
  },
  planBtnOutline: {
    borderWidth: 1,
    borderColor: colors.pro,
    padding: 16,
    borderRadius: radius.md,
    marginBottom: 20,
  },
  planBtnOutlineText: {
    color: colors.pro,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
  },
  planBtnSub: {
    color: colors.muted,
    textAlign: "center",
    fontSize: 12,
    marginTop: 2,
  },
  restoreText: {
    color: colors.muted,
    textAlign: "center",
    fontSize: 13,
    marginBottom: 14,
  },
  notNow: {
    color: colors.muted,
    textAlign: "center",
    fontSize: 14,
  },
});
