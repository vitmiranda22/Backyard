// Home screen — "Dawn Air" — map-first: an interactive map showing nearby
// community routes (top-rated pins) front and center, with a compact sheet
// below for starting your own tour.

import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView } from "react-native";
import MapView, { Marker } from "react-native-maps";
import {
  requestLocationPermission,
  getCurrentLocation,
  reverseGeocode,
} from "../services/location";
import { getTours, getNearbyRoutes, TourSummary, NearbyRoute } from "../services/api";
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
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [hasPermission, setHasPermission] = useState(false);
  const [placeLabel, setPlaceLabel] = useState<string | null>(null);
  const [recentTour, setRecentTour] = useState<TourSummary | null>(null);
  const [toursLoaded, setToursLoaded] = useState(false);
  const [nearbyRoutes, setNearbyRoutes] = useState<NearbyRoute[]>([]);
  const [routesLoaded, setRoutesLoaded] = useState(false);

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
              showToast("Couldn't load nearby routes.");
            })
            .finally(() => setRoutesLoaded(true));
        } catch (e) {
          console.error("Failed to get location:", e);
        }
      } else {
        Alert.alert(
          "Location Required",
          "Backyard needs your location to tell stories about where you are. Please enable it in Settings."
        );
      }
    }
    init();

    getTours()
      .then((tours) => setRecentTour(tours[0] ?? null))
      .catch((e) => {
        console.warn("Failed to load recent tour:", e.message);
        showToast("Couldn't load your recent tour.");
      })
      .finally(() => setToursLoaded(true));
  }, []);

  function formatStats(tour: TourSummary) {
    const parts: string[] = [];
    if (tour.blocks_visited) parts.push(`${tour.blocks_visited} blocks`);
    if (tour.duration_sec) parts.push(`${Math.round(tour.duration_sec / 60)} min`);
    return parts.join(" · ");
  }

  return (
    <View style={styles.container}>
      <View style={styles.mapHero}>
        {location ? (
          <MapView
            style={styles.map}
            initialRegion={{
              latitude: location.lat,
              longitude: location.lng,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }}
            showsUserLocation
          >
            {nearbyRoutes.map((route) => (
              <Marker
                key={route.tour_id}
                coordinate={{ latitude: route.lat, longitude: route.lng }}
                pinColor={colors.pro}
                title={route.title}
                description={
                  route.rating_count > 0
                    ? `★ ${route.avg_rating.toFixed(1)} (${route.rating_count})`
                    : "Not yet rated"
                }
                onCalloutPress={() => onSelectRoute(route.tour_id)}
              />
            ))}
          </MapView>
        ) : (
          <View style={styles.mapPlaceholder}>
            <Text style={styles.placeholderText}>
              {hasPermission ? "Finding you..." : "Location permission required"}
            </Text>
          </View>
        )}
      </View>

      <ScrollView style={styles.sheet} contentContainerStyle={styles.sheetContent}>
        <Text style={styles.eyebrow}>You're standing on</Text>
        <Text style={styles.greeting}>{placeLabel || "Somewhere worth exploring"}</Text>

        <TouchableOpacity
          style={[styles.startBtn, !location && styles.startBtnDisabled]}
          onPress={() => {
            tap();
            onStartTour();
          }}
          disabled={!location}
          accessibilityRole="button"
          accessibilityLabel="Start walking tour"
        >
          <Text style={styles.startBtnText}>Start Walking Tour</Text>
        </TouchableOpacity>

        {routesLoaded && nearbyRoutes.length === 0 && (
          <Text style={styles.noRoutesText}>No routes nearby yet — be the first to share one!</Text>
        )}

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
              accessibilityLabel={`${mood.label}, ${mood.pro ? "premium" : "free"}`}
            >
              <Text style={styles.moodEmoji}>{mood.emoji}</Text>
              <Text style={styles.moodLabel}>{mood.label}</Text>
              {mood.pro && (
                <View style={styles.proBadge}>
                  <Text style={styles.proBadgeText}>PRO</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>

        {recentTour ? (
          <View style={styles.recentCard}>
            <View style={styles.recentIcon}>
              <Text>{MOODS.find((m) => m.id === recentTour.mood)?.emoji ?? "🗺️"}</Text>
            </View>
            <View style={styles.recentInfo}>
              <Text style={styles.recentTitle} numberOfLines={1}>
                {recentTour.title}
              </Text>
              <Text style={styles.recentMeta}>{formatStats(recentTour)}</Text>
            </View>
          </View>
        ) : (
          toursLoaded && (
            <View style={styles.emptyRecentCard}>
              <Text style={styles.emptyRecentText}>Your walks will show up here.</Text>
            </View>
          )
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  mapHero: {
    height: "65%",
  },
  map: {
    flex: 1,
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
  sheet: {
    flex: 1,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    marginTop: -18,
  },
  sheetContent: {
    padding: 20,
    paddingBottom: 32,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.muted,
  },
  greeting: {
    fontFamily: font.display,
    fontSize: 20,
    color: colors.text,
    marginTop: 4,
    marginBottom: 14,
  },
  startBtn: {
    backgroundColor: colors.accent,
    padding: 15,
    borderRadius: radius.md,
    marginBottom: 14,
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
    marginBottom: 14,
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
  recentCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
  },
  recentIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.accent,
    justifyContent: "center",
    alignItems: "center",
  },
  recentInfo: {
    flex: 1,
  },
  recentTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  recentMeta: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  noRoutesText: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 14,
  },
  emptyRecentCard: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
  },
  emptyRecentText: {
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
  },
});
