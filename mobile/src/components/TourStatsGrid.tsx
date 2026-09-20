// Shared stat-card grid — used by both TourCompleteScreen (your own tour)
// and RouteRatingScreen (replaying someone else's route).

import React from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { colors, font, radius, type, spacing } from "../theme";
import { MOOD_ICONS, FALLBACK_MOOD_ICON } from "../services/moods";

const LOCATION_ICON = require("../../assets/icons/location.png");
const DISTANCE_ICON = require("../../assets/icons/distance.png");
const DURATION_ICON = require("../../assets/icons/duration.png");

interface TourStatsGridProps {
  blocksVisited: number;
  distanceKm: string;
  durationMin: number;
  mood?: string;
  // TourCompleteScreen renders this over a dark full-bleed photo hero;
  // RouteRatingScreen renders it on a plain parchment background -- one
  // card treatment can't read well on both, so the caller says which.
  variant?: "dark" | "light";
}

export default function TourStatsGrid({ blocksVisited, distanceKm, durationMin, mood, variant = "light" }: TourStatsGridProps) {
  const { t } = useTranslation();
  const isDark = variant === "dark";
  const iconTint = isDark ? "#fff" : colors.ink;
  return (
    <View style={styles.statsGrid}>
      <View style={[styles.statCard, isDark ? styles.statCardDark : styles.statCardLight]}>
        <View style={styles.statValueRow}>
          <Image source={LOCATION_ICON} style={[styles.statIcon, { tintColor: iconTint }]} resizeMode="contain" />
          <Text style={[styles.statValue, isDark && styles.statValueDark]}>{blocksVisited}</Text>
        </View>
        <Text style={[styles.statLabel, isDark && styles.statLabelDark]}>{t("tourStats.blocksNarrated")}</Text>
      </View>
      <View style={[styles.statCard, isDark ? styles.statCardDark : styles.statCardLight]}>
        <View style={styles.statValueRow}>
          <Image source={DISTANCE_ICON} style={[styles.statIcon, { tintColor: iconTint }]} resizeMode="contain" />
          <Text style={[styles.statValue, isDark && styles.statValueDark]}>{distanceKm} km</Text>
        </View>
        <Text style={[styles.statLabel, isDark && styles.statLabelDark]}>{t("tourStats.walked")}</Text>
      </View>
      <View style={[styles.statCard, isDark ? styles.statCardDark : styles.statCardLight]}>
        <View style={styles.statValueRow}>
          <Image source={DURATION_ICON} style={[styles.statIcon, { tintColor: iconTint }]} resizeMode="contain" />
          <Text style={[styles.statValue, isDark && styles.statValueDark]}>{durationMin} {t("routeDetail.minAbbr")}</Text>
        </View>
        <Text style={[styles.statLabel, isDark && styles.statLabelDark]}>{t("tourStats.duration")}</Text>
      </View>
      {mood ? (
        <View style={[styles.statCard, isDark ? styles.statCardDark : styles.statCardLight]}>
          <View style={styles.statValueRow}>
            <Image
              source={MOOD_ICONS[mood] ?? FALLBACK_MOOD_ICON}
              style={[styles.statIcon, { tintColor: iconTint }]}
              resizeMode="contain"
            />
            <Text style={[styles.statValue, isDark && styles.statValueDark]}>{t(`moods.${mood}.label`)}</Text>
          </View>
          <Text style={[styles.statLabel, isDark && styles.statLabelDark]}>{t("tourStats.mode")}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 12,
    marginBottom: spacing.lg,
  },
  statCard: {
    borderWidth: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    minWidth: 140,
    alignItems: "center",
  },
  statCardLight: {
    backgroundColor: colors.parchmentSurface,
    borderColor: colors.fieldBorder,
  },
  statCardDark: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderColor: "rgba(255,255,255,0.22)",
  },
  statValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statIcon: {
    width: 20,
    height: 20,
  },
  statValue: {
    fontFamily: font.headingBold,
    fontSize: 21,
    lineHeight: 28,
    color: colors.ink,
  },
  statValueDark: {
    color: "#fff",
  },
  statLabel: {
    fontFamily: font.heading,
    fontSize: type.caption,
    color: colors.fieldMuted,
    marginTop: spacing.xs,
  },
  statLabelDark: {
    color: "rgba(255,255,255,0.75)",
  },
});
