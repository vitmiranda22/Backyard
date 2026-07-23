// Badge gallery — every badge that exists, not just the ones you've
// earned. Locked ones are greyed out with what it takes to unlock them.

import React, { useEffect, useState } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { getUserStats } from "../services/api";
import { getAllBadges, BadgeStatus } from "../services/badges";
import { colors, font, radius } from "../theme";
import { showToast } from "../services/toast";

// Same celebrating pose as TourCompleteScreen's naming moment -- a hero
// band up top, not a full-screen bleed, since this screen is a scrollable
// list underneath.
const MASCOT_IMAGE = require("../../assets/bosco-celebrating.png");

interface BadgeGalleryScreenProps {
  onBack: () => void;
}

export default function BadgeGalleryScreen({ onBack }: BadgeGalleryScreenProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [badges, setBadges] = useState<BadgeStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getUserStats()
      .then((stats) => setBadges(getAllBadges(stats)))
      .catch((e: any) => {
        console.warn("Failed to load stats for badges:", e.message);
        showToast(t("badgeGallery.couldntLoad"));
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Image source={MASCOT_IMAGE} style={styles.heroBg} resizeMode="cover" accessibilityLabel={t("login.mascotA11y")} />
        <LinearGradient
          colors={["rgba(10,12,18,0)", "rgba(10,12,18,0.35)", "rgba(10,12,18,0.8)"]}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFill}
        />

        <TouchableOpacity
          style={[styles.backBtn, { top: Math.max(insets.top, 54) + 12 }]}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
        >
          <Text style={styles.backTextOnDark}>‹ {t("common.back")}</Text>
        </TouchableOpacity>

        <View style={styles.heroContent}>
          <Text style={styles.title}>{t("badgeGallery.title")}</Text>
          <Text style={styles.subtitle}>{t("badgeGallery.subtitle")}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {badges.map((badge) => (
          <View key={badge.id} style={[styles.card, !badge.earned && styles.cardLocked]}>
            <View style={[styles.emojiWrap, !badge.earned && styles.emojiWrapLocked]}>
              <Text style={[styles.emoji, !badge.earned && styles.emojiLocked]}>{badge.emoji}</Text>
            </View>
            <View style={styles.info}>
              <Text style={[styles.label, !badge.earned && styles.labelLocked]}>{t(`badges.${badge.id}.label`)}</Text>
              <Text style={styles.requirement}>
                {badge.earned ? t("badgeGallery.unlocked") : t(`badges.${badge.id}.requirement`)}
              </Text>
            </View>
            {!badge.earned && <Text style={styles.lock}>🔒</Text>}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.bg,
  },
  hero: {
    height: 260,
    overflow: "hidden",
  },
  heroBg: {
    ...StyleSheet.absoluteFillObject,
  },
  heroContent: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 20,
    paddingBottom: 22,
  },
  backBtn: {
    position: "absolute",
    left: 20,
    zIndex: 1,
  },
  backTextOnDark: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  title: {
    fontFamily: font.display,
    fontSize: 24,
    color: "#fff",
    textAlign: "center",
    marginBottom: 4,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  subtitle: {
    fontSize: 13,
    color: "rgba(255,255,255,0.85)",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  list: {
    padding: 20,
    paddingBottom: 40,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    borderRadius: radius.md,
    marginBottom: 10,
  },
  cardLocked: {
    backgroundColor: colors.surfaceAlt,
    opacity: 0.65,
  },
  emojiWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceAlt,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  emojiWrapLocked: {
    backgroundColor: colors.border,
  },
  emoji: {
    fontSize: 22,
  },
  emojiLocked: {
    opacity: 0.4,
  },
  info: {
    flex: 1,
  },
  label: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  labelLocked: {
    color: colors.muted,
  },
  requirement: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  lock: {
    fontSize: 16,
    marginLeft: 8,
  },
});
