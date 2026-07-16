// Active Tour screen — THE main screen
//
// Fixes:
// - Uses ref for isLoading to prevent double triggers from GPS callbacks
// - Audio and text are always from the same narration response
// - Debounce on zone changes prevents rapid re-fires

import React, { useState, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, Pressable, StyleSheet, Alert, Animated, Easing, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import MapView from "react-native-maps";
import { Audio } from "expo-av";
import RoutePolyline from "../components/RoutePolyline";
import { useZoneTracker } from "../hooks/useZoneTracker";
import {
  watchPosition,
  watchHeading,
  getCurrentLocation,
  bearingBetween,
  distanceMeters,
  compassLabel,
  snapToRoad,
} from "../services/location";
import { narrateBlock, saveBlock, startTour, askQuestion } from "../services/api";
import { startRecording, stopRecording, cancelRecording } from "../services/recording";
import NarrationCard from "../components/NarrationCard";
import WaypointCompass from "../components/WaypointCompass";
import AudioPlayer from "../components/AudioPlayer";
import { colors, radius } from "../theme";
import { showToast } from "../services/toast";
import { tap } from "../services/haptics";
import { scheduleUnfinishedTourReminder, cancelReminder } from "../services/notifications";
import { cacheAudio } from "../services/audioCache";

// A tour auto-completes once it reaches this many blocks — must match
// backend/app/config.py's FREE_TOUR_BLOCK_LIMIT/PREMIUM_TOUR_BLOCK_LIMIT.
const FREE_MAX_BLOCKS = 5;
const PREMIUM_MAX_BLOCKS = 12;

// Rejects with `label` if `promise` hasn't settled within `ms` -- used to
// bound the guide-intro load/playback, which otherwise has no cap of its
// own and can hang silently on a weak signal.
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

interface ActiveTourProps {
  mood: string;
  voice: string;
  contentSafety: boolean;
  isPremium: boolean;
  onEndTour: (
    tourId: string,
    blocksVisited: number,
    startTime: number,
    path: { latitude: number; longitude: number }[]
  ) => void;
}

export default function ActiveTourScreen({
  mood,
  voice,
  contentSafety,
  isPremium,
  onEndTour,
}: ActiveTourProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const MAX_BLOCKS = isPremium ? PREMIUM_MAX_BLOCKS : FREE_MAX_BLOCKS;
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [heading, setHeading] = useState(0);
  const [tourId, setTourId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streetName, setStreetName] = useState<string | null>(null);
  const [narrationText, setNarrationText] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [blocksVisited, setBlocksVisited] = useState(0);
  const [path, setPath] = useState<{ latitude: number; longitude: number }[]>([]);

  // Where the currently-displayed block was triggered — the waypoint
  // compass points back at this as you keep walking.
  const [blockOrigin, setBlockOrigin] = useState<{ lat: number; lng: number } | null>(null);

  // Hold-to-ask voice question state.
  const [qaState, setQaState] = useState<"idle" | "recording" | "thinking">("idle");
  const [qaAnswer, setQaAnswer] = useState<{
    question: string;
    answerText: string;
    audioUrl: string | null;
  } | null>(null);

  const { checkZone, commitZone, reset: resetZones } = useZoneTracker();
  const sequenceRef = useRef(0);
  const startTimeRef = useRef(Date.now());
  const subscriptionRef = useRef<any>(null);
  const headingSubRef = useRef<any>(null);
  const tourIdRef = useRef<string | null>(null);
  const pathRef = useRef<{ latitude: number; longitude: number }[]>([]);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Use a ref for isLoading so GPS callbacks always see the current value
  const isLoadingRef = useRef(false);

  // True from the moment a block's audio starts until it actually finishes
  // playing (or the user skips) — separate from isLoadingRef, which only
  // covers the network fetch. Without this, a new zone crossing mid-walk
  // (zones are only ~19-38m, well under a full narration's playback time)
  // would silently overwrite the currently-playing narration.
  const hasActiveAudioRef = useRef(false);

  // Debounce — don't trigger more than once every 10 seconds
  const lastTriggerTime = useRef(0);

  // sequence -> locally cached file URI, populated once cacheAudio()
  // finishes downloading in the background. Deliberately NOT swapped into
  // the live `audioUrl` state on its own — doing that used to restart
  // playback from 0:00 partway through (a new AudioPlayer source always
  // reloads), which sounded like the same narration playing twice. Only
  // consulted as a fallback if playback actually errors out.
  const cachedAudioRef = useRef<Record<number, string>>({});

  // Keep tourIdRef/pathRef in sync — handleEndTour can be called from
  // inside the watchPosition callback, whose closure is captured once at
  // mount (subscribed inside the mount-only useEffect below) and never
  // refreshed. Without these, an auto-completion triggered by a GPS zone
  // crossing (not the manual End Tour button, whose onPress is rebound
  // every render) would read tourId/path as they were AT MOUNT — an empty
  // tour ID and a near-empty path — instead of their current values.
  useEffect(() => {
    tourIdRef.current = tourId;
  }, [tourId]);
  useEffect(() => {
    pathRef.current = path;
  }, [path]);

  // Pulse the ask button while recording.
  useEffect(() => {
    if (qaState === "recording") {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
    pulseAnim.setValue(1);
  }, [qaState]);

  // Start tour session on mount
  useEffect(() => {
    // Plays the guide's intro clip (dark_side/behind_scenes/unfiltered
    // only) and resolves once it finishes, so block 1's narration never
    // overlaps it. Resolves immediately (no-op) for moods without a
    // persona, or if playback fails -- never blocks tour start.
    //
    // Both the load and the playback wait are capped -- on a weak signal
    // (confirmed in the field: R2's signed URL and the audio file itself
    // are fine, this only reproduces on bad network), createAsync's
    // fetch can stall for a long time with nothing surfaced to the user,
    // and there was previously no bound on it at all. A silent, unbounded
    // hang here reads exactly like "no introduction, tour just started" --
    // which is what got reported. Timing out cleanly falls through to the
    // same no-op behavior a real load failure already had.
    async function playGuideIntro(audioUrl: string, guideName?: string | null) {
      if (guideName) showToast(t("activeTour.yourGuide", { name: guideName }));
      let sound: Audio.Sound | null = null;
      try {
        sound = await withTimeout(
          Audio.Sound.createAsync({ uri: audioUrl }, { shouldPlay: true }).then((r) => r.sound),
          8000,
          "guide intro load"
        );
        await withTimeout(
          new Promise<void>((resolve) => {
            sound!.setOnPlaybackStatusUpdate((status) => {
              if (status.isLoaded && status.didJustFinish) {
                resolve();
              }
            });
          }),
          15000,
          "guide intro playback"
        );
      } catch (e) {
        console.warn("Failed to play guide intro (continuing anyway):", e);
      }
      // Runs whether it finished normally or a timeout/error cut it short --
      // a sound that timed out mid-playback must still be stopped, or it
      // keeps playing in the background under block 1's own narration.
      sound?.unloadAsync().catch(() => {});
    }

    async function init() {
      try {
        const tour = await startTour(mood, voice, contentSafety);
        setTourId(tour.tour_id);
        tourIdRef.current = tour.tour_id;
        startTimeRef.current = Date.now();
        scheduleUnfinishedTourReminder(tour.tour_id);

        // GPS fix happens while the guide intro plays (if any), not
        // after -- block 1 only starts fetching once both are done.
        const [loc] = await Promise.all([
          getCurrentLocation(),
          tour.intro_audio_url ? playGuideIntro(tour.intro_audio_url, tour.guide_name) : Promise.resolve(),
        ]);
        setLocation(loc);
        setPath([{ latitude: loc.lat, longitude: loc.lng }]);
        triggerNarration(loc.lat, loc.lng, "auto");

        // Start watching position for zone changes
        const sub = await watchPosition((lat, lng) => {
          setLocation({ lat, lng });

          // Snapped separately, not awaited here -- zone-crossing/narration
          // logic below always uses the walker's real raw GPS position;
          // only the drawn trailing line gets the (best-effort, visual-only)
          // road-snapped point once it resolves.
          snapToRoad(lat, lng).then((snapped) => {
            setPath((prev) => [...prev, { latitude: snapped.lat, longitude: snapped.lng }]);
          });

          const { isNewZone, geoHash } = checkZone(lat, lng);
          if (!isNewZone) return;

          // Check loading ref (not state — state is stale in callbacks)
          if (isLoadingRef.current) return;

          // Don't interrupt a narration that's still being listened to.
          if (hasActiveAudioRef.current) return;

          // Debounce: at least 10 seconds between triggers
          const now = Date.now();
          if (now - lastTriggerTime.current < 10000) return;

          // Only now do we consider this zone "used up" — if we committed
          // it before these guards, a zone glimpsed while busy would never
          // get a real narration for the rest of the tour.
          commitZone(geoHash);
          triggerNarration(lat, lng, "auto");
        });
        subscriptionRef.current = sub;

        // Powers the waypoint compass — heading updates independently of
        // position, since you can turn in place without moving.
        const headingSub = await watchHeading((deg) => setHeading(deg));
        headingSubRef.current = headingSub;
      } catch (e: any) {
        Alert.alert(t("common.error"), t("activeTour.startFailed", { error: e.message }));
      }
    }
    init();

    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
      }
      if (headingSubRef.current) {
        headingSubRef.current.remove();
      }
      cancelRecording();
    };
  }, []);

  async function triggerNarration(lat: number, lng: number, triggerType: "auto" | "manual") {
    // Double-check we're not already loading
    if (isLoadingRef.current) return;

    // Tour already hit its block cap — don't let a GPS zone crossing fire
    // one more block while auto-completion is still in flight.
    if (sequenceRef.current >= MAX_BLOCKS) return;

    isLoadingRef.current = true;
    lastTriggerTime.current = Date.now();
    setIsLoading(true);
    setError(null);

    try {
      const result = await narrateBlock(
        lat,
        lng,
        mood,
        voice,
        contentSafety,
        triggerType,
        tourIdRef.current || undefined
      );

      // Set text and audio together — they always come from the same response
      setStreetName(result.street_name);
      setNarrationText(result.narration_text);
      setAudioUrl(result.audio_url);
      setImageUrl(result.image_url);
      setBlockOrigin({ lat, lng });

      // Only hold off future auto-triggers if there's actual audio to be
      // interrupted — a text-only block (audio generation failed) has
      // nothing playing, so there's no reason to block the next zone.
      hasActiveAudioRef.current = !!result.audio_url;

      sequenceRef.current += 1;
      setBlocksVisited(sequenceRef.current);
      const thisSequence = sequenceRef.current;

      // Cache this block's audio to disk once it's done loading, so a
      // signal drop mid-playback has something to fall back to (see
      // handleAudioError below). Not pre-caching future blocks — they
      // don't exist yet (live generation).
      if (result.audio_url) {
        cacheAudio(result.audio_url, `${tourIdRef.current || "notour"}-${thisSequence}`).then((localUri) => {
          if (localUri) {
            cachedAudioRef.current[thisSequence] = localUri;
          }
        });
      }

      // Save block to tour
      const currentTourId = tourIdRef.current;
      if (currentTourId) {
        try {
          await saveBlock({
            tour_id: currentTourId,
            sequence: sequenceRef.current,
            lat,
            lng,
            street_name: result.street_name,
            neighborhood: result.neighborhood,
            city: result.city,
            narration_text: result.narration_text,
            audio_r2_key: result.audio_r2_key || undefined,
            image_r2_key: result.image_r2_key || undefined,
            voice,
            mood,
            trigger_type: triggerType,
          });
        } catch (e) {
          console.warn("Failed to save block (tour continues):", e);
          showToast(t("activeTour.blockSaveError"));
        }
      }

      // Reached the tour's block cap. If there's no audio to let the
      // walker finish listening to first, complete right away — otherwise
      // NarrationCard's onAudioFinished handles it once playback ends.
      if (sequenceRef.current >= MAX_BLOCKS && !result.audio_url) {
        showToast(isPremium ? t("activeTour.autoCompletePremium") : t("activeTour.autoCompleteFree"));
        handleEndTour();
      }
    } catch (e: any) {
      setError(t("activeTour.narrationError"));
      console.error("Narration failed:", e.message);
    }

    isLoadingRef.current = false;
    setIsLoading(false);
  }

  // Playback failed (e.g. the remote stream dropped mid-narration) — retry
  // once from the locally cached copy, if one's ready yet.
  function handleAudioError() {
    const cached = cachedAudioRef.current[sequenceRef.current];
    if (cached) {
      setAudioUrl(cached);
    }
  }

  async function handleAskPressIn() {
    if (qaState !== "idle") return;
    if (!isPremium) {
      tap();
      Alert.alert(t("activeTour.premiumFeatureTitle"), t("activeTour.premiumFeatureBody"));
      return;
    }
    tap();
    const started = await startRecording();
    if (started) {
      setQaState("recording");
    }
  }

  async function handleAskPressOut() {
    if (qaState !== "recording") return;
    setQaState("thinking");
    const uri = await stopRecording();
    if (!uri || !location) {
      setQaState("idle");
      return;
    }
    try {
      const result = await askQuestion(
        uri,
        location.lat,
        location.lng,
        mood,
        voice,
        tourIdRef.current || undefined
      );
      setQaAnswer({
        question: result.question_text,
        answerText: result.answer_text,
        audioUrl: result.audio_url,
      });
    } catch (e: any) {
      console.warn("Failed to get an answer:", e.message);
      showToast(t("activeTour.answerError"));
    }
    setQaState("idle");
  }

  function handleEndTour() {
    tap();
    if (subscriptionRef.current) {
      subscriptionRef.current.remove();
    }
    if (headingSubRef.current) {
      headingSubRef.current.remove();
    }
    // Refs, not state — this can be called from inside the watchPosition
    // callback's stale mount-time closure (see the tourIdRef/pathRef sync
    // effects above), where the state variables would still read their
    // values from the very first render.
    const currentTourId = tourIdRef.current;
    if (currentTourId) cancelReminder(currentTourId);
    resetZones();
    onEndTour(currentTourId || "", sequenceRef.current, startTimeRef.current, pathRef.current);
  }

  const targetBearing =
    blockOrigin && location
      ? bearingBetween(location.lat, location.lng, blockOrigin.lat, blockOrigin.lng)
      : null;
  const relativeBearing = targetBearing !== null ? (targetBearing - heading + 360) % 360 : 0;
  const distanceToBlock =
    blockOrigin && location ? distanceMeters(location.lat, location.lng, blockOrigin.lat, blockOrigin.lng) : 0;

  const askCaption =
    qaState === "recording"
      ? t("activeTour.listening")
      : qaState === "thinking"
      ? t("activeTour.thinking")
      : isPremium
      ? t("activeTour.holdToAsk")
      : t("activeTour.askPremium");

  return (
    <View style={styles.container}>
      {/* Map */}
      <View style={styles.mapWrap}>
        {location ? (
          <MapView
            style={styles.map}
            region={{
              latitude: location.lat,
              longitude: location.lng,
              latitudeDelta: 0.003,
              longitudeDelta: 0.003,
            }}
            showsUserLocation
          >
            {path.length > 1 && <RoutePolyline coordinates={path} />}
          </MapView>
        ) : (
          <View style={styles.mapPlaceholder}>
            <Text style={styles.placeholderText}>{t("activeTour.gettingLocation")}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.endLink, { top: Math.max(insets.top, 54) + 10 }]}
          onPress={handleEndTour}
          accessibilityRole="button"
          accessibilityLabel={t("activeTour.endTourA11y")}
        >
          <Text style={styles.endLinkText}>{t("home.end")}</Text>
        </TouchableOpacity>

        {blockOrigin && targetBearing !== null && (
          <View style={[styles.compassOverlay, { top: Math.max(insets.top, 54) + 48 }]}>
            <WaypointCompass
              bearingDeg={relativeBearing}
              distanceLabel={`${Math.round(distanceToBlock)}m · ${compassLabel(targetBearing)}`}
            />
          </View>
        )}
      </View>

      {/* Blocks counter */}
      <View style={styles.statsBar}>
        <Text style={styles.statsText}>📍 {t("activeTour.blocksCount", { count: blocksVisited })}</Text>
        <Text style={styles.moodBadge}>{t(`moods.${mood}.label`)}</Text>
      </View>

      {/* Narration card */}
      <NarrationCard
        isLoading={isLoading}
        error={error}
        streetName={streetName}
        narrationText={narrationText}
        audioUrl={audioUrl}
        imageUrl={imageUrl}
        onAudioFinished={() => {
          hasActiveAudioRef.current = false;
          if (sequenceRef.current >= MAX_BLOCKS) {
            showToast(isPremium ? t("activeTour.autoCompletePremium") : t("activeTour.autoCompleteFree"));
            handleEndTour();
          }
        }}
        onAudioError={handleAudioError}
        onSkip={() => {
          hasActiveAudioRef.current = false;
          setNarrationText(null);
          setAudioUrl(null);
          setImageUrl(null);
          setStreetName(null);
        }}
      />

      {qaAnswer && (
        <View style={styles.answerCard}>
          <View style={styles.answerHeader}>
            <Text style={styles.answerQuestion} numberOfLines={1}>
              “{qaAnswer.question}”
            </Text>
            <TouchableOpacity
              onPress={() => setQaAnswer(null)}
              accessibilityRole="button"
              accessibilityLabel={t("activeTour.dismissAnswer")}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.answerClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.answerText}>{qaAnswer.answerText}</Text>
          <AudioPlayer audioUrl={qaAnswer.audioUrl} />
        </View>
      )}

      {/* Hold-to-ask */}
      <View style={styles.footer}>
        <Pressable
          onPressIn={handleAskPressIn}
          onPressOut={handleAskPressOut}
          disabled={qaState === "thinking" || isLoading}
          accessibilityRole="button"
          accessibilityLabel={isPremium ? t("activeTour.holdToAsk") : t("activeTour.askPremiumA11y")}
        >
          <Animated.View
            style={[
              styles.askBtn,
              qaState === "recording" && styles.askBtnRecording,
              { transform: [{ scale: pulseAnim }] },
            ]}
          >
            {qaState === "thinking" ? (
              <ActivityIndicator color={colors.accentText} />
            ) : (
              <Text style={styles.askBtnIcon}>🎙️</Text>
            )}
          </Animated.View>
          {!isPremium && (
            <View style={styles.askProBadge}>
              <Text style={styles.askProBadgeText}>{t("common.pro")}</Text>
            </View>
          )}
        </Pressable>
        <Text style={styles.footerHint}>{askCaption}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  mapWrap: {
    flex: 1,
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
  },
  endLink: {
    position: "absolute",
    right: 16,
    backgroundColor: "rgba(255,255,255,0.9)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  endLinkText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  compassOverlay: {
    position: "absolute",
    right: 16,
  },
  statsBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  statsText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  moodBadge: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  answerCard: {
    backgroundColor: colors.surfaceAlt,
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  answerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  answerQuestion: {
    flex: 1,
    fontSize: 13,
    fontStyle: "italic",
    color: colors.muted,
    marginRight: 10,
  },
  answerClose: {
    fontSize: 14,
    color: colors.muted,
    fontWeight: "700",
  },
  answerText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    marginBottom: 4,
  },
  footer: {
    alignItems: "center",
    paddingVertical: 14,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  askBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.accent,
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  askBtnRecording: {
    backgroundColor: "#E85A3B",
  },
  askBtnIcon: {
    fontSize: 26,
  },
  askProBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: colors.pro,
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  askProBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.proText,
  },
  footerHint: {
    marginTop: 8,
    fontSize: 12,
    color: colors.muted,
  },
});
