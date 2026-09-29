// Tours screen — "My Tours" (history) and "Discover" (nearby public routes).

import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  Image,
  FlatList,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  getTours, TourSummary, getNearbyRoutes, NearbyRoute,
  getExploredCities, ExploredCity, getExploredCountries, ExploredCountry,
} from "../services/api";
import { requestLocationPermission, getCurrentLocation } from "../services/location";
import StarRating from "../components/StarRating";
import EmptyState from "../components/EmptyState";
import CityRow from "../components/CityRow";
import { colors, font, radius, type, spacing } from "../theme";
import { showToast } from "../services/toast";
import { tap } from "../services/haptics";
import { MOOD_ICONS, FALLBACK_MOOD_ICON } from "../services/moods";

// Bosco, shrugging/scanning the horizon -- reused for both "My Tours" and
// "Discover" empty states, since neither is a full standalone screen (the
// tab bar and nav stay visible underneath).
const MASCOT_IMAGE = require("../../assets/bosco-empty-state-square.jpg");

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatStats(t: TFunction, tour: TourSummary) {
  const parts: string[] = [];
  if (tour.blocks_visited) parts.push(t("tours.blocksCount", { count: tour.blocks_visited }));
  if (tour.duration_sec) parts.push(`${Math.round(tour.duration_sec / 60)} ${t("routeDetail.minAbbr")}`);
  if (tour.total_distance_m != null) parts.push(`${(tour.total_distance_m / 1000).toFixed(1)} km`);
  return parts.join(" · ");
}

function formatDistance(t: TFunction, distanceM: number) {
  const distance = distanceM < 1000 ? `${Math.round(distanceM)} m` : `${(distanceM / 1000).toFixed(1)} km`;
  return t("tours.distanceAway", { distance });
}

type Segment = "mine" | "discover" | "places";

interface ToursScreenProps {
  onSelectRoute: (tourId: string) => void;
  onBack: () => void;
}

export default function ToursScreen({ onSelectRoute, onBack }: ToursScreenProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [segment, setSegment] = useState<Segment>("mine");

  const [tours, setTours] = useState<TourSummary[] | null>(null);
  const [refreshingMine, setRefreshingMine] = useState(false);
  const [mineFailed, setMineFailed] = useState(false);

  const [routes, setRoutes] = useState<NearbyRoute[] | null>(null);
  const [refreshingDiscover, setRefreshingDiscover] = useState(false);
  const [discoverFailed, setDiscoverFailed] = useState(false);

  const [cities, setCities] = useState<ExploredCity[] | null>(null);
  const [countries, setCountries] = useState<ExploredCountry[] | null>(null);
  const [refreshingPlaces, setRefreshingPlaces] = useState(false);
  const [placesFailed, setPlacesFailed] = useState(false);

  const loadMine = useCallback(async () => {
    try {
      const result = await getTours();
      setTours(result);
      setMineFailed(false);
    } catch (e: any) {
      console.warn("Failed to load tours:", e.message);
      showToast(t("tours.couldntLoadTours"));
      setTours([]);
      setMineFailed(true);
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
      setDiscoverFailed(false);
    } catch (e: any) {
      console.warn("Failed to load nearby routes:", e.message);
      showToast(t("home.couldntLoadRoutes"));
      setRoutes([]);
      setDiscoverFailed(true);
    }
  }, []);

  const loadPlaces = useCallback(async () => {
    try {
      const [citiesResult, countriesResult] = await Promise.all([getExploredCities(), getExploredCountries()]);
      setCities(citiesResult.cities);
      setCountries(countriesResult.countries);
      setPlacesFailed(false);
    } catch (e: any) {
      console.warn("Failed to load places:", e.message);
      showToast(t("cities.failedToLoad"));
      setCities([]);
      setCountries([]);
      setPlacesFailed(true);
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

  useEffect(() => {
    if (segment === "places" && cities === null) {
      loadPlaces();
    }
  }, [segment, cities, loadPlaces]);

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

  async function onRefreshPlaces() {
    setRefreshingPlaces(true);
    await loadPlaces();
    setRefreshingPlaces(false);
  }

  return (
    <View style={styles.container}>
      <View style={{ paddingTop: Math.max(insets.top, 54) + 12, paddingHorizontal: 20 }}>
        <TouchableOpacity onPress={onBack} accessibilityRole="button" accessibilityLabel={t("common.back")}>
          <Text style={styles.backArrow}>‹ {t("common.back")}</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.header}>{t("tours.header")}</Text>

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
        <TouchableOpacity
          style={[styles.segmentBtn, segment === "places" && styles.segmentBtnActive]}
          onPress={() => {
            tap();
            setSegment("places");
          }}
          accessibilityRole="tab"
          accessibilityState={{ selected: segment === "places" }}
        >
          <Text style={[styles.segmentText, segment === "places" && styles.segmentTextActive]}>{t("tours.places")}</Text>
        </TouchableOpacity>
      </View>

      {segment === "mine" ? (
        tours === null ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.ink} />
          </View>
        ) : (
          <FlatList
            data={tours}
            keyExtractor={(t) => t.tour_id}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshingMine} onRefresh={onRefreshMine} />}
            ListEmptyComponent={
              <EmptyState
                image={MASCOT_IMAGE}
                imageAccessibilityLabel={t("login.mascotA11y")}
                imageSize={110}
                message={mineFailed ? t("tours.couldntLoadTours") : t("tours.noToursYet")}
                isError={mineFailed}
                onRetry={mineFailed ? loadMine : undefined}
              />
            }
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.card} onPress={() => onSelectRoute(item.tour_id)}>
                <View style={styles.icon}>
                  <Image source={MOOD_ICONS[item.mood] ?? FALLBACK_MOOD_ICON} style={styles.iconText} resizeMode="contain" />
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
      ) : segment === "discover" ? (
        routes === null ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.ink} />
        </View>
      ) : (
        <FlatList
          data={routes}
          keyExtractor={(r) => r.tour_id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshingDiscover} onRefresh={onRefreshDiscover} />}
          ListEmptyComponent={
            <EmptyState
              image={MASCOT_IMAGE}
              imageAccessibilityLabel={t("login.mascotA11y")}
              imageSize={110}
              message={discoverFailed ? t("home.couldntLoadRoutes") : t("tours.noRoutesNearby")}
              isError={discoverFailed}
              onRetry={discoverFailed ? loadDiscover : undefined}
            />
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => onSelectRoute(item.tour_id)}>
              <View style={styles.icon}>
                <Image source={MOOD_ICONS[item.mood] ?? FALLBACK_MOOD_ICON} style={styles.iconText} resizeMode="contain" />
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
        )
      ) : cities === null ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.ink} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshingPlaces} onRefresh={onRefreshPlaces} />}
        >
          {(cities?.length ?? 0) === 0 && (countries?.length ?? 0) === 0 ? (
            <EmptyState
              image={MASCOT_IMAGE}
              imageAccessibilityLabel={t("login.mascotA11y")}
              imageSize={110}
              message={placesFailed ? t("cities.failedToLoad") : t("cities.empty")}
              isError={placesFailed}
              onRetry={placesFailed ? loadPlaces : undefined}
            />
          ) : (
            <>
              {cities && cities.length > 0 && (
                <View style={styles.placesSection}>
                  <Text style={styles.placesSectionHeading}>{t("cities.title")}</Text>
                  {cities.map((c) => (
                    <CityRow key={c.city} city={c} />
                  ))}
                </View>
              )}
              {countries && countries.length > 0 && (
                <View style={styles.placesSection}>
                  <Text style={styles.placesSectionHeading}>{t("tours.countriesHeading")}</Text>
                  {countries.map((c) => (
                    <View key={c.country} style={styles.countryRow}>
                      <Text style={styles.countryName}>{c.country}</Text>
                      <Text style={styles.countryCount}>
                        {t(c.count === 1 ? "cities.spot" : "cities.spots", { count: c.count })}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent",
  },
  backArrow: {
    fontFamily: font.headingBold,
    fontSize: 20,
    lineHeight: 26,
    color: colors.fieldMuted,
  },
  header: {
    fontFamily: font.headingBold,
    fontSize: 34,
    lineHeight: 47,
    color: colors.ink,
    textAlign: "center",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  segmentRow: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginBottom: 14,
    backgroundColor: colors.parchmentBg,
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    borderRadius: radius.pill,
    padding: 3,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    alignItems: "center",
  },
  segmentBtnActive: {
    backgroundColor: colors.parchmentSurface,
  },
  segmentText: {
    fontFamily: font.headingBold,
    fontSize: 17,
    lineHeight: 23,
    color: colors.fieldMuted,
  },
  segmentTextActive: {
    color: colors.ink,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: spacing.xl,
    flexGrow: 1,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 60,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.parchmentSurface,
    borderWidth: 1,
    borderColor: colors.fieldBorderSoft,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 10,
  },
  icon: {
    width: 41,
    height: 41,
    borderRadius: 20,
    backgroundColor: colors.parchmentBg,
    justifyContent: "center",
    alignItems: "center",
  },
  iconText: {
    width: 22,
    height: 22,
    tintColor: colors.ink,
  },
  // minWidth:0 overrides flex's default content-based minimum size -- without
  // it, a long title's intrinsic (unwrapped) width can win the layout pass
  // and push the fixed-size date sibling below out past the card's right
  // edge instead of letting the title itself truncate/wrap to make room.
  info: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: font.headingBold,
    fontSize: 21,
    lineHeight: 28,
    color: colors.ink,
  },
  meta: {
    fontFamily: font.heading,
    fontSize: type.caption,
    color: colors.fieldMuted,
    marginTop: 2,
  },
  date: {
    fontFamily: font.headingBold,
    fontSize: 16,
    lineHeight: 22,
    color: colors.fieldMuted,
    flexShrink: 0,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  ratingCount: {
    fontFamily: font.heading,
    fontSize: 12,
    lineHeight: 16,
    color: colors.fieldMuted,
  },
  placesSection: {
    marginBottom: spacing.lg,
  },
  placesSectionHeading: {
    fontFamily: font.headingBold,
    fontSize: 20,
    lineHeight: 26,
    color: colors.ink,
    marginBottom: spacing.xs,
  },
  countryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.fieldBorder,
  },
  countryName: {
    fontFamily: font.sansBold,
    fontSize: type.body,
    color: colors.ink,
  },
  countryCount: {
    fontFamily: font.sansBold,
    fontSize: type.label,
    color: colors.ink,
  },
});
