// Route Rating screen — shown after finishing someone else's replayed route.
// Deliberately separate from TourCompleteScreen: this doesn't mutate
// anything on mount (no endTour call), and the UI is mostly disjoint
// (rating vs. share toggle) — they only share TourStatsGrid.

import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { rateTour, TourDetail } from "../services/api";
import StarRating from "../components/StarRating";
import TourStatsGrid from "../components/TourStatsGrid";
import { colors, font, radius } from "../theme";

interface RouteRatingScreenProps {
  tour: TourDetail;
  onDone: () => void;
}

export default function RouteRatingScreen({ tour, onDone }: RouteRatingScreenProps) {
  const [score, setScore] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const distanceKm = tour.total_distance_m ? (tour.total_distance_m / 1000).toFixed(1) : "0.0";
  const durationMin = tour.duration_sec ? Math.round(tour.duration_sec / 60) : 0;

  async function handleSubmit() {
    if (score === 0) return;
    setSubmitting(true);
    try {
      await rateTour(tour.tour_id, score);
    } catch (e: any) {
      console.warn("Failed to submit rating:", e.message);
    }
    setSubmitting(false);
    onDone();
  }

  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>🏁</Text>
      <Text style={styles.title}>Route Complete!</Text>
      <Text style={styles.tourTitle}>{tour.title}</Text>
      <Text style={styles.creator}>
        By {tour.is_anonymous ? "Anonymous Explorer" : tour.creator_display_name || "Anonymous Explorer"}
      </Text>

      <TourStatsGrid
        blocksVisited={tour.blocks_visited}
        distanceKm={distanceKm}
        durationMin={durationMin}
        mood={tour.mood}
      />

      <Text style={styles.rateLabel}>How was this route?</Text>
      <StarRating value={score} onChange={setScore} size={36} />

      <TouchableOpacity
        style={[styles.submitBtn, score === 0 && styles.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={score === 0 || submitting}
      >
        <Text style={styles.submitBtnText}>{submitting ? "Submitting..." : "Submit Rating"}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={onDone} disabled={submitting}>
        <Text style={styles.skipLink}>Skip</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  emoji: {
    fontSize: 56,
    marginBottom: 8,
  },
  title: {
    fontFamily: font.display,
    fontSize: 24,
    color: colors.text,
    marginBottom: 4,
  },
  tourTitle: {
    fontSize: 16,
    color: colors.accent,
    fontWeight: "600",
    marginTop: 4,
  },
  creator: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: 20,
  },
  rateLabel: {
    fontSize: 15,
    color: colors.text,
    fontWeight: "600",
    marginBottom: 12,
  },
  submitBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: radius.md,
    marginTop: 24,
    width: "100%",
  },
  submitBtnDisabled: {
    backgroundColor: colors.border,
  },
  submitBtnText: {
    color: colors.accentText,
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
  },
  skipLink: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 16,
  },
});
