// Replay screen — walk someone else's published route. Narration is never
// regenerated: as you approach each saved waypoint, the app plays back the
// ORIGINAL recorded audio for that block. Zero Gemini/TTS calls.

import React, { useState, useEffect, useRef } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import MapView, { Marker } from "react-native-maps";
import {
  watchPosition,
  watchHeading,
  getCurrentLocation,
  bearingBetween,
  distanceMeters,
  compassLabel,
} from "../services/location";
import { getTourDetail, TourDetail, TourBlockDetail } from "../services/api";
import { haversineDistanceMeters } from "../utils/geo";
import { REPLAY_PROXIMITY_M } from "../config";
import NarrationCard from "../components/NarrationCard";
import WaypointCompass from "../components/WaypointCompass";
import { colors, font, radius, type, spacing } from "../theme";
import { showToast } from "../services/toast";

const LOCATION_ICON = require("../../assets/icons/location.png");

interface ReplayScreenProps {
  tour: TourDetail;
  onReplayComplete: (tourId: string) => void;
  onExit: () => void;
}

export default function ReplayScreen({ tour, onReplayComplete, onExit }: ReplayScreenProps) {
  const { t } = useTranslation();
  const [blocks, setBlocks] = useState<TourBlockDetail[]>(tour.blocks);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [heading, setHeading] = useState(0);
  const [targetIndex, setTargetIndex] = useState(0);
  const [activeBlock, setActiveBlock] = useState<TourBlockDetail | null>(null);
  const [isRefreshingAudio, setIsRefreshingAudio] = useState(false);

  const targetIndexRef = useRef(0);
  const activeBlockRef = useRef<TourBlockDetail | null>(null);
  const subscriptionRef = useRef<any>(null);
  const headingSubscriptionRef = useRef<any>(null);
  const blocksRef = useRef<TourBlockDetail[]>(tour.blocks);

  useEffect(() => {
    targetIndexRef.current = targetIndex;
  }, [targetIndex]);
  useEffect(() => {
    activeBlockRef.current = activeBlock;
  }, [activeBlock]);
  useEffect(() => {
    blocksRef.current = blocks;
  }, [blocks]);

  function checkProximity(lat: number, lng: number) {
    if (activeBlockRef.current) return; // already playing something
    const idx = targetIndexRef.current;
    const target = blocksRef.current[idx];
    if (!target) return;

    const dist = haversineDistanceMeters(lat, lng, target.lat, target.lng);
    if (dist <= REPLAY_PROXIMITY_M) {
      setActiveBlock(target);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const loc = await getCurrentLocation();
        if (cancelled) return;
        setLocation(loc);
        checkProximity(loc.lat, loc.lng);

        const sub = await watchPosition((lat, lng) => {
          setLocation({ lat, lng });
          checkProximity(lat, lng);
        });
        subscriptionRef.current = sub;

        const headingSub = await watchHeading(setHeading);
        headingSubscriptionRef.current = headingSub;
      } catch (e: any) {
        Alert.alert(t("common.error"), t("replay.failedToGetLocation", { error: e.message }));
      }
    }
    init();

    return () => {
      cancelled = true;
      if (subscriptionRef.current) subscriptionRef.current.remove();
      if (headingSubscriptionRef.current) headingSubscriptionRef.current.remove();
    };
  }, []);

  function advanceToNext() {
    setActiveBlock(null);
    const nextIndex = targetIndexRef.current + 1;
    setTargetIndex(nextIndex);

    if (nextIndex >= blocksRef.current.length) {
      if (subscriptionRef.current) subscriptionRef.current.remove();
      onReplayComplete(tour.tour_id);
      return;
    }

    // Don't wait for the next GPS tick — the next waypoint might already be
    // close (common when waypoints are near each other). checkProximity
    // reads activeBlockRef/targetIndexRef, which the useEffects above only
    // sync AFTER this render commits -- calling it synchronously here would
    // otherwise still see the stale (pre-advance) refs, making this early
    // check a no-op that always waits for the next real GPS tick instead.
    activeBlockRef.current = null;
    targetIndexRef.current = nextIndex;
    if (location) {
      checkProximity(location.lat, location.lng);
    }
  }

  async function handleAudioError() {
    // Signed URL likely expired mid-walk — refetch the tour for fresh URLs
    // and retry the current block. No AI/TTS cost, just a DB read + presign.
    setIsRefreshingAudio(true);
    try {
      const fresh = await getTourDetail(tour.tour_id);
      setBlocks(fresh.blocks);
      const refreshedTarget = fresh.blocks[targetIndexRef.current];
      setActiveBlock(refreshedTarget || null);
    } catch (e) {
      console.warn("Failed to refresh route audio:", e);
      showToast(t("replay.couldntRefreshAudio"));
    }
    setIsRefreshingAudio(false);
  }

  const target = blocks[targetIndex];
  const targetBearing =
    target && location ? bearingBetween(location.lat, location.lng, target.lat, target.lng) : null;
  const relativeBearing = targetBearing !== null ? (targetBearing - heading + 360) % 360 : 0;
  const distanceToTarget =
    target && location ? distanceMeters(location.lat, location.lng, target.lat, target.lng) : 0;

  return (
    <View style={styles.container}>
      <View style={styles.mapHero}>
        {location ? (
          <MapView
            style={styles.map}
            region={{
              latitude: location.lat,
              longitude: location.lng,
              latitudeDelta: 0.004,
              longitudeDelta: 0.004,
            }}
            showsUserLocation
          >
            {blocks.map((b, i) => (
              <Marker
                key={b.block_id}
                coordinate={{ latitude: b.lat, longitude: b.lng }}
                pinColor={i < targetIndex ? colors.fieldGreen : i === targetIndex ? colors.ink : colors.fieldMuted}
                title={b.street_name}
              />
            ))}
          </MapView>
        ) : (
          <View style={styles.mapPlaceholder}>
            <Text style={styles.placeholderText}>{t("replay.gettingLocation")}</Text>
          </View>
        )}
      </View>

      <View style={styles.statsBar}>
        <TouchableOpacity onPress={onExit} accessibilityRole="button" accessibilityLabel={t("replay.exitReplayA11y")}>
          <Text style={styles.exitLink}>‹ {t("replay.exit")}</Text>
        </TouchableOpacity>
        <View style={styles.statsTextRow}>
          <Image source={LOCATION_ICON} style={styles.statsIcon} resizeMode="contain" />
          <Text style={styles.statsText}>
            {t("replay.progress", { current: Math.min(targetIndex + 1, blocks.length), total: blocks.length })}
          </Text>
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {tour.title}
        </Text>
      </View>

      {activeBlock ? (
        <NarrationCard
          isLoading={false}
          error={null}
          streetName={activeBlock.street_name}
          narrationText={activeBlock.narration_text}
          audioUrl={activeBlock.audio_url}
          imageUrl={activeBlock.image_url}
          onAudioFinished={advanceToNext}
          onSkip={advanceToNext}
          onAudioError={handleAudioError}
        />
      ) : (
        target && (
          <View style={styles.guideCard}>
            {isRefreshingAudio ? (
              <Text style={styles.guideText}>{t("replay.refreshingAudio")}</Text>
            ) : targetBearing !== null ? (
              <>
                <WaypointCompass
                  bearingDeg={relativeBearing}
                  distanceLabel={`${Math.round(distanceToTarget)}m · ${compassLabel(targetBearing)}`}
                />
                <Text style={styles.guideText}>{t("replay.walkToward", { street: target.street_name })}</Text>
              </>
            ) : (
              <Text style={styles.guideText}>{t("replay.walkToward", { street: target.street_name })}</Text>
            )}
          </View>
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent",
  },
  mapHero: {
    height: "38%",
  },
  map: {
    flex: 1,
  },
  mapPlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.parchmentSurface,
  },
  placeholderText: {
    fontFamily: font.cursive,
    fontSize: 18,
    lineHeight: 25,
    color: colors.fieldMuted,
  },
  statsBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    gap: 12,
    backgroundColor: colors.parchmentSurface,
    borderBottomWidth: 1,
    borderBottomColor: colors.fieldBorder,
  },
  exitLink: {
    fontFamily: font.cursiveBold,
    color: colors.fieldGreen,
    fontSize: 17,
    lineHeight: 23,
  },
  statsTextRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  statsIcon: {
    width: 16,
    height: 16,
    tintColor: colors.ink,
  },
  statsText: {
    fontFamily: font.cursiveBold,
    color: colors.ink,
    fontSize: 17,
    lineHeight: 23,
  },
  title: {
    fontFamily: font.cursiveBold,
    color: colors.fieldMuted,
    fontSize: 15,
    lineHeight: 21,
    flex: 1,
    textAlign: "right",
    marginLeft: 12,
  },
  guideCard: {
    padding: spacing.md,
    alignItems: "center",
  },
  guideText: {
    fontFamily: font.cursiveBold,
    color: colors.fieldMuted,
    fontSize: 16,
    lineHeight: 22,
    textAlign: "center",
    marginTop: spacing.sm,
  },
});
