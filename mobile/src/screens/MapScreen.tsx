// Map — full-bleed nearby-tours map. Extracted out of HomeScreen (which
// used to be this screen directly) so Home is free to be the journal-cover
// landing page instead of a map; reached from Home's "Map" FAB.

import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert, Image } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MapView, { Marker, Circle } from "react-native-maps";
import RoutePolyline from "../components/RoutePolyline";
import {
  requestLocationPermission,
  getCurrentLocation,
} from "../services/location";
import { getNearbyRoutes, getTourDetail, NearbyRoute } from "../services/api";
import { colors, font, radius, type } from "../theme";
import { showToast } from "../services/toast";
import { MOOD_ICONS, FALLBACK_MOOD_ICON } from "../services/moods";

interface MapScreenProps {
  onSelectRoute: (tourId: string) => void;
  onBack: () => void;
}

export default function MapScreen({ onSelectRoute, onBack }: MapScreenProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [hasPermission, setHasPermission] = useState(false);
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
                <Image
                  source={MOOD_ICONS[route.mood] ?? FALLBACK_MOOD_ICON}
                  style={styles.moodPinIcon}
                  resizeMode="contain"
                />
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
              <Marker coordinate={selectedPath[0]} pinColor={colors.fieldGreen} title={t("common.start")} />
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

      <TouchableOpacity
        style={[styles.backBtn, { top: insets.top + 12 }]}
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel={t("common.back")}
      >
        <Text style={styles.backBtnText}>‹ {t("common.back")}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent",
  },
  mapPlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.parchmentSurface,
  },
  placeholderText: {
    color: colors.fieldMuted,
    fontFamily: font.cursive,
    fontSize: 18,
    lineHeight: 25,
  },
  moodPin: {
    width: 39,
    height: 39,
    borderRadius: 22,
    backgroundColor: colors.parchmentSurface,
    borderWidth: 2,
    borderColor: colors.fieldGreen,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  moodPinIcon: {
    width: 20,
    height: 20,
    tintColor: colors.fieldGreen,
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
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.lowInfo,
    borderWidth: 1.5,
    borderColor: colors.parchmentSurface,
    justifyContent: "center",
    alignItems: "center",
  },
  moodPinBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#fff",
  },
  backBtn: {
    position: "absolute",
    left: 16,
    backgroundColor: "rgba(251,247,234,0.92)",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  backBtnText: {
    fontFamily: font.cursiveBold,
    fontSize: 17,
    lineHeight: 23,
    color: colors.ink,
  },
});
