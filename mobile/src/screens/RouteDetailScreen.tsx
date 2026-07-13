// Route Detail screen — shown after tapping a Discover card, before replay.

import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Share } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import MapView, { Marker } from "react-native-maps";
import RoutePolyline from "../components/RoutePolyline";
import { getTourDetail, TourDetail, toggleLike } from "../services/api";
import StarRating from "../components/StarRating";
import ZonePhoto from "../components/ZonePhoto";
import CommentsSection from "../components/CommentsSection";
import { showToast } from "../services/toast";
import { tap } from "../services/haptics";
import { colors, font, radius } from "../theme";

const MOOD_EMOJI: Record<string, string> = {
  time_machine: "🕰️",
  hidden_city: "🔮",
  dark_side: "🕵️",
  behind_scenes: "🎬",
  unfiltered: "🎭",
};

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

  useEffect(() => {
    getTourDetail(tourId)
      .then((t) => {
        setTour(t);
        setLiked(t.liked_by_me);
        setLikeCount(t.like_count);
      })
      .catch((e: any) => setError(e.message || t("routeDetail.failedToLoad")));
  }, [tourId]);

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
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backBtnText}>{t("common.back")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!tour) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const distanceKm = tour.total_distance_m ? (tour.total_distance_m / 1000).toFixed(1) : null;
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

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 54) + 10 }]}>
        <TouchableOpacity onPress={onBack} accessibilityRole="button" accessibilityLabel={t("common.back")}>
          <Text style={styles.backLink}>‹ {t("common.back")}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleShare} accessibilityRole="button" accessibilityLabel={t("routeDetail.shareA11y")}>
          <Text style={styles.shareLink}>{t("tourComplete.share")}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.emoji}>{MOOD_EMOJI[tour.mood] ?? "🗺️"}</Text>
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
          <Text style={styles.likeBtnText}>{liked ? "❤️" : "🤍"} {likeCount}</Text>
        </TouchableOpacity>

        <View style={styles.statsRow}>
          <Text style={styles.statText}>📍 {t("routeDetail.stopsCount", { count: tour.blocks_visited })}</Text>
          {distanceKm && <Text style={styles.statText}>🚶 {distanceKm} km</Text>}
          {durationMin && <Text style={styles.statText}>⏱️ {durationMin} {t("routeDetail.minAbbr")}</Text>}
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
              <Marker coordinate={routeCoords[0]} pinColor={colors.accent} title={t("common.start")} />
              {routeCoords.length > 1 && (
                <Marker
                  coordinate={routeCoords[routeCoords.length - 1]}
                  pinColor={colors.pro}
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
            {tour.blocks.map((block) => (
              <View key={block.block_id} style={styles.logCard}>
                {block.image_url && (
                  <ZonePhoto uri={block.image_url} thumbnailStyle={styles.logImage} />
                )}
                <View style={styles.logCardBody}>
                  <Text style={styles.logStreet}>
                    📍 {block.street_name}
                    {block.neighborhood ? `, ${block.neighborhood}` : ""}
                  </Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  content: {
    padding: 20,
    alignItems: "center",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.bg,
    padding: 20,
  },
  backLink: {
    alignSelf: "flex-start",
    color: colors.accent,
    fontSize: 15,
    fontWeight: "600",
  },
  shareLink: {
    color: colors.pro,
    fontSize: 15,
    fontWeight: "600",
  },
  emoji: {
    fontSize: 48,
    marginBottom: 8,
  },
  title: {
    fontFamily: font.display,
    fontSize: 24,
    color: colors.text,
    textAlign: "center",
    marginBottom: 4,
  },
  creator: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: 12,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  ratingCount: {
    fontSize: 13,
    color: colors.muted,
  },
  likeBtn: {
    marginBottom: 16,
  },
  likeBtnText: {
    fontSize: 15,
    color: colors.text,
    fontWeight: "600",
  },
  statsRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 16,
  },
  statText: {
    fontSize: 14,
    color: colors.text,
  },
  mapPreview: {
    width: "100%",
    height: 180,
    borderRadius: radius.md,
    overflow: "hidden",
    marginBottom: 16,
  },
  map: {
    flex: 1,
  },
  warning: {
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
    paddingHorizontal: 10,
  },
  logSection: {
    width: "100%",
    marginTop: 24,
  },
  logHeader: {
    fontFamily: font.display,
    fontSize: 18,
    color: colors.text,
    marginBottom: 12,
    alignSelf: "flex-start",
  },
  logCard: {
    width: "100%",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: "hidden",
    marginBottom: 10,
  },
  logImage: {
    width: "100%",
    height: 120,
    backgroundColor: colors.surfaceAlt,
  },
  logCardBody: {
    padding: 14,
  },
  logStreet: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 6,
  },
  logText: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 19,
  },
  errorText: {
    color: colors.danger,
    fontSize: 15,
    textAlign: "center",
    marginBottom: 16,
  },
  backBtn: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  backBtnText: {
    color: colors.text,
    fontWeight: "600",
  },
  startBtn: {
    backgroundColor: colors.accent,
    padding: 16,
    margin: 20,
    borderRadius: radius.md,
  },
  startBtnText: {
    color: colors.accentText,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "bold",
  },
});
