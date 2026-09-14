// Route Detail screen — shown after tapping a Discover card, before replay.

import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Share, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import MapView, { Marker } from "react-native-maps";
import RoutePolyline from "../components/RoutePolyline";
import { getTourDetail, TourDetail, toggleLike, reportTour, ReportReason } from "../services/api";
import StarRating from "../components/StarRating";
import ZonePhoto from "../components/ZonePhoto";
import CommentsSection from "../components/CommentsSection";
import EmptyState from "../components/EmptyState";
import { showToast } from "../services/toast";
import { tap } from "../services/haptics";
import { colors, font, radius, type, spacing } from "../theme";
import { MOOD_ICONS, FALLBACK_MOOD_ICON } from "../services/moods";

const LIKE_ICON = require("../../assets/icons/like.png");
const LOCATION_ICON = require("../../assets/icons/location.png");
const DISTANCE_ICON = require("../../assets/icons/distance.png");
const DURATION_ICON = require("../../assets/icons/duration.png");

interface RouteDetailScreenProps {
  tourId: string;
  onStartReplay: (tour: TourDetail) => void;
  onBack: () => void;
}

function regionForBlocks(blocks: { lat: number; lng: number }[]) {
  const lats = blocks.map((b) => b.lat);
  const lngs = blocks.map((b) => b.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    // Padded so the full path fits comfortably, with a floor so a
    // single-stop or very short route doesn't zoom in unusably close.
    latitudeDelta: Math.max(0.01, (maxLat - minLat) * 1.6),
    longitudeDelta: Math.max(0.01, (maxLng - minLng) * 1.6),
  };
}

export default function RouteDetailScreen({ tourId, onStartReplay, onBack }: RouteDetailScreenProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [tour, setTour] = useState<TourDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);

  const loadTour = useCallback(() => {
    setError(null);
    getTourDetail(tourId)
      .then((result) => {
        setTour(result);
        setLiked(result.liked_by_me);
        setLikeCount(result.like_count);
      })
      .catch((e: any) => setError(e.message || t("routeDetail.failedToLoad")));
  }, [tourId]);

  useEffect(() => {
    loadTour();
  }, [loadTour]);

  async function handleToggleLike() {
    tap();
    try {
      const result = await toggleLike(tourId);
      setLiked(result.liked);
      setLikeCount(result.like_count);
    } catch (e: any) {
      console.warn("Failed to toggle like:", e.message);
      showToast(t("routeDetail.couldntUpdateLike"));
    }
  }

  if (error) {
    return (
      <View style={styles.container}>
        <EmptyState
          emoji="🗺️"
          message={error}
          isError
          onRetry={loadTour}
          onSecondaryAction={onBack}
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

  const distanceKm = tour.total_distance_m != null ? (tour.total_distance_m / 1000).toFixed(1) : null;
  const durationMin = tour.duration_sec ? Math.round(tour.duration_sec / 60) : null;
  const hasAudio = tour.blocks.some((b) => b.audio_url);

  // Prefer the actual walked GPS trace — tour.blocks only has a point per
  // narration trigger (often 50-100m+ apart), so connecting those with
  // straight lines can cut through buildings whenever the street curves.
  // Older tours recorded before path persistence shipped fall back to blocks.
  const routeCoords =
    tour.path.length > 1
      ? tour.path.map((p) => ({ latitude: p.lat, longitude: p.lng }))
      : tour.blocks.map((b) => ({ latitude: b.lat, longitude: b.lng }));

  async function handleShare() {
    try {
      await Share.share({
        message: t("routeDetail.shareMessage", { title: tour!.title, tourId }),
      });
    } catch (e) {
      console.warn("Share failed:", e);
    }
  }

  async function submitReport(reason: ReportReason) {
    try {
      await reportTour(tourId, reason);
      showToast(t("report.submitted"));
    } catch (e: any) {
      console.warn("Failed to submit report:", e.message);
      showToast(t("report.couldntSubmit"));
    }
  }

  function handleReport() {
    Alert.alert(t("report.title"), t("report.body"), [
      { text: t("report.reasonInaccurate"), onPress: () => submitReport("inaccurate") },
      { text: t("report.reasonOffensive"), onPress: () => submitReport("offensive") },
      { text: t("report.reasonSpam"), onPress: () => submitReport("spam") },
      { text: t("report.reasonOther"), onPress: () => submitReport("other") },
      { text: t("common.cancel"), style: "cancel" },
    ]);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      // CommentsSection's TextInput lives at the very bottom of the
      // ScrollView below — without this, the keyboard just overlaps it
      // instead of the screen making room, since nothing here resizes
      // or shifts on its own when the keyboard opens.
      keyboardVerticalOffset={Math.max(insets.top, 54) + 10}
    >
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 54) + 10 }]}>
        <TouchableOpacity onPress={onBack} accessibilityRole="button" accessibilityLabel={t("common.back")}>
          <Text style={styles.backLink}>‹ {t("common.back")}</Text>
        </TouchableOpacity>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handleReport} accessibilityRole="button" accessibilityLabel={t("report.tourA11y")}>
            <Text style={styles.reportLink}>{t("report.tourLink")}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleShare} accessibilityRole="button" accessibilityLabel={t("routeDetail.shareA11y")}>
            <Text style={styles.shareLink}>{t("tourComplete.share")}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Image source={MOOD_ICONS[tour.mood] ?? FALLBACK_MOOD_ICON} style={styles.emoji} resizeMode="contain" />
        <Text style={styles.title}>{tour.title}</Text>
        <Text style={styles.creator}>
          {t("routeDetail.by", {
            name: tour.is_anonymous ? t("routeDetail.anonymousExplorer") : tour.creator_display_name || t("routeDetail.anonymousExplorer"),
          })}
        </Text>

        {tour.rating_count > 0 && (
          <View style={styles.ratingRow}>
            <StarRating value={tour.avg_rating} size={18} />
            <Text style={styles.ratingCount}>
              {tour.avg_rating.toFixed(1)} ({t("routeDetail.ratingCount", { count: tour.rating_count })})
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.likeBtn}
          onPress={handleToggleLike}
          accessibilityRole="button"
          accessibilityLabel={liked ? t("routeDetail.unlikeThisRoute") : t("routeDetail.likeThisRoute")}
        >
          <Image source={LIKE_ICON} style={[styles.likeIcon, liked && styles.likeIconActive]} resizeMode="contain" />
          <Text style={styles.likeBtnText}>{likeCount}</Text>
        </TouchableOpacity>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Image source={LOCATION_ICON} style={styles.statIcon} resizeMode="contain" />
            <Text style={styles.statText}>{t("routeDetail.stopsCount", { count: tour.blocks_visited })}</Text>
          </View>
          {distanceKm && (
            <View style={styles.statItem}>
              <Image source={DISTANCE_ICON} style={styles.statIcon} resizeMode="contain" />
              <Text style={styles.statText}>{distanceKm} km</Text>
            </View>
          )}
          {durationMin && (
            <View style={styles.statItem}>
              <Image source={DURATION_ICON} style={styles.statIcon} resizeMode="contain" />
              <Text style={styles.statText}>{durationMin} {t("routeDetail.minAbbr")}</Text>
            </View>
          )}
        </View>

        {routeCoords.length > 0 && (
          <View style={styles.mapPreview}>
            <MapView
              style={styles.map}
              initialRegion={regionForBlocks(
                routeCoords.map((c) => ({ lat: c.latitude, lng: c.longitude }))
              )}
              scrollEnabled={false}
              zoomEnabled={false}
              pointerEvents="none"
            >
              {routeCoords.length > 1 && <RoutePolyline coordinates={routeCoords} />}
              <Marker coordinate={routeCoords[0]} pinColor={colors.fieldGreen} title={t("common.start")} />
              {routeCoords.length > 1 && (
                <Marker
                  coordinate={routeCoords[routeCoords.length - 1]}
                  pinColor={colors.fieldMuted}
                  title={t("common.endOfRoute")}
                />
              )}
            </MapView>
          </View>
        )}

        {!hasAudio && (
          <Text style={styles.warning}>
            {t("routeDetail.audioUnavailable")}
          </Text>
        )}

        {tour.is_own_tour && tour.blocks.length > 0 && (
          <View style={styles.logSection}>
            <Text style={styles.logHeader}>{t("routeDetail.yourWalkLog")}</Text>
            {tour.blocks.map((block, i) => (
              <View key={block.block_id} style={styles.logCard}>
                {block.image_url && (
                  <View style={[styles.logPhotoFrame, i % 2 === 0 ? styles.logPhotoTiltLeft : styles.logPhotoTiltRight]}>
                    <ZonePhoto uri={block.image_url} thumbnailStyle={styles.logImage} />
                  </View>
                )}
                <View style={styles.logCardBody}>
                  <View style={styles.logStreetRow}>
                    <Image source={LOCATION_ICON} style={styles.logStreetIcon} resizeMode="contain" />
                    <Text style={styles.logStreet}>
                      {block.street_name}
                      {block.neighborhood ? `, ${block.neighborhood}` : ""}
                    </Text>
                  </View>
                  <Text style={styles.logText}>{block.narration_text}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <CommentsSection tourId={tourId} />
      </ScrollView>

      <TouchableOpacity style={styles.startBtn} onPress={() => onStartReplay(tour)}>
        <Text style={styles.startBtnText}>{t("routeDetail.startReplay")}</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: "transparent",
    borderBottomWidth: 1,
    borderBottomColor: colors.fieldBorder,
  },
  content: {
    padding: 20,
    alignItems: "center",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
    padding: 20,
  },
  backLink: {
    fontFamily: font.cursiveBold,
    alignSelf: "flex-start",
    color: colors.fieldMuted,
    fontSize: 20,
    lineHeight: 26,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  reportLink: {
    fontFamily: font.cursiveBold,
    color: colors.fieldMuted,
    fontSize: 17,
    lineHeight: 23,
  },
  shareLink: {
    fontFamily: font.cursiveBold,
    color: colors.fieldGreen,
    fontSize: 17,
    lineHeight: 23,
  },
  emoji: {
    width: 52,
    height: 52,
    tintColor: colors.ink,
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: font.cursiveBold,
    fontSize: 32,
    lineHeight: 43,
    color: colors.ink,
    textAlign: "center",
    marginBottom: spacing.xs,
  },
  creator: {
    fontFamily: font.cursiveBold,
    fontSize: 18,
    lineHeight: 25,
    color: colors.fieldMuted,
    marginBottom: 12,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  ratingCount: {
    fontFamily: font.cursive,
    fontSize: 14,
    lineHeight: 20,
    color: colors.fieldMuted,
  },
  likeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: spacing.md,
  },
  likeIcon: {
    width: 20,
    height: 20,
    tintColor: colors.fieldMuted,
  },
  likeIconActive: {
    tintColor: colors.danger,
  },
  likeBtnText: {
    fontFamily: font.cursiveBold,
    fontSize: 20,
    lineHeight: 26,
    color: colors.ink,
  },
  statsRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  statIcon: {
    width: 17,
    height: 17,
    tintColor: colors.ink,
  },
  statText: {
    fontFamily: font.cursiveBold,
    fontSize: 18,
    lineHeight: 25,
    color: colors.ink,
  },
  mapPreview: {
    width: "100%",
    height: 180,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.ink,
    overflow: "hidden",
    marginBottom: spacing.md,
  },
  map: {
    flex: 1,
  },
  warning: {
    fontFamily: font.serifItalic,
    fontSize: 14,
    color: colors.fieldMuted,
    textAlign: "center",
    paddingHorizontal: 10,
  },
  logSection: {
    width: "100%",
    marginTop: spacing.lg,
  },
  logHeader: {
    fontFamily: font.cursiveBold,
    fontSize: 26,
    lineHeight: 34,
    color: colors.ink,
    marginBottom: 12,
    alignSelf: "flex-start",
  },
  logCard: {
    width: "100%",
    flexDirection: "row",
    gap: 12,
    backgroundColor: colors.parchmentSurface,
    borderWidth: 1,
    borderColor: colors.fieldBorderSoft,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 10,
  },
  // Polaroid-style stamp -- small, white-bordered, slightly rotated --
  // matching the same treatment used for the cover photo on Tour Complete.
  logPhotoFrame: {
    width: 60,
    height: 52,
    borderRadius: 3,
    backgroundColor: colors.parchmentSurface,
    borderWidth: 3,
    borderColor: colors.parchmentSurface,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    overflow: "hidden",
  },
  logPhotoTiltLeft: {
    transform: [{ rotate: "-4deg" }],
  },
  logPhotoTiltRight: {
    transform: [{ rotate: "3deg" }],
  },
  logImage: {
    width: "100%",
    height: "100%",
    backgroundColor: colors.parchmentBg,
  },
  logCardBody: {
    flex: 1,
  },
  logStreetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 4,
  },
  logStreetIcon: {
    width: 15,
    height: 15,
    tintColor: colors.ink,
  },
  logStreet: {
    fontFamily: font.cursiveBold,
    fontSize: 17,
    lineHeight: 23,
    color: colors.ink,
    flexShrink: 1,
  },
  logText: {
    fontFamily: font.serifItalic,
    fontSize: 14,
    color: colors.fieldMuted,
    lineHeight: 21,
  },
  startBtn: {
    backgroundColor: colors.ink,
    padding: spacing.md,
    margin: 20,
    borderRadius: radius.md,
  },
  startBtnText: {
    fontFamily: font.cursiveBold,
    color: colors.parchmentSurface,
    textAlign: "center",
    fontSize: 23,
    lineHeight: 32,
  },
});
