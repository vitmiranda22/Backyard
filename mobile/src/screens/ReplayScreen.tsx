// Replay screen — walk someone else's published route. Narration is never
// regenerated: as you approach each saved waypoint, the app plays back the
// ORIGINAL recorded audio for that block. Zero Gemini/TTS calls.

import React, { useState, useEffect, useRef, useMemo } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MapView, { Marker } from "react-native-maps";
import {
  watchPosition,
  watchHeading,
  getCurrentLocation,
  bearingBetween,
  distanceMeters,
} from "../services/location";
import { getTourDetail, TourDetail, TourBlockDetail } from "../services/api";
import { haversineDistanceMeters } from "../utils/geo";
import { REPLAY_PROXIMITY_M } from "../config";
import NarrationCard from "../components/NarrationCard";
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
  const insets = useSafeAreaInsets();
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

  // A different encouragement line each time the walker enters this
  // full-screen "walk this way" state, rather than always the same
  // sentence -- re-rolled per targetIndex (once per waypoint), not per
  // render, so it doesn't change every time the compass angle updates.
  const subtitleVariants = t("replay.keepWalkingSubtitles", { returnObjects: true });
  const subtitles: string[] = Array.isArray(subtitleVariants)
    ? subtitleVariants
    : [String(subtitleVariants)];
  const subtitle = useMemo(
    () => subtitles[Math.floor(Math.random() * subtitles.length)],
    [targetIndex] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const target = blocks[targetIndex];
  const targetBearing =
    target && location ? bearingBetween(location.lat, location.lng, target.lat, target.lng) : null;
  const relativeBearing = targetBearing !== null ? (targetBearing - heading + 360) % 360 : 0;
  const distanceToTarget =
    target && location ? distanceMeters(location.lat, location.lng, target.lat, target.lng) : 0;

  // Not close enough to the next waypoint yet (or no waypoint reached at
  // all) -- a full-screen "here's where to walk" takeover instead of a
  // small compass badge squeezed below the map, so it's unmistakable that
  // nothing else is happening until the walker actually gets there.
  if (!activeBlock && target) {
    return (
      <View style={styles.guidedContainer}>
        <TouchableOpacity
          style={[styles.guidedCancelBtn, { top: Math.max(insets.top, 20) }]}
          onPress={onExit}
          accessibilityRole="button"
          accessibilityLabel={t("replay.cancelA11y")}
        >
          <Text style={styles.guidedCancelText}>‹ {t("common.cancel")}</Text>
        </TouchableOpacity>

        <Text style={styles.guidedTitle} numberOfLines={2}>
          {tour.title}
        </Text>

        {isRefreshingAudio ? (
          <Text style={styles.guidedSubtitle}>{t("replay.refreshingAudio")}</Text>
        ) : targetBearing !== null ? (
          <>
            <View style={styles.compassOuterRing}>
              <View style={styles.compassInnerRing} />
              <Text style={[styles.compassCardinal, styles.compassN]}>N</Text>
              <Text style={[styles.compassCardinal, styles.compassE]}>E</Text>
              <Text style={[styles.compassCardinal, styles.compassS]}>S</Text>
              <Text style={[styles.compassCardinal, styles.compassW]}>W</Text>
              <View style={[styles.compassTick, styles.tickNE]} />
              <View style={[styles.compassTick, styles.tickSE]} />
              <View style={[styles.compassTick, styles.tickSW]} />
              <View style={[styles.compassTick, styles.tickNW]} />
              <View style={[styles.needleWrap, { transform: [{ rotate: `${relativeBearing}deg` }] }]}>
                <View style={styles.needleFront} />
                <View style={styles.needleBack} />
              </View>
              <View style={styles.compassPivot} />
            </View>

            <Text style={styles.guidedDistance}>{Math.round(distanceToTarget)}m</Text>
            <Text style={styles.guidedCaption}>{t("replay.towardStreet", { street: target.street_name })}</Text>
            <Text style={styles.guidedSubtitle}>{subtitle}</Text>
          </>
        ) : (
          <Text style={styles.guidedSubtitle}>{t("replay.gettingLocation")}</Text>
        )}
      </View>
    );
  }

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

      {activeBlock && (
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
    fontFamily: font.heading,
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
    fontFamily: font.headingBold,
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
    fontFamily: font.headingBold,
    color: colors.ink,
    fontSize: 17,
    lineHeight: 23,
  },
  title: {
    fontFamily: font.headingBold,
    color: colors.fieldMuted,
    fontSize: 15,
    lineHeight: 21,
    flex: 1,
    textAlign: "right",
    marginLeft: 12,
  },
  // --- Full-screen "walk this way" takeover, shown whenever the walker
  // hasn't reached the next waypoint yet -- see the early return above.
  guidedContainer: {
    flex: 1,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  guidedCancelBtn: {
    position: "absolute",
    left: spacing.lg,
  },
  guidedCancelText: {
    fontFamily: font.headingBold,
    color: colors.fieldMuted,
    fontSize: 18,
    lineHeight: 24,
  },
  guidedTitle: {
    fontFamily: font.headingBold,
    color: colors.ink,
    fontSize: 32,
    lineHeight: 40,
    textAlign: "center",
    marginBottom: spacing.xl,
  },
  compassOuterRing: {
    width: 240,
    height: 240,
    borderRadius: 120,
    borderWidth: 2,
    borderColor: colors.ink,
    // parchmentSurface (a near-white cream) read as flat and too bright --
    // parchmentBg is the same family but noticeably deeper/warmer, closer
    // to the reference mockup's aged, lower-contrast face.
    backgroundColor: colors.parchmentBg,
    alignItems: "center",
    justifyContent: "center",
  },
  compassInnerRing: {
    position: "absolute",
    width: 196,
    height: 196,
    borderRadius: 98,
    borderWidth: 2,
    borderColor: colors.fieldMuted,
  },
  compassCardinal: {
    position: "absolute",
    fontFamily: font.serif,
    fontSize: 15,
    color: colors.ink,
  },
  compassN: { top: 12, left: "50%", marginLeft: -6 },
  compassE: { right: 14, top: "50%", marginTop: -9 },
  compassS: { bottom: 12, left: "50%", marginLeft: -5 },
  compassW: { left: 14, top: "50%", marginTop: -9 },
  compassTick: {
    position: "absolute",
    width: 2,
    height: 12,
    backgroundColor: colors.fieldMuted,
  },
  tickNE: { top: 32, right: 46, transform: [{ rotate: "45deg" }] },
  tickSE: { bottom: 32, right: 46, transform: [{ rotate: "-45deg" }] },
  tickSW: { bottom: 32, left: 46, transform: [{ rotate: "45deg" }] },
  tickNW: { top: 32, left: 46, transform: [{ rotate: "-45deg" }] },
  needleWrap: {
    position: "absolute",
    width: 20,
    height: 150,
    alignItems: "center",
  },
  // Classic compass-needle silhouette: a longer, pointed front half in the
  // route-line accent color (pointing the direction to actually walk) and
  // a shorter, blunt ink-colored tail -- not one flat wedge.
  // A duller, darker brick-red than a bright saturated orange -- matches
  // the reference mockup's aged, muted needle instead of reading like a
  // fresh coat of paint.
  needleFront: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 70,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#8C3D22",
  },
  needleBack: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 50,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: colors.ink,
  },
  // A plain solid dot, matching the reference mockup -- no light halo ring
  // around it.
  compassPivot: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.fieldGreen,
  },
  guidedDistance: {
    fontFamily: font.headingBold,
    color: colors.ink,
    fontSize: 52,
    lineHeight: 62,
    marginTop: spacing.xl,
  },
  guidedCaption: {
    fontFamily: font.heading,
    color: colors.fieldMuted,
    fontSize: 17,
    lineHeight: 23,
    marginTop: 2,
  },
  guidedSubtitle: {
    fontFamily: font.serifItalic,
    color: colors.fieldMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
  },
});
