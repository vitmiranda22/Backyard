// Paywall — shown when a free user taps a premium mood or voice.
//
// Purchases aren't wired up yet (needs a RevenueCat account + App Store/
// Play Console products, none of which exist yet), so the upgrade buttons
// are a stub for now. Swapping them for a real purchase call later doesn't
// require touching any caller of this screen.

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font, radius } from "../theme";

const PERKS = [
  { emoji: "🕵️", label: "3 extra moods — Dark Side, Behind the Scenes, Unfiltered" },
  { emoji: "🎙️", label: "Dramatic and Warm narration voices" },
  { emoji: "⚡", label: "A higher daily narration limit" },
];

interface PaywallScreenProps {
  onClose: () => void;
}

export default function PaywallScreen({ onClose }: PaywallScreenProps) {
  const insets = useSafeAreaInsets();

  function handleUpgrade(plan: string) {
    Alert.alert("Coming soon", "Payments aren't wired up yet — check back soon!");
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.closeBtn, { top: Math.max(insets.top, 54) + 12 }]}
        onPress={onClose}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityRole="button"
        accessibilityLabel="Close"
      >
        <Text style={styles.closeText}>✕</Text>
      </TouchableOpacity>

      <Text style={styles.emoji}>✨</Text>
      <Text style={styles.title}>Backyard Premium</Text>
      <Text style={styles.subtitle}>Unlock every mood and voice</Text>

      <View style={styles.perks}>
        {PERKS.map((perk) => (
          <View key={perk.label} style={styles.perkRow}>
            <Text style={styles.perkEmoji}>{perk.emoji}</Text>
            <Text style={styles.perkText}>{perk.label}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity
        style={styles.planBtn}
        onPress={() => handleUpgrade("monthly")}
        accessibilityRole="button"
        accessibilityLabel="Upgrade monthly, $4.99 per month"
      >
        <Text style={styles.planBtnText}>$4.99 / month</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.planBtnOutline}
        onPress={() => handleUpgrade("annual")}
        accessibilityRole="button"
        accessibilityLabel="Upgrade yearly, $39.99 per year, save 33%"
      >
        <Text style={styles.planBtnOutlineText}>$39.99 / year</Text>
        <Text style={styles.planBtnSub}>Save 33%</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Not now">
        <Text style={styles.notNow}>Not now</Text>
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
  notNow: {
    color: colors.muted,
    textAlign: "center",
    fontSize: 14,
  },
});
