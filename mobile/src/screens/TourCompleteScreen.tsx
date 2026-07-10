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
  Share,
  Alert,
} from "react-native";
import { endTour, publishTour, deleteTour } from "../services/api";
import TourStatsGrid from "../components/TourStatsGrid";
import { colors, font, radius } from "../theme";
import { showToast } from "../services/toast";
import { tap, success } from "../services/haptics";

interface TourCompleteProps {
  tourId: string;
  blocksVisited: number;
  startTime: number;
  path: { lat: number; lng: number }[];
  onDone: () => void;
}

export default function TourCompleteScreen({
  tourId,
  blocksVisited,
  startTime,
  path,
  onDone,
}: TourCompleteProps) {
  const [title, setTitle] = useState("Your Tour");
  const [mood, setMood] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [shareAsRoute, setShareAsRoute] = useState(true);
  const [saved, setSaved] = useState(false);

  const durationSec = Math.round((Date.now() - startTime) / 1000);
  const durationMin = Math.round(durationSec / 60);
  // Rough estimate: ~150m per block
  const distanceM = blocksVisited * 150;
  const distanceKm = (distanceM / 1000).toFixed(1);

  useEffect(() => {
    async function finalize() {
      try {
        const result = await endTour(tourId, distanceM, durationSec, path);
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
      success();
      if (shareAsRoute) {
        setSaving(false);
        setSaved(true);
        return;
      }
    } catch (e: any) {
      console.warn("Failed to publish tour:", e.message);
      showToast("Couldn't save your tour details, but your walk is recorded.");
    }
    setSaving(false);
    onDone();
  }

  function handleDiscard() {
    Alert.alert(
      "Discard this walk?",
      "This deletes it permanently — it won't be saved to your history or published.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: confirmDiscard },
      ]
    );
  }

  async function confirmDiscard() {
    setDiscarding(true);
    try {
      if (tourId) await deleteTour(tourId);
      onDone();
    } catch (e: any) {
      console.warn("Failed to discard tour:", e.message);
      showToast("Couldn't discard this walk — try again in a moment.");
      setDiscarding(false);
    }
  }

  async function handleShare() {
    try {
      await Share.share({
        message: `I just walked "${title}" on Backyard! Check it out: backyard://route/${tourId}`,
      });
    } catch (e) {
      console.warn("Share failed:", e);
    }
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Saving your tour...</Text>
      </View>
    );
  }

  if (saved) {
    return (
      <View style={styles.container}>
        <Text style={styles.emoji}>✅</Text>
        <Text style={styles.title}>Saved &amp; published!</Text>
        <Text style={styles.loadingText}>Share it so others can walk it too.</Text>

        <TouchableOpacity
          style={styles.doneBtn}
          onPress={() => {
            tap();
            handleShare();
          }}
          accessibilityRole="button"
          accessibilityLabel="Share this route"
        >
          <Text style={styles.doneBtnText}>Share</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onDone}
          accessibilityRole="button"
          accessibilityLabel="Continue"
          style={{ marginTop: 16 }}
        >
          <Text style={styles.shareDesc}>Continue</Text>
        </TouchableOpacity>
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
        accessibilityLabel="Tour title"
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
          accessibilityLabel="Publish as public route toggle"
        />
      </View>

      <TouchableOpacity
        style={styles.doneBtn}
        onPress={handleSave}
        disabled={saving || discarding}
        accessibilityRole="button"
        accessibilityLabel="Save tour"
      >
        <Text style={styles.doneBtnText}>{saving ? "Saving..." : "Save"}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={handleDiscard}
        disabled={saving || discarding}
        accessibilityRole="button"
        accessibilityLabel="Discard this walk"
        style={styles.discardBtn}
      >
        <Text style={styles.discardBtnText}>
          {discarding ? "Discarding..." : "Discard this walk"}
        </Text>
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
  discardBtn: {
    marginTop: 14,
    padding: 8,
  },
  discardBtnText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  loadingText: {
    color: colors.muted,
    marginTop: 16,
    fontSize: 16,
  },
});
