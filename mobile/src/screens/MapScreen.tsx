// Map — full-bleed nearby-tours map. Extracted out of HomeScreen (which
// used to be this screen directly) so Home is free to be the journal-cover
// landing page instead of a map; reached from Home's "Map" FAB.

import React, { useState, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert, Image, AppState } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MapView, { Marker, Circle } from "react-native-maps";
import RoutePolyline from "../components/RoutePolyline";
import FogOverlay, { MapRegion } from "../components/FogOverlay";
import CitiesSheet from "../components/CitiesSheet";
import {
  requestLocationPermission,
  getCurrentLocation,
  watchPosition,
} from "../services/location";
import { getNearbyRoutes, getTourDetail, getExploredCells, getExploredCities, ExploredCity, NearbyRoute } from "../services/api";
import { reportIfNewCell } from "../services/exploration";
import { colors, font, radius, type } from "../theme";
import { showToast } from "../services/toast";
import { MOOD_ICONS, FALLBACK_MOOD_ICON } from "../services/moods";
import { FOG_MAX_ACCURACY_M } from "../config";

// No dedicated museum icon exists yet either -- reuse the same fallback
// tour icon rather than block shipping on new art.
const MUSEUM_ICON = FALLBACK_MOOD_ICON;

interface MapScreenProps {
  onSelectRoute: (tourId: string) => void;
  onSelectMuseumTour: (tourId: string) => void;
  onBack: () => void;
}

export default function MapScreen({ onSelectRoute, onSelectMuseumTour, onBack }: MapScreenProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [hasPermission, setHasPermission] = useState(false);
  const [nearbyRoutes, setNearbyRoutes] = useState<NearbyRoute[]>([]);
  const [museumTours, setMuseumTours] = useState<NearbyRoute[]>([]);

  // Terra Incognita fog-of-war: exploredCells drives both FogOverlay's
  // holes and reportIfNewCell's dedupe (kept in sync via the ref -- state
  // triggers the re-render FogOverlay needs, the ref is what the
  // watchPosition callback's closure actually reads/mutates).
  const [exploredCells, setExploredCells] = useState<Set<string>>(new Set());
  const exploredCellsRef = useRef<Set<string>>(new Set());
  const [region, setRegion] = useState<MapRegion | null>(null);
  const watchSubRef = useRef<{ remove: () => void } | null>(null);
  // Guards startFogTracking's own await: watchPosition's underlying
  // Location.watchPositionAsync isn't instant (real GPS/provider
  // cold-start), so if the screen unmounts (or the app backgrounds)
  // while that's still pending, the effect's cleanup runs before
  // watchSubRef.current is ever set -- stopFogTracking finds nothing to
  // remove, and the subscription that lands afterward is stored with
  // nothing left to ever clean it up, leaking a live GPS listener (and
  // its battery/network cost) for as long as the app process runs. Each
  // start attempt captures its own generation number and only commits
  // to watchSubRef if nothing superseded it while it was still starting.
  const trackingGenerationRef = useRef(0);

  // The full walked path of whichever pin was last tapped, drawn directly
  // on this map. Fetched on demand (nearby-route pins only carry a single
  // point, not the full block-by-block path) rather than up front for
  // every pin, since most of them will never get tapped.
  const [selectedPath, setSelectedPath] = useState<{ latitude: number; longitude: number }[]>([]);
  const [selectedTourId, setSelectedTourId] = useState<string | null>(null);

  // Cities sheet -- fetched on demand when opened, not on mount, since
  // most map visits won't open it and the data can't meaningfully change
  // within a single short map session anyway.
  const [citiesVisible, setCitiesVisible] = useState(false);
  const [cities, setCities] = useState<ExploredCity[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [citiesFailed, setCitiesFailed] = useState(false);

  async function openCities() {
    setCitiesVisible(true);
    setCitiesLoading(true);
    setCitiesFailed(false);
    try {
      const result = await getExploredCities();
      setCities(result.cities);
    } catch (e: any) {
      console.warn("Failed to load cities:", e.message);
      setCitiesFailed(true);
    } finally {
      setCitiesLoading(false);
    }
  }

  // Terra Incognita: continuous foreground-only GPS tracking, separate
  // from ActiveTourScreen's own -- this is what makes the fog clear while
  // just browsing the map, not only during an active tour. No-op if
  // already running.
  async function startFogTracking() {
    if (watchSubRef.current) return;
    const myGeneration = ++trackingGenerationRef.current;
    const sub = await watchPosition((lat, lng, accuracyM) => {
      // A degraded fix (common on a bus/car -- metal body and glass cause
      // more multipath, and higher speed gives the receiver less time to
      // settle) can land tens of meters off the true road, enough to
      // reveal a cell you were never actually in. Skip it entirely rather
      // than trusting every fix as ground truth; unknown accuracy (null
      // on some platforms) fails open, same as this app's other
      // GPS-plausibility checks (see explored.py's teleport check).
      if (accuracyM !== null && accuracyM > FOG_MAX_ACCURACY_M) return;
      const newHash = reportIfNewCell(lat, lng, exploredCellsRef.current);
      if (newHash) setExploredCells(new Set(exploredCellsRef.current));
    });
    if (trackingGenerationRef.current !== myGeneration) {
      // Superseded by a stop (unmount/background) -- or another start --
      // while this was still starting up. Don't store a subscription
      // nothing will ever track; just remove the listener it already
      // registered so it doesn't keep firing forever.
      sub.remove();
      return;
    }
    watchSubRef.current = sub;
  }

  function stopFogTracking() {
    trackingGenerationRef.current++;
    watchSubRef.current?.remove();
    watchSubRef.current = null;
  }

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
          setRegion({ latitude: loc.lat, longitude: loc.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 });

          // Terra Incognita: hydrate this user's whole fog-of-war history
          // once, so already-explored ground (including anything backfilled
          // from their own past tours) starts revealed rather than fogged.
          getExploredCells()
            .then(({ geo_hashes }) => {
              const seeded = new Set(geo_hashes);
              exploredCellsRef.current = seeded;
              setExploredCells(new Set(seeded));
            })
            .catch((e) => console.warn("Failed to load explored cells:", e.message));

          // Fetches more than the 10 walking pins actually shown, then
          // drops museum tours (fetched separately below) and slices back
          // to 10 -- otherwise a highly-rated museum tour occupying a slot
          // in this rating-sorted top-10 would silently shrink the number
          // of walking-tour pins on the map instead of just not appearing.
          getNearbyRoutes(loc.lat, loc.lng, { sortBy: "rating", limit: 20 })
            .then((routes) => setNearbyRoutes(routes.filter((r) => r.tour_type !== "museum").slice(0, 10)))
            .catch((e) => {
              console.warn("Failed to load nearby routes:", e.message);
              showToast(t("home.couldntLoadRoutes"));
            });
          // A dedicated call (not a client-side filter of nearbyRoutes
          // above) so museum pins always show regardless of how many
          // other highly-rated walking tours fill that call's own
          // limit:10.
          getNearbyRoutes(loc.lat, loc.lng, { tourType: "museum", sortBy: "rating", limit: 10 })
            .then(setMuseumTours)
            .catch((e) => console.warn("Failed to load nearby museum tours:", e.message));
        } catch (e) {
          console.error("Failed to get location:", e);
        }
      } else {
        Alert.alert(t("home.locationRequiredTitle"), t("home.locationRequiredBody"));
      }
    }
    init();
  }, []);

  // Terra Incognita: only ever tracks while this screen is mounted AND the
  // app is actually foregrounded on screen -- not "resting" backgrounded,
  // which is why this needs AppState rather than just the mount lifecycle
  // above. Gated on hasPermission so it never starts before the user has
  // actually granted location access.
  useEffect(() => {
    if (!hasPermission) return;

    if (AppState.currentState === "active") {
      startFogTracking();
    }

    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        startFogTracking();
      } else {
        stopFogTracking();
      }
    });

    return () => {
      sub.remove();
      stopFogTracking();
    };
  }, [hasPermission]);

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
          onRegionChangeComplete={setRegion}
          showsUserLocation
        >
          {/* Terra Incognita fog-of-war -- drawn first so it sits under
              every pin/circle below. Every pin the map ever receives is
              already something the backend has confirmed is discovered
              (see GET /routes/nearby's discovery filter), so this is only
              ever hiding the map itself, never an actual undiscovered pin. */}
          {region && <FogOverlay exploredGeoHashes={exploredCells} region={region} />}

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
              testID={`route-marker-${route.tour_id}`}
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
              <RoutePolyline coordinates={selectedPath} strokeWidth={5} innerStrokeWidth={2} />
              <Marker coordinate={selectedPath[0]} pinColor={colors.fieldGreen} title={t("common.start")} />
              <Marker
                coordinate={selectedPath[selectedPath.length - 1]}
                pinColor={colors.danger}
                title={t("common.endOfRoute")}
              />
            </>
          )}

          {/* Museum tours -- one fixed indoor point each, no zone circle
              (unlike events, a museum tour isn't a geographic area you
              walk into). Tapping goes straight to MuseumTourScreen, not
              RouteDetailScreen/Replay -- see onSelectMuseumTour. */}
          {museumTours.map((museum) => (
            <Marker
              key={museum.tour_id}
              testID={`museum-marker-${museum.tour_id}`}
              coordinate={{ latitude: museum.lat, longitude: museum.lng }}
              title={museum.title}
              description={t("home.museumTourCallout")}
              onCalloutPress={() => onSelectMuseumTour(museum.tour_id)}
              tracksViewChanges={false}
            >
              <View style={styles.museumPin}>
                <Image source={MUSEUM_ICON} style={styles.museumPinIcon} resizeMode="contain" />
              </View>
            </Marker>
          ))}
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

      <TouchableOpacity
        style={[styles.citiesBtn, { top: insets.top + 12 }]}
        onPress={openCities}
        accessibilityRole="button"
        accessibilityLabel={t("cities.openA11y")}
      >
        <Text style={styles.citiesBtnText}>🏙️ {t("cities.buttonLabel")}</Text>
      </TouchableOpacity>

      <CitiesSheet
        visible={citiesVisible}
        onClose={() => setCitiesVisible(false)}
        cities={cities}
        loading={citiesLoading}
        failed={citiesFailed}
      />
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
    fontFamily: font.heading,
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
  museumPin: {
    width: 36,
    height: 36,
    borderRadius: 20,
    backgroundColor: colors.fieldGreen,
    borderWidth: 2,
    borderColor: colors.parchmentSurface,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  museumPinIcon: {
    width: 18,
    height: 18,
    tintColor: colors.parchmentSurface,
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
    fontFamily: font.headingBold,
    fontSize: 17,
    lineHeight: 23,
    color: colors.ink,
  },
  citiesBtn: {
    position: "absolute",
    right: 16,
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
  citiesBtnText: {
    fontFamily: font.sansBold,
    fontSize: 13,
    color: colors.ink,
  },
});
