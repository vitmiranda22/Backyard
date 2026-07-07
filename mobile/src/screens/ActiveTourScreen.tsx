// Active Tour screen — THE main screen
//
// Fixes:
// - Uses ref for isLoading to prevent double triggers from GPS callbacks
// - Audio and text are always from the same narration response
// - Debounce on zone changes prevents rapid re-fires

import React, { useState, useEffect, useRef, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import MapView from "react-native-maps";
import { useZoneTracker } from "../hooks/useZoneTracker";
import { watchPosition, getCurrentLocation } from "../services/location";
import { narrateBlock, saveBlock, startTour } from "../services/api";
import NarrationCard from "../components/NarrationCard";
import { colors, radius } from "../theme";

interface ActiveTourProps {
  mood: string;
  voice: string;
  contentSafety: boolean;
  onEndTour: (tourId: string, blocksVisited: number, startTime: number) => void;
}

export default function ActiveTourScreen({
  mood,
  voice,
  contentSafety,
  onEndTour,
}: ActiveTourProps) {
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [tourId, setTourId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streetName, setStreetName] = useState<string | null>(null);
  const [narrationText, setNarrationText] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [blocksVisited, setBlocksVisited] = useState(0);

  const { checkZone, reset: resetZones } = useZoneTracker();
  const sequenceRef = useRef(0);
  const startTimeRef = useRef(Date.now());
  const subscriptionRef = useRef<any>(null);
  const tourIdRef = useRef<string | null>(null);

  // Use a ref for isLoading so GPS callbacks always see the current value
  const isLoadingRef = useRef(false);

  // Debounce — don't trigger more than once every 10 seconds
  const lastTriggerTime = useRef(0);

  // Keep tourIdRef in sync
  useEffect(() => {
    tourIdRef.current = tourId;
  }, [tourId]);

  // Start tour session on mount
  useEffect(() => {
    async function init() {
      try {
        const tour = await startTour(mood, voice, contentSafety);
        setTourId(tour.tour_id);
        tourIdRef.current = tour.tour_id;
        startTimeRef.current = Date.now();

        // Get initial location and trigger first narration
        const loc = await getCurrentLocation();
        setLocation(loc);
        triggerNarration(loc.lat, loc.lng, "auto");

        // Start watching position for zone changes
        const sub = await watchPosition((lat, lng) => {
          setLocation({ lat, lng });

          const { isNewZone } = checkZone(lat, lng);
          if (!isNewZone) return;

          // Check loading ref (not state — state is stale in callbacks)
          if (isLoadingRef.current) return;

          // Debounce: at least 10 seconds between triggers
          const now = Date.now();
          if (now - lastTriggerTime.current < 10000) return;

          triggerNarration(lat, lng, "auto");
        });
        subscriptionRef.current = sub;
      } catch (e: any) {
        Alert.alert("Error", "Failed to start tour: " + e.message);
      }
    }
    init();

    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
      }
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

      sequenceRef.current += 1;
      setBlocksVisited(sequenceRef.current);

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
            voice,
            mood,
            trigger_type: triggerType,
          });
        } catch (e) {
          console.warn("Failed to save block (tour continues):", e);
        }
      }
    } catch (e: any) {
      setError("Having trouble finding stories. Keep walking!");
      console.error("Narration failed:", e.message);
    }

    isLoadingRef.current = false;
    setIsLoading(false);
  }

  function handleManualTrigger() {
    if (location && !isLoadingRef.current) {
      triggerNarration(location.lat, location.lng, "manual");
    }
  }

  function handleEndTour() {
    if (subscriptionRef.current) {
      subscriptionRef.current.remove();
    }
    resetZones();
    onEndTour(tourId || "", blocksVisited, startTimeRef.current);
  }

  return (
    <View style={styles.container}>
      {/* Map */}
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
        />
      ) : (
        <View style={styles.mapPlaceholder}>
          <Text style={styles.placeholderText}>Getting location...</Text>
        </View>
      )}

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
        onSkip={() => {
          setNarrationText(null);
          setAudioUrl(null);
          setStreetName(null);
        }}
      />

      {/* Bottom buttons */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.manualBtn}
          onPress={handleManualTrigger}
          disabled={isLoading}
        >
          <Text style={styles.manualBtnText}>
            {isLoading ? "Generating..." : "Tell me about here"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.endBtn} onPress={handleEndTour}>
          <Text style={styles.endBtnText}>End Tour</Text>
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
  bottomBar: {
    flexDirection: "row",
    padding: 12,
    gap: 10,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  manualBtn: {
    flex: 2,
    backgroundColor: colors.accent,
    padding: 14,
    borderRadius: radius.md,
  },
  manualBtnText: {
    color: colors.accentText,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
  },
  endBtn: {
    flex: 1,
    backgroundColor: colors.danger,
    padding: 14,
    borderRadius: radius.md,
  },
  endBtnText: {
    color: colors.accentText,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
  },
});
