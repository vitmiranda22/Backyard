// Replay screen — walk someone else's published route. Narration is never
// regenerated: as you approach each saved waypoint, the app plays back the
// ORIGINAL recorded audio for that block. Zero Gemini/TTS calls.

import React, { useState, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { watchPosition, getCurrentLocation } from "../services/location";
import { getTourDetail, TourDetail, TourBlockDetail } from "../services/api";
import { haversineDistanceMeters } from "../utils/geo";
import { REPLAY_PROXIMITY_M } from "../config";
import NarrationCard from "../components/NarrationCard";
import { colors, radius } from "../theme";

interface ReplayScreenProps {
  tour: TourDetail;
  onReplayComplete: (tourId: string) => void;
}

export default function ReplayScreen({ tour, onReplayComplete }: ReplayScreenProps) {
  const [blocks, setBlocks] = useState<TourBlockDetail[]>(tour.blocks);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [targetIndex, setTargetIndex] = useState(0);
  const [activeBlock, setActiveBlock] = useState<TourBlockDetail | null>(null);
  const [isRefreshingAudio, setIsRefreshingAudio] = useState(false);

  const targetIndexRef = useRef(0);
  const activeBlockRef = useRef<TourBlockDetail | null>(null);
  const subscriptionRef = useRef<any>(null);
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
      } catch (e: any) {
        Alert.alert("Error", "Failed to get your location: " + e.message);
      }
    }
    init();

    return () => {
      cancelled = true;
      if (subscriptionRef.current) subscriptionRef.current.remove();
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

    // Don't wait for the next GPS tick — the next waypoint might already be close
    // (common when waypoints are near each other).
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
    }
    setIsRefreshingAudio(false);
  }

  const target = blocks[targetIndex];

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
                pinColor={i < targetIndex ? colors.pro : i === targetIndex ? colors.accent : colors.muted}
                title={b.street_name}
              />
            ))}
          </MapView>
        ) : (
          <View style={styles.mapPlaceholder}>
            <Text style={styles.placeholderText}>Getting your location...</Text>
          </View>
        )}
      </View>

      <View style={styles.statsBar}>
        <Text style={styles.statsText}>
          📍 {Math.min(targetIndex + 1, blocks.length)} of {blocks.length}
        </Text>
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
            <Text style={styles.guideText}>
              {isRefreshingAudio ? "Refreshing audio..." : `Walk toward ${target.street_name} to continue`}
            </Text>
          </View>
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
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
    fontWeight: "700",
  },
  title: {
    color: colors.muted,
    fontSize: 13,
    flex: 1,
    textAlign: "right",
    marginLeft: 12,
  },
  guideCard: {
    padding: 16,
    alignItems: "center",
  },
  guideText: {
    color: colors.muted,
    fontSize: 14,
    textAlign: "center",
  },
});
