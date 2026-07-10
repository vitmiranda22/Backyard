// Mode picker — choose your experience before starting a tour
//
// 2 free modes + 3 premium modes. Tapping a premium mode without an
// active subscription opens the paywall instead of starting a tour.

import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font, radius } from "../theme";
import { tap } from "../services/haptics";
import { getCurrentLocation } from "../services/location";
import { getRichness, RichnessInfo } from "../services/api";

const MODES = [
  {
    id: "time_machine",
    emoji: "🕰️",
    label: "Time Machine",
    desc: "Get transported to what this spot looked like decades ago",
    premium: false,
  },
  {
    id: "hidden_city",
    emoji: "🔮",
    label: "Hidden City",
    desc: "Secrets hiding in plain sight that everyone walks past",
    premium: false,
  },
  {
    id: "dark_side",
    emoji: "🕵️",
    label: "Dark Side",
    desc: "Unsolved mysteries, dark history, true crime energy",
    premium: true,
  },
  {
    id: "behind_scenes",
    emoji: "🎬",
    label: "Behind the Scenes",
    desc: "Celebrity secrets, film locations, the real stories",
    premium: true,
  },
  {
    id: "unfiltered",
    emoji: "🎭",
    label: "Unfiltered",
    desc: "Raw, funny, opinionated — like walking with a local friend",
    premium: true,
  },
];

interface MoodPickerProps {
  onSelect: (mood: string) => void;
  onCancel: () => void;
  isPremium: boolean;
  onRequirePremium: () => void;
}

export default function MoodPickerScreen({ onSelect, onCancel, isPremium, onRequirePremium }: MoodPickerProps) {
  const insets = useSafeAreaInsets();
  const [richness, setRichness] = useState<RichnessInfo | null>(null);

  useEffect(() => {
    getCurrentLocation()
      .then((loc) => getRichness(loc.lat, loc.lng))
      .then(setRichness)
      .catch(() => {
        // Silent — the richness caption is a nice-to-have, not worth a
        // toast or blocking mood selection if location isn't available yet.
      });
  }, []);

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.cancelBtn, { top: insets.top + 12 }]}
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel="Cancel"
      >
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Choose your experience</Text>
      <Text style={styles.subtitle}>Same streets. Completely different stories.</Text>
      {richness && richness.tier !== "full" && (
        <Text style={styles.richnessCaption}>{richness.message}</Text>
      )}

      {MODES.map((mode) => (
        <TouchableOpacity
          key={mode.id}
          style={styles.modeCard}
          onPress={() => {
            tap();
            mode.premium && !isPremium ? onRequirePremium() : onSelect(mode.id);
          }}
          accessibilityRole="button"
          accessibilityLabel={`${mode.label}, ${mode.premium ? "premium" : "free"}`}
        >
          <Text style={styles.emoji}>{mode.emoji}</Text>
          <View style={styles.modeInfo}>
            <View style={styles.labelRow}>
              <Text style={styles.modeLabel}>{mode.label}</Text>
              {mode.premium ? (
                <View style={styles.premiumBadge}>
                  <Text style={styles.premiumText}>PRO</Text>
                </View>
              ) : (
                <View style={styles.freeBadge}>
                  <Text style={styles.freeText}>FREE</Text>
                </View>
              )}
            </View>
            <Text style={styles.modeDesc}>{mode.desc}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: 20,
    paddingTop: 60,
    justifyContent: "center",
  },
  cancelBtn: {
    position: "absolute",
    left: 20,
    zIndex: 1,
  },
  cancelText: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: "600",
  },
  title: {
    fontFamily: font.display,
    fontSize: 26,
    color: colors.text,
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    marginBottom: 24,
  },
  richnessCaption: {
    fontSize: 12,
    color: colors.muted,
    textAlign: "center",
    marginTop: -14,
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  modeCard: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    borderRadius: radius.md,
    marginBottom: 10,
    alignItems: "center",
  },
  emoji: {
    fontSize: 30,
    marginRight: 14,
  },
  modeInfo: {
    flex: 1,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  modeLabel: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
  },
  premiumBadge: {
    backgroundColor: colors.pro,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  premiumText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.proText,
  },
  freeBadge: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  freeText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.muted,
  },
  modeDesc: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },
});
