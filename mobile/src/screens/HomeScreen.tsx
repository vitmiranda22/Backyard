// Home screen — "Dawn Air" — immersive map: a full-bleed interactive map
// with floating glass-style controls on top (location pill, mood picker +
// start sheet) instead of a map-then-sheet stacked layout. Mood pins from
// nearby community routes live directly on the map.

import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView, Image } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MapView, { Marker, Circle } from "react-native-maps";
import RoutePolyline from "../components/RoutePolyline";
import {
  requestLocationPermission,
  getCurrentLocation,
  reverseGeocode,
} from "../services/location";
import { getNearbyRoutes, getTourDetail, NearbyRoute } from "../services/api";
import { colors, font, radius } from "../theme";
import { showToast } from "../services/toast";
import { tap } from "../services/haptics";

const MOODS = [
  { id: "time_machine", emoji: "🕰️", label: "Time Machine" },
  { id: "hidden_city", emoji: "🔮", label: "Hidden City" },
  { id: "dark_side", emoji: "🕵️", label: "Dark Side", pro: true },
  { id: "behind_scenes", emoji: "🎬", label: "Behind the Scenes", pro: true },
  { id: "unfiltered", emoji: "🎭", label: "Unfiltered", pro: true },
];

interface HomeScreenProps {
  onStartTour: () => void;
  onQuickStart: (mood: string) => void;
  onSelectRoute: (tourId: string) => void;
  isPremium: boolean;
  onRequirePremium: () => void;
}

export default function HomeScreen({
  onStartTour,
  onQuickStart,
  onSelectRoute,
  isPremium,
  onRequirePremium,
}: HomeScreenProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [hasPermission, setHasPermission] = useState(false);
  const [placeLabel, setPlaceLabel] = useState<string | null>(null);
  const [nearbyRoutes, setNearbyRoutes] = useState<NearbyRoute[]>([]);

  // The full walked path of whichever pin was last tapped, drawn directly
  // on this map. Fetched on demand (nearby-route pins only carry a single
  // point, not the full block-by-block path) rather than up front for
  // every pin, since most of them will never get tapped.
  const [selectedPath, setSelectedPath] = useState<{ latitude: number; longitude: number }[]>([]);
  const [selectedTourId, setSelectedTourId] = useState<string | null>(null);

  async function handlePinPress(route: NearbyRoute) {
    if (selectedTourId === route.tour_id) return;
    setSelectedTourId(route.tour_id);
    try {
      const detail = await getTourDetail(route.tour_id);
      // Prefer the actual walked GPS trace over the sparse per-narration
      // blocks — connecting those with straight lines can cut through
      // buildings whenever the street curves. Older tours recorded before
      // path persistence shipped fall back to the blocks-based path.
      setSelectedPath(
        detail.path.length > 1
          ? detail.path.map((p) => ({ latitude: p.lat, longitude: p.lng }))
          : detail.blocks.map((b) => ({ latitude: b.lat, longitude: b.lng }))
      );
    } catch (e: any) {
      console.warn("Failed to load route path:", e.message);
      setSelectedTourId(null);
    }
  }

  useEffect(() => {
    async function init() {
      const granted = await requestLocationPermission();
      setHasPermission(granted);
      if (granted) {
        try {
          const loc = await getCurrentLocation();
          setLocation(loc);
          const place = await reverseGeocode(loc.lat, loc.lng);
          if (place && (place.neighborhood || place.city)) {
            setPlaceLabel(
              [place.neighborhood, place.city].filter(Boolean).join(", ")
            );
          }
          // Most-voted nearby routes, shown as pins right on the home map.
          getNearbyRoutes(loc.lat, loc.lng, { sortBy: "rating", limit: 10 })
            .then(setNearbyRoutes)
            .catch((e) => {
              console.warn("Failed to load nearby routes:", e.message);
              showToast(t("home.couldntLoadRoutes"));
            });
        } catch (e) {
          console.error("Failed to get location:", e);
        }
      } else {
        Alert.alert(t("home.locationRequiredTitle"), t("home.locationRequiredBody"));
      }
    }
    init();
  }, []);

  return (
    <View style={styles.container}>
      {location ? (
        <MapView
          style={StyleSheet.absoluteFillObject}
          initialRegion={{
            latitude: location.lat,
            longitude: location.lng,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
          showsUserLocation
        >
          {/* "Low info" zone glow — Uber-surge-style warm tint under any
              pin whose starting zone came back thin the last time it was
              narrated (an automatic signal, not a user report). Rendered
              before the pins so it sits underneath them. Radius is half
              the ~150m geohash cell the signal is actually keyed to. */}
          {nearbyRoutes
            .filter((route) => route.is_low_info)
            .map((route) => (
              <Circle
                key={`${route.tour_id}-low-info`}
                center={{ latitude: route.lat, longitude: route.lng }}
                radius={75}
                fillColor="rgba(201, 146, 43, 0.22)"
                strokeColor="rgba(138, 94, 21, 0.55)"
                strokeWidth={1}
              />
            ))}

          {nearbyRoutes.map((route) => (
            <Marker
              key={route.tour_id}
              coordinate={{ latitude: route.lat, longitude: route.lng }}
              title={route.title}
              description={
                route.rating_count > 0
                  ? `★ ${route.avg_rating.toFixed(1)} (${route.rating_count})`
                  : t("home.notYetRated")
              }
              onPress={() => handlePinPress(route)}
              onCalloutPress={() => onSelectRoute(route.tour_id)}
              tracksViewChanges={false}
            >
              <View style={[styles.moodPin, route.is_low_info && styles.moodPinLowInfo]}>
                <Text style={styles.moodPinEmoji}>
                  {MOODS.find((m) => m.id === route.mood)?.emoji ?? "🗺️"}
                </Text>
                {route.is_low_info && (
                  <View style={styles.moodPinBadge}>
                    <Text style={styles.moodPinBadgeText}>!</Text>
                  </View>
                )}
              </View>
            </Marker>
          ))}

          {selectedPath.length > 1 && (
            <>
              <RoutePolyline coordinates={selectedPath} />
              <Marker coordinate={selectedPath[0]} pinColor={colors.accent} title={t("common.start")} />
              <Marker
                coordinate={selectedPath[selectedPath.length - 1]}
                pinColor={colors.danger}
                title={t("common.endOfRoute")}
              />
            </>
          )}
        </MapView>
      ) : (
        <View style={styles.mapPlaceholder}>
          <Text style={styles.placeholderText}>
            {hasPermission ? t("home.findingYou") : t("home.locationPermissionRequired")}
          </Text>
        </View>
      )}

      {/* Floating location pill */}
      <View style={[styles.locationPill, { top: insets.top + 12 }]}>
        <Image source={require("../../assets/icon.png")} style={styles.logoBadge} />
        <Text style={styles.locationPillText} numberOfLines={1}>
          {placeLabel || t("home.somewhereWorthExploring")}
        </Text>
      </View>

      {/* Floating start sheet */}
      <View style={styles.sheet}>
        <View style={styles.dragHandle} />
        <Text style={styles.sheetLabel}>{t("home.pickYourStory")}</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.moodRow}>
          {MOODS.map((mood) => (
            <TouchableOpacity
              key={mood.id}
              style={styles.moodChip}
              disabled={!location}
              onPress={() => {
                tap();
                mood.pro && !isPremium ? onRequirePremium() : onQuickStart(mood.id);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${t(`moods.${mood.id}.label`)}, ${mood.pro ? t("common.pro") : t("common.free")}`}
            >
              <Text style={styles.moodEmoji}>{mood.emoji}</Text>
              <Text style={styles.moodLabel}>{t(`moods.${mood.id}.label`)}</Text>
              {mood.pro && (
                <View style={styles.proBadge}>
                  <Text style={styles.proBadgeText}>{t("common.pro")}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>

        <TouchableOpacity
          style={[styles.startBtn, !location && styles.startBtnDisabled]}
          onPress={() => {
            tap();
            onStartTour();
          }}
          disabled={!location}
          accessibilityRole="button"
          accessibilityLabel={t("home.startWalkingTour")}
        >
          <Text style={styles.startBtnText}>{t("home.startWalkingTour")}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  mapPlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.surfaceAlt,
  },
  placeholderText: {
    color: colors.muted,
    fontSize: 15,
  },
  moodPin: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.pro,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  moodPinEmoji: {
    fontSize: 17,
  },
  moodPinLowInfo: {
    borderColor: colors.lowInfo,
    shadowColor: colors.lowInfo,
    shadowOpacity: 0.5,
    shadowRadius: 4,
  },
  moodPinBadge: {
    position: "absolute",
    top: -3,
    right: -3,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: colors.lowInfo,
    borderWidth: 1.5,
    borderColor: colors.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  moodPinBadgeText: {
    fontSize: 8,
    fontWeight: "800",
    color: "#fff",
  },
  locationPill: {
    position: "absolute",
    left: 16,
    maxWidth: "72%",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.92)",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  logoBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 8,
  },
  locationPillText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
    flexShrink: 1,
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: 20,
    paddingTop: 12,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -4 },
    elevation: 10,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: 14,
  },
  sheetLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 10,
  },
  startBtn: {
    backgroundColor: colors.accent,
    padding: 15,
    borderRadius: radius.md,
  },
  startBtnDisabled: {
    backgroundColor: colors.border,
  },
  startBtnText: {
    color: colors.accentText,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
  },
  moodRow: {
    marginBottom: 16,
  },
  moodChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 9,
    paddingHorizontal: 13,
    marginRight: 8,
  },
  moodEmoji: {
    fontSize: 15,
  },
  moodLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
  },
  proBadge: {
    backgroundColor: colors.pro,
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginLeft: 2,
  },
  proBadgeText: {
    color: colors.proText,
    fontSize: 9,
    fontWeight: "800",
  },
});
