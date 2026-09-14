// Paywall — shown when a free user taps a premium mood or voice.
//
// Purchases go through RevenueCat (src/services/purchases.ts). Until
// REVENUECAT_IOS_API_KEY/REVENUECAT_ANDROID_API_KEY are filled in (see
// src/config.ts) and an offering is set up in the RevenueCat dashboard,
// getPackages() returns [] and this screen falls back to the same
// "Coming soon" stub it always showed — nothing breaks in the meantime.
//
// Visually the one deliberate break from the rest of the app's parchment
// "Field Guide" system — a deep green-and-gold "ticket" instead of an aged
// page, since this is the one screen that should feel like the special
// premium moment rather than another page in the journal.

import React, { useEffect, useState } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { PurchasesPackage, PACKAGE_TYPE } from "react-native-purchases";
import { colors, font, radius, type, spacing } from "../theme";
import { getPackages, purchasePackage, restorePurchases } from "../services/purchases";
import { track } from "../services/analytics";

// Same hosted pages linked from SignupScreen's privacy checkbox -- required
// here too per App Store Guideline 3.1.2: any screen offering an
// auto-renewable subscription must link both, not just the signup flow.
const PRIVACY_URL = "https://backyard-api.onrender.com/privacy";
const TERMS_URL = "https://backyard-api.onrender.com/terms";

const PERK_KEYS = [
  { icon: require("../../assets/icons/dark_side.png"), key: "paywall.perkMoods" },
  { icon: require("../../assets/icons/premium_voices.png"), key: "paywall.perkVoices" },
  { icon: require("../../assets/icons/higher_limit.png"), key: "paywall.perkLimit" },
  { icon: require("../../assets/icons/ask_question_paywall.png"), key: "paywall.perkQuestions" },
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

      <View style={styles.badge}>
        <Image source={require("../../assets/icons/sparkle.png")} style={styles.badgeIcon} resizeMode="contain" />
      </View>
      <Text style={styles.title}>{t("paywall.title")}</Text>
      <Text style={styles.subtitle}>{t("paywall.subtitle")}</Text>

      <View style={styles.perks}>
        {PERK_KEYS.map((perk) => (
          <View key={perk.key} style={styles.perkRow}>
            <Image source={perk.icon} style={styles.perkIcon} resizeMode="contain" />
            <Text style={styles.perkText}>{t(perk.key)}</Text>
          </View>
        ))}
      </View>

      {purchasing ? (
        <ActivityIndicator size="large" color={colors.paywallGold} style={{ marginBottom: 20 }} />
      ) : (
        <>
          <TouchableOpacity
            style={styles.planBtn}
            onPress={() => handleUpgrade(monthly, "monthly")}
            accessibilityRole="button"
            accessibilityLabel={t("paywall.upgradeMonthlyA11y", { price: monthly?.product.priceString ?? "$4.99" })}
          >
            <Text style={styles.planBtnLabel}>{t("paywall.planMonthly")}</Text>
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
            <Text style={styles.planBtnOutlineLabel}>{t("paywall.planAnnual")}</Text>
            <Text style={styles.planBtnOutlineText}>
              {annual?.product.priceString ?? "$39.99"} {t("paywall.perYear")}
            </Text>
            <Text style={styles.planBtnSub}>
              {t("paywall.save33", { price: annual?.product.pricePerMonthString ?? "$3.33" })}
            </Text>
          </TouchableOpacity>

          <Text style={styles.autoRenews}>{t("paywall.autoRenews")}</Text>
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

      <View style={styles.legalRow}>
        <Text style={styles.legalLink} onPress={() => Linking.openURL(TERMS_URL)}>
          {t("paywall.termsOfUse")}
        </Text>
        <Text style={styles.legalSeparator}>·</Text>
        <Text style={styles.legalLink} onPress={() => Linking.openURL(PRIVACY_URL)}>
          {t("paywall.privacyPolicy")}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paywallBg,
    padding: spacing.lg,
    paddingTop: 60,
    justifyContent: "center",
  },
  closeBtn: {
    position: "absolute",
    right: 20,
  },
  closeText: {
    color: "rgba(244,239,221,0.7)",
    fontSize: 22,
  },
  badge: {
    alignSelf: "center",
    width: 60,
    height: 60,
    borderRadius: 34,
    borderWidth: 1.5,
    borderColor: colors.paywallGold,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  badgeIcon: {
    width: 28,
    height: 28,
    tintColor: colors.paywallGold,
  },
  title: {
    fontFamily: font.serif,
    fontSize: 28,
    color: colors.paywallText,
    textAlign: "center",
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: font.serifItalic,
    fontSize: type.title,
    color: "rgba(244,239,221,0.78)",
    textAlign: "center",
    marginBottom: 28,
  },
  perks: {
    marginBottom: spacing.xl,
  },
  perkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 14,
  },
  perkIcon: {
    width: 23,
    height: 23,
    tintColor: colors.paywallGold,
  },
  perkText: {
    flex: 1,
    fontFamily: font.cursive,
    fontSize: type.label,
    color: colors.paywallText,
  },
  planBtn: {
    backgroundColor: colors.paywallGold,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: 12,
  },
  planBtnLabel: {
    fontFamily: font.sansBold,
    color: colors.ink,
    textAlign: "center",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    opacity: 0.75,
    marginBottom: 2,
  },
  planBtnText: {
    fontFamily: font.cursiveBold,
    color: colors.ink,
    textAlign: "center",
    fontSize: 22,
    lineHeight: 29,
  },
  planBtnOutline: {
    borderWidth: 1.3,
    borderColor: colors.paywallGold,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: 12,
  },
  planBtnOutlineLabel: {
    fontFamily: font.sansBold,
    color: colors.paywallGold,
    textAlign: "center",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  planBtnOutlineText: {
    fontFamily: font.cursiveBold,
    color: colors.paywallText,
    textAlign: "center",
    fontSize: 22,
    lineHeight: 29,
  },
  planBtnSub: {
    fontFamily: font.cursive,
    color: "rgba(244,239,221,0.7)",
    textAlign: "center",
    fontSize: type.caption,
    marginTop: 2,
  },
  autoRenews: {
    fontFamily: font.cursive,
    color: "rgba(244,239,221,0.55)",
    textAlign: "center",
    fontSize: 12,
    lineHeight: 16,
    marginBottom: spacing.sm,
  },
  restoreText: {
    fontFamily: font.cursiveBold,
    color: "rgba(244,239,221,0.75)",
    textAlign: "center",
    fontSize: 17,
    lineHeight: 23,
    marginBottom: 14,
  },
  notNow: {
    fontFamily: font.cursiveBold,
    color: "rgba(244,239,221,0.75)",
    textAlign: "center",
    fontSize: 17,
    lineHeight: 23,
  },
  legalRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  legalLink: {
    fontFamily: font.cursive,
    color: "rgba(244,239,221,0.5)",
    fontSize: type.caption,
    textDecorationLine: "underline",
  },
  legalSeparator: {
    color: "rgba(244,239,221,0.5)",
    fontSize: type.caption,
  },
});
