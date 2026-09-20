// Route Rating screen — shown after finishing someone else's replayed route.
// Deliberately separate from TourCompleteScreen: this doesn't mutate
// anything on mount (no endTour call), and the UI is mostly disjoint
// (rating vs. share toggle) — they only share TourStatsGrid.

import React, { useState } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { rateTour, TourDetail } from "../services/api";
import StarRating from "../components/StarRating";
import TourStatsGrid from "../components/TourStatsGrid";
import { colors, font, radius, type, spacing } from "../theme";
import { showToast } from "../services/toast";
import { success } from "../services/haptics";

interface RouteRatingScreenProps {
  tour: TourDetail;
  onDone: () => void;
}

export default function RouteRatingScreen({ tour, onDone }: RouteRatingScreenProps) {
  const { t } = useTranslation();
  const [score, setScore] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const distanceKm = tour.total_distance_m ? (tour.total_distance_m / 1000).toFixed(1) : "0.0";
  const durationMin = tour.duration_sec ? Math.round(tour.duration_sec / 60) : 0;

  async function handleSubmit() {
    if (score === 0) return;
    setSubmitting(true);
    try {
      await rateTour(tour.tour_id, score);
      success();
    } catch (e: any) {
      console.warn("Failed to submit rating:", e.message);
      showToast(t("routeRating.couldntSubmit"));
    }
    setSubmitting(false);
    onDone();
  }

  return (
    <View style={styles.container}>
      <Image source={require("../../assets/icons/finish.png")} style={styles.finishIcon} resizeMode="contain" />
      <Text style={styles.title}>{t("routeRating.routeComplete")}</Text>
      <Text style={styles.tourTitle}>{tour.title}</Text>
      <Text style={styles.creator}>
        {t("routeDetail.by", {
          name: tour.is_anonymous ? t("routeDetail.anonymousExplorer") : tour.creator_display_name || t("routeDetail.anonymousExplorer"),
        })}
      </Text>

      <TourStatsGrid
        blocksVisited={tour.blocks_visited}
        distanceKm={distanceKm}
        durationMin={durationMin}
        mood={tour.mood}
      />

      <Text style={styles.rateLabel}>{t("routeRating.howWasThisRoute")}</Text>
      <StarRating value={score} onChange={setScore} size={36} />

      <TouchableOpacity
        style={[styles.submitBtn, score === 0 && styles.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={score === 0 || submitting}
        accessibilityRole="button"
        accessibilityLabel={t("routeRating.submitRatingA11y")}
      >
        <Text style={styles.submitBtnText}>{submitting ? t("routeRating.submitting") : t("routeRating.submitRating")}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={onDone} disabled={submitting} accessibilityRole="button" accessibilityLabel={t("routeRating.skipRatingA11y")}>
        <Text style={styles.skipLink}>{t("routeRating.skip")}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  finishIcon: {
    width: 56,
    height: 56,
    marginBottom: spacing.sm,
    tintColor: colors.ink,
  },
  title: {
    fontFamily: font.headingBold,
    fontSize: 32,
    lineHeight: 43,
    color: colors.ink,
    marginBottom: spacing.xs,
  },
  tourTitle: {
    fontFamily: font.headingBold,
    fontSize: 22,
    lineHeight: 29,
    color: colors.fieldGreen,
    marginTop: spacing.xs,
  },
  creator: {
    fontFamily: font.headingBold,
    fontSize: 17,
    lineHeight: 23,
    color: colors.fieldMuted,
    marginBottom: 20,
  },
  rateLabel: {
    fontFamily: font.headingBold,
    fontSize: 20,
    lineHeight: 26,
    color: colors.ink,
    marginBottom: 12,
  },
  submitBtn: {
    backgroundColor: colors.ink,
    paddingHorizontal: 40,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.lg,
    width: "100%",
  },
  submitBtnDisabled: {
    backgroundColor: colors.fieldBorder,
  },
  submitBtnText: {
    fontFamily: font.headingBold,
    color: colors.parchmentSurface,
    fontSize: 22,
    lineHeight: 29,
    textAlign: "center",
  },
  skipLink: {
    fontFamily: font.headingBold,
    color: colors.fieldMuted,
    fontSize: 17,
    lineHeight: 23,
    marginTop: spacing.md,
  },
});
