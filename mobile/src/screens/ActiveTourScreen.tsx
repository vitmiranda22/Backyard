// Active Tour screen — THE main screen
//
// Fixes:
// - Uses ref for isLoading to prevent double triggers from GPS callbacks
// - Audio and text are always from the same narration response
// - Debounce on zone changes prevents rapid re-fires

import React, { useState, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, Pressable, StyleSheet, Alert, Animated, Easing, ActivityIndicator } from "react-native";
import MapView, { Polyline } from "react-native-maps";
import { useZoneTracker } from "../hooks/useZoneTracker";
import {
  watchPosition,
  watchHeading,
  getCurrentLocation,
  bearingBetween,
  distanceMeters,
  compassLabel,
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

interface ActiveTourProps {
  mood: string;
  voice: string;
  contentSafety: boolean;
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
  onEndTour,
}: ActiveTourProps) {
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

  // Keep tourIdRef in sync
  useEffect(() => {
    tourIdRef.current = tourId;
  }, [tourId]);

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
    async function init() {
      try {
        const tour = await startTour(mood, voice, contentSafety);
        setTourId(tour.tour_id);
        tourIdRef.current = tour.tour_id;
        startTimeRef.current = Date.now();
        scheduleUnfinishedTourReminder(tour.tour_id);

        // Get initial location and trigger first narration
        const loc = await getCurrentLocation();
        setLocation(loc);
        setPath([{ latitude: loc.lat, longitude: loc.lng }]);
        triggerNarration(loc.lat, loc.lng, "auto");

        // Start watching position for zone changes
        const sub = await watchPosition((lat, lng) => {
          setLocation({ lat, lng });
          setPath((prev) => [...prev, { latitude: lat, longitude: lng }]);

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
        Alert.alert("Error", "Failed to start tour: " + e.message);
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
          showToast("Couldn't save that block — your walk continues.");
        }
      }
    } catch (e: any) {
      setError("Having trouble finding stories. Keep walking!");
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
      showToast("Couldn't get an answer to that — try again.");
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
    if (tourId) cancelReminder(tourId);
    resetZones();
    onEndTour(tourId || "", blocksVisited, startTimeRef.current, path);
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
      ? "Listening to your question…"
      : qaState === "thinking"
      ? "Thinking…"
      : "Hold to ask a question";

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
            {path.length > 1 && (
              <Polyline
                coordinates={path}
                strokeColor="rgba(255, 107, 74, 0.6)"
                strokeWidth={14}
                lineCap="round"
                lineJoin="round"
              />
            )}
          </MapView>
        ) : (
          <View style={styles.mapPlaceholder}>
            <Text style={styles.placeholderText}>Getting location...</Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.endLink}
          onPress={handleEndTour}
          accessibilityRole="button"
          accessibilityLabel="End tour"
        >
          <Text style={styles.endLinkText}>End</Text>
        </TouchableOpacity>

        {blockOrigin && targetBearing !== null && (
          <View style={styles.compassOverlay}>
            <WaypointCompass
              bearingDeg={relativeBearing}
              distanceLabel={`${Math.round(distanceToBlock)}m · ${compassLabel(targetBearing)}`}
            />
          </View>
        )}
      </View>

      {/* Blocks counter */}
      <View style={styles.statsBar}>
        <Text style={styles.statsText}>📍 {blocksVisited} blocks</Text>
        <Text style={styles.moodBadge}>{mood.replace("_", " ")}</Text>
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
              accessibilityLabel="Dismiss answer"
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
          accessibilityLabel="Hold to ask a question"
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
    top: 50,
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
    top: 88,
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
  footerHint: {
    marginTop: 8,
    fontSize: 12,
    color: colors.muted,
  },
});
