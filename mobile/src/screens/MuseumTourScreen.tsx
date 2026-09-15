// Museum Tour screen — a fixed, pre-written tour of a museum's permanent
// collection, advanced by tapping Next/Previous only. Deliberately NOT
// GPS-triggered like ReplayScreen (GPS accuracy falls apart indoors) --
// this screen never imports the location service at all, and finishing a
// block's audio does nothing automatic (onAudioFinished is left unset),
// unlike ReplayScreen's auto-advance-on-finish.

import React, { useCallback, useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import NarrationCard from "../components/NarrationCard";
import EmptyState from "../components/EmptyState";
import { getTourDetail, TourDetail } from "../services/api";
import { colors, font, radius, spacing } from "../theme";

interface MuseumTourScreenProps {
  tourId: string;
  onExit: () => void;
}

export default function MuseumTourScreen({ tourId, onExit }: MuseumTourScreenProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [tour, setTour] = useState<TourDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const loadTour = useCallback(() => {
    setError(null);
    getTourDetail(tourId)
      .then(setTour)
      .catch((e: any) => setError(e.message || t("museumTour.failedToLoad")));
  }, [tourId]);

  useEffect(() => {
    loadTour();
  }, [loadTour]);

  if (error) {
    return (
      <View style={styles.container}>
        <EmptyState
          emoji="🖼️"
          message={error}
          isError
          onRetry={loadTour}
          onSecondaryAction={onExit}
          secondaryLabel={`‹ ${t("common.back")}`}
        />
      </View>
    );
  }

  if (!tour) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.ink} />
      </View>
    );
  }

  const block = tour.blocks[currentIndex];
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === tour.blocks.length - 1;

  function goToPrevious() {
    setCurrentIndex((i) => Math.max(0, i - 1));
  }

  function goToNext() {
    setCurrentIndex((i) => Math.min(tour!.blocks.length - 1, i + 1));
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 54) + 10 }]}>
        <TouchableOpacity onPress={onExit} accessibilityRole="button" accessibilityLabel={t("museumTour.exitA11y")}>
          <Text style={styles.backLink}>‹ {t("common.back")}</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{tour.title}</Text>
      </View>

      <View style={styles.content}>
        {block ? (
          <NarrationCard
            isLoading={false}
            error={null}
            streetName={block.street_name}
            narrationText={block.narration_text}
            audioUrl={block.audio_url}
            imageUrl={block.image_url}
            onSkip={goToNext}
          />
        ) : (
          <EmptyState emoji="🖼️" message={t("museumTour.failedToLoad")} isError onSecondaryAction={onExit} secondaryLabel={`‹ ${t("common.back")}`} />
        )}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.navBtn, isFirst && styles.navBtnDisabled]}
          onPress={goToPrevious}
          disabled={isFirst}
          accessibilityRole="button"
          accessibilityLabel={t("museumTour.previous")}
        >
          <Text style={[styles.navBtnText, isFirst && styles.navBtnTextDisabled]}>{t("museumTour.previous")}</Text>
        </TouchableOpacity>

        <Text style={styles.progressText}>
          {t("museumTour.progress", { current: currentIndex + 1, total: tour.blocks.length })}
        </Text>

        <TouchableOpacity
          style={[styles.navBtn, isLast && styles.navBtnDisabled]}
          onPress={goToNext}
          disabled={isLast}
          accessibilityRole="button"
          accessibilityLabel={t("museumTour.next")}
        >
          <Text style={[styles.navBtnText, isLast && styles.navBtnTextDisabled]}>{t("museumTour.next")}</Text>
        </TouchableOpacity>
      </View>
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.fieldBorder,
  },
  backLink: {
    fontFamily: font.cursiveBold,
    color: colors.fieldMuted,
    fontSize: 20,
    lineHeight: 26,
  },
  title: {
    flex: 1,
    fontFamily: font.cursiveBold,
    color: colors.ink,
    fontSize: 20,
    lineHeight: 26,
  },
  content: {
    flex: 1,
    justifyContent: "flex-end",
    padding: 20,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    gap: spacing.md,
  },
  navBtn: {
    backgroundColor: colors.ink,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: radius.md,
  },
  navBtnDisabled: {
    backgroundColor: colors.parchmentBg,
  },
  navBtnText: {
    fontFamily: font.cursiveBold,
    color: colors.parchmentSurface,
    fontSize: 18,
    lineHeight: 24,
  },
  navBtnTextDisabled: {
    color: colors.fieldMuted,
  },
  progressText: {
    fontFamily: font.cursiveBold,
    color: colors.fieldMuted,
    fontSize: 16,
    lineHeight: 22,
  },
});
