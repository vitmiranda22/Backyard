// Tour Complete screen — shows stats after ending a tour

import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { endTour } from "../services/api";

interface TourCompleteProps {
  tourId: string;
  blocksVisited: number;
  startTime: number;
  onDone: () => void;
}

export default function TourCompleteScreen({
  tourId,
  blocksVisited,
  startTime,
  onDone,
}: TourCompleteProps) {
  const [title, setTitle] = useState("Your Tour");
  const [mood, setMood] = useState("");
  const [loading, setLoading] = useState(true);

  const durationSec = Math.round((Date.now() - startTime) / 1000);
  const durationMin = Math.round(durationSec / 60);
  // Rough estimate: ~150m per block
  const distanceM = blocksVisited * 150;
  const distanceKm = (distanceM / 1000).toFixed(1);

  useEffect(() => {
    async function finalize() {
      try {
        const result = await endTour(tourId, distanceM, durationSec);
        setTitle(result.title);
        setMood(result.mood);
      } catch (e) {
        console.error("Failed to end tour:", e);
        setTitle("Tour Complete");
      }
      setLoading(false);
    }

    if (tourId) {
      finalize();
    } else {
      setLoading(false);
    }
  }, []);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#4A90D9" />
        <Text style={styles.loadingText}>Saving your tour...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>🎉</Text>
      <Text style={styles.title}>Tour Complete!</Text>
      <Text style={styles.tourTitle}>{title}</Text>

      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>📍 {blocksVisited}</Text>
          <Text style={styles.statLabel}>blocks narrated</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>🚶 {distanceKm} km</Text>
          <Text style={styles.statLabel}>walked</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>⏱️ {durationMin} min</Text>
          <Text style={styles.statLabel}>duration</Text>
        </View>
        {mood ? (
          <View style={styles.statCard}>
            <Text style={styles.statValue}>🌙 {mood}</Text>
            <Text style={styles.statLabel}>mood</Text>
          </View>
        ) : null}
      </View>

      <TouchableOpacity style={styles.doneBtn} onPress={onDone}>
        <Text style={styles.doneBtnText}>Done</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0d0d1a",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  emoji: {
    fontSize: 64,
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 4,
  },
  tourTitle: {
    fontSize: 18,
    color: "#4A90D9",
    marginBottom: 30,
    textTransform: "capitalize",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 12,
    marginBottom: 40,
  },
  statCard: {
    backgroundColor: "#1a1a2e",
    padding: 16,
    borderRadius: 12,
    minWidth: 140,
    alignItems: "center",
  },
  statValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#fff",
  },
  statLabel: {
    fontSize: 12,
    color: "#999",
    marginTop: 4,
  },
  doneBtn: {
    backgroundColor: "#4A90D9",
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 12,
  },
  doneBtnText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  loadingText: {
    color: "#999",
    marginTop: 16,
    fontSize: 16,
  },
});
