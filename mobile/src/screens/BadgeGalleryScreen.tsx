// Badge gallery — every badge that exists, not just the ones you've
// earned. Locked ones are greyed out with what it takes to unlock them.

import React, { useEffect, useState } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { getUserStats } from "../services/api";
import { getAllBadges, BadgeStatus } from "../services/badges";
import { colors, font, radius, type, spacing } from "../theme";
import { showToast } from "../services/toast";
import BoscoHero from "../components/BoscoHero";

// Same celebrating pose as TourCompleteScreen's naming moment -- a hero
// band up top, not a full-screen bleed, since this screen is a scrollable
// list underneath.
const MASCOT_IMAGE = require("../../assets/bosco-celebrating.jpg");

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
        <ActivityIndicator size="large" color={colors.ink} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <BoscoHero
          image={MASCOT_IMAGE}
          imageAccessibilityLabel={t("login.mascotA11y")}
          imageTopOffset="-103%"
          imageHeightPercent="268%"
          scrimColors={["rgba(10,12,18,0)", "rgba(10,12,18,0.35)", "rgba(10,12,18,0.8)"]}
          scrimLocations={[0, 0.55, 1]}
        >
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
        </BoscoHero>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {badges.map((badge) => (
          <View key={badge.id} style={[styles.card, !badge.earned && styles.cardLocked]}>
            <View style={[styles.emojiWrap, !badge.earned && styles.emojiWrapLocked]}>
              {badge.icon ? (
                <Image
                  source={badge.icon}
                  style={[styles.iconImage, !badge.earned && styles.emojiLocked]}
                  resizeMode="contain"
                />
              ) : (
                <Text style={[styles.emoji, !badge.earned && styles.emojiLocked]}>{badge.emoji}</Text>
              )}
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
    backgroundColor: "transparent",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  hero: {
    height: 260,
    overflow: "hidden",
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
    fontFamily: font.cursiveBold,
    color: "#fff",
    fontSize: 18,
    lineHeight: 25,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  title: {
    fontFamily: font.cursiveBold,
    fontSize: 34,
    lineHeight: 47,
    color: "#fff",
    textAlign: "center",
    marginBottom: spacing.xs,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  subtitle: {
    fontFamily: font.serifItalic,
    fontSize: type.title,
    color: "rgba(255,255,255,0.88)",
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
    backgroundColor: colors.parchmentSurface,
    borderWidth: 1,
    borderColor: colors.fieldBorderSoft,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: 10,
  },
  cardLocked: {
    backgroundColor: colors.parchmentBg,
    opacity: 0.7,
  },
  emojiWrap: {
    width: 65,
    height: 65,
    borderRadius: 32,
    backgroundColor: colors.parchmentBg,
    borderWidth: 1.5,
    borderColor: colors.fieldGreen,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  emojiWrapLocked: {
    borderColor: colors.fieldBorder,
  },
  emoji: {
    fontSize: 23,
  },
  iconImage: {
    width: 50,
    height: 50,
  },
  emojiLocked: {
    opacity: 0.4,
  },
  info: {
    flex: 1,
  },
  label: {
    fontFamily: font.cursiveBold,
    fontSize: 21,
    lineHeight: 28,
    color: colors.ink,
  },
  labelLocked: {
    color: colors.fieldMuted,
  },
  requirement: {
    fontFamily: font.cursive,
    fontSize: type.caption,
    color: colors.fieldMuted,
    marginTop: 2,
  },
  lock: {
    fontSize: type.body,
    marginLeft: spacing.sm,
  },
});
