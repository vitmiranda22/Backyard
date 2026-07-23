// Tours screen — "My Tours" (history) and "Discover" (nearby public routes).

import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { getTours, TourSummary, getNearbyRoutes, NearbyRoute } from "../services/api";
import { requestLocationPermission, getCurrentLocation } from "../services/location";
import StarRating from "../components/StarRating";
import { colors, font, radius } from "../theme";
import { showToast } from "../services/toast";
import { tap } from "../services/haptics";

// Bosco, shrugging/scanning the horizon -- reused for both "My Tours" and
// "Discover" empty states, since neither is a full standalone screen (the
// tab bar and nav stay visible underneath).
const MASCOT_IMAGE = require("../../assets/bosco-empty-state-square.png");

const MOOD_EMOJI: Record<string, string> = {
  time_machine: "🕰️",
  hidden_city: "🔮",
  dark_side: "🕵️",
  behind_scenes: "🎬",
  unfiltered: "🎭",
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatStats(t: TFunction, tour: TourSummary) {
  const parts: string[] = [];
  if (tour.blocks_visited) parts.push(t("tours.blocksCount", { count: tour.blocks_visited }));
  if (tour.duration_sec) parts.push(`${Math.round(tour.duration_sec / 60)} ${t("routeDetail.minAbbr")}`);
  if (tour.total_distance_m) parts.push(`${(tour.total_distance_m / 1000).toFixed(1)} km`);
  return parts.join(" · ");
}

function formatDistance(t: TFunction, distanceM: number) {
  const distance = distanceM < 1000 ? `${Math.round(distanceM)} m` : `${(distanceM / 1000).toFixed(1)} km`;
  return t("tours.distanceAway", { distance });
}

type Segment = "mine" | "discover";

export default function ToursScreen({ onSelectRoute }: { onSelectRoute: (tourId: string) => void }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [segment, setSegment] = useState<Segment>("mine");

  const [tours, setTours] = useState<TourSummary[] | null>(null);
  const [refreshingMine, setRefreshingMine] = useState(false);

  const [routes, setRoutes] = useState<NearbyRoute[] | null>(null);
  const [refreshingDiscover, setRefreshingDiscover] = useState(false);

  const loadMine = useCallback(async () => {
    try {
      const result = await getTours();
      setTours(result);
    } catch (e: any) {
      console.warn("Failed to load tours:", e.message);
      showToast(t("tours.couldntLoadTours"));
      setTours([]);
    }
  }, []);

  const loadDiscover = useCallback(async () => {
    try {
      const granted = await requestLocationPermission();
      if (!granted) {
        Alert.alert(t("tours.locationRequiredTitle"), t("tours.locationRequiredBody"));
        setRoutes([]);
        return;
      }
      const loc = await getCurrentLocation();
      const result = await getNearbyRoutes(loc.lat, loc.lng);
      setRoutes(result);
    } catch (e: any) {
      console.warn("Failed to load nearby routes:", e.message);
      showToast(t("home.couldntLoadRoutes"));
      setRoutes([]);
    }
  }, []);

  useEffect(() => {
    loadMine();
  }, [loadMine]);

  useEffect(() => {
    if (segment === "discover" && routes === null) {
      loadDiscover();
    }
  }, [segment, routes, loadDiscover]);

  async function onRefreshMine() {
    setRefreshingMine(true);
    await loadMine();
    setRefreshingMine(false);
  }

  async function onRefreshDiscover() {
    setRefreshingDiscover(true);
    await loadDiscover();
    setRefreshingDiscover(false);
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.header, { paddingTop: Math.max(insets.top, 54) + 12 }]}>{t("tours.header")}</Text>

      <View style={styles.segmentRow}>
        <TouchableOpacity
          style={[styles.segmentBtn, segment === "mine" && styles.segmentBtnActive]}
          onPress={() => {
            tap();
            setSegment("mine");
          }}
          accessibilityRole="tab"
          accessibilityState={{ selected: segment === "mine" }}
        >
          <Text style={[styles.segmentText, segment === "mine" && styles.segmentTextActive]}>{t("tours.myTours")}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segmentBtn, segment === "discover" && styles.segmentBtnActive]}
          onPress={() => {
            tap();
            setSegment("discover");
          }}
          accessibilityRole="tab"
          accessibilityState={{ selected: segment === "discover" }}
        >
          <Text style={[styles.segmentText, segment === "discover" && styles.segmentTextActive]}>{t("tours.discover")}</Text>
        </TouchableOpacity>
      </View>

      {segment === "mine" ? (
        tours === null ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        ) : (
          <FlatList
            data={tours}
            keyExtractor={(t) => t.tour_id}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshingMine} onRefresh={onRefreshMine} />}
            ListEmptyComponent={
              <View style={styles.centered}>
                <Image source={MASCOT_IMAGE} style={styles.emptyImage} accessibilityLabel={t("login.mascotA11y")} />
                <Text style={styles.emptyText}>{t("tours.noToursYet")}</Text>
              </View>
            }
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.card} onPress={() => onSelectRoute(item.tour_id)}>
                <View style={styles.icon}>
                  <Text style={styles.iconText}>{MOOD_EMOJI[item.mood] ?? "🗺️"}</Text>
                </View>
                <View style={styles.info}>
                  <Text style={styles.title} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.meta}>{formatStats(t, item) || t("tours.inProgress")}</Text>
                </View>
                <Text style={styles.date}>{formatDate(item.created_at)}</Text>
              </TouchableOpacity>
            )}
          />
        )
      ) : routes === null ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={routes}
          keyExtractor={(r) => r.tour_id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshingDiscover} onRefresh={onRefreshDiscover} />}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Image source={MASCOT_IMAGE} style={styles.emptyImage} accessibilityLabel={t("login.mascotA11y")} />
              <Text style={styles.emptyText}>{t("tours.noRoutesNearby")}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => onSelectRoute(item.tour_id)}>
              <View style={styles.icon}>
                <Text style={styles.iconText}>{MOOD_EMOJI[item.mood] ?? "🗺️"}</Text>
              </View>
              <View style={styles.info}>
                <Text style={styles.title} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.meta}>
                  {item.creator_display_name || t("routeDetail.anonymousExplorer")} · {formatDistance(t, item.distance_m)}
                </Text>
                {item.rating_count > 0 && (
                  <View style={styles.ratingRow}>
                    <StarRating value={item.avg_rating} size={12} />
                    <Text style={styles.ratingCount}>({item.rating_count})</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    fontFamily: font.display,
    fontSize: 24,
    color: colors.text,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  segmentRow: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginBottom: 14,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    padding: 3,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.pill,
    alignItems: "center",
  },
  segmentBtnActive: {
    backgroundColor: colors.surface,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
  },
  segmentTextActive: {
    color: colors.text,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    flexGrow: 1,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 60,
  },
  emptyImage: {
    width: 110,
    height: 110,
    borderRadius: 55,
    marginBottom: 14,
  },
  emptyText: {
    color: colors.muted,
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 30,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 10,
  },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surfaceAlt,
    justifyContent: "center",
    alignItems: "center",
  },
  iconText: {
    fontSize: 17,
  },
  info: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  meta: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  date: {
    fontSize: 12,
    color: colors.muted,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  ratingCount: {
    fontSize: 11,
    color: colors.muted,
  },
});
