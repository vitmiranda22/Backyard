// Shared stat-card grid — used by both TourCompleteScreen (your own tour)
// and RouteRatingScreen (replaying someone else's route).

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { colors, radius } from "../theme";

interface TourStatsGridProps {
  blocksVisited: number;
  distanceKm: string;
  durationMin: number;
  mood?: string;
}

export default function TourStatsGrid({ blocksVisited, distanceKm, durationMin, mood }: TourStatsGridProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.statsGrid}>
      <View style={styles.statCard}>
        <Text style={styles.statValue}>📍 {blocksVisited}</Text>
        <Text style={styles.statLabel}>{t("tourStats.blocksNarrated")}</Text>
      </View>
      <View style={styles.statCard}>
        <Text style={styles.statValue}>🚶 {distanceKm} km</Text>
        <Text style={styles.statLabel}>{t("tourStats.walked")}</Text>
      </View>
      <View style={styles.statCard}>
        <Text style={styles.statValue}>⏱️ {durationMin} {t("routeDetail.minAbbr")}</Text>
        <Text style={styles.statLabel}>{t("tourStats.duration")}</Text>
      </View>
      {mood ? (
        <View style={styles.statCard}>
          <Text style={styles.statValue}>🎭 {t(`moods.${mood}.label`)}</Text>
          <Text style={styles.statLabel}>{t("tourStats.mode")}</Text>
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
    marginBottom: 24,
  },
  statCard: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    borderRadius: radius.md,
    minWidth: 140,
    alignItems: "center",
  },
  statValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: colors.text,
  },
  statLabel: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 4,
  },
});
