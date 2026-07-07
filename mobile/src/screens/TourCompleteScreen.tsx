// Tour Complete screen — shows stats after ending YOUR OWN tour, and lets
// you optionally publish it as a discoverable public route.

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Switch,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { endTour, publishTour } from "../services/api";
import TourStatsGrid from "../components/TourStatsGrid";
import { colors, font, radius } from "../theme";

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
  const [saving, setSaving] = useState(false);
  const [shareAsRoute, setShareAsRoute] = useState(true);

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

  async function handleSave() {
    setSaving(true);
    try {
      if (tourId) {
        await publishTour(tourId, shareAsRoute, title.trim() || undefined);
      }
    } catch (e: any) {
      console.warn("Failed to publish tour:", e.message);
    }
    setSaving(false);
    onDone();
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Saving your tour...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>🎉</Text>
      <Text style={styles.title}>Tour Complete!</Text>

      <TextInput
        style={styles.titleInput}
        value={title}
        onChangeText={setTitle}
        placeholder="Name your tour"
        placeholderTextColor={colors.muted}
      />

      <TourStatsGrid
        blocksVisited={blocksVisited}
        distanceKm={distanceKm}
        durationMin={durationMin}
        mood={mood}
      />

      <View style={styles.shareRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.shareTitle}>Share this as a public route?</Text>
          <Text style={styles.shareDesc}>Others can discover and walk it themselves</Text>
        </View>
        <Switch
          value={shareAsRoute}
          onValueChange={setShareAsRoute}
          trackColor={{ false: colors.border, true: colors.accent }}
        />
      </View>

      <TouchableOpacity style={styles.doneBtn} onPress={handleSave} disabled={saving}>
        <Text style={styles.doneBtnText}>{saving ? "Saving..." : "Save"}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  emoji: {
    fontSize: 64,
    marginBottom: 12,
  },
  title: {
    fontFamily: font.display,
    fontSize: 26,
    color: colors.text,
    marginBottom: 16,
  },
  titleInput: {
    width: "100%",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    fontSize: 16,
    color: colors.text,
    textAlign: "center",
    marginBottom: 20,
  },
  shareRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    width: "100%",
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 24,
  },
  shareTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  shareDesc: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  doneBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: radius.md,
    width: "100%",
  },
  doneBtnText: {
    color: colors.accentText,
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "center",
  },
  loadingText: {
    color: colors.muted,
    marginTop: 16,
    fontSize: 16,
  },
});
