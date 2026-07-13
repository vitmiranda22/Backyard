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
import { useTranslation } from "react-i18next";
import { endTour, publishTour, deleteTour } from "../services/api";
import TourStatsGrid from "../components/TourStatsGrid";
import { colors, font, radius } from "../theme";
import { showToast } from "../services/toast";
import { tap, success } from "../services/haptics";
import { track } from "../services/analytics";

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
  const { t } = useTranslation();
  // Naming is its own forced first step — no auto-generated default to
  // fall back on, so there's nothing to silently skip. The endTour() call
  // (which needs a couple seconds and gives us `mood` for the stats grid)
  // runs in the background while the walker is still typing, rather than
  // making them stare at a spinner before they can even start.
  const [nameStep, setNameStep] = useState(true);
  const [advancing, setAdvancing] = useState(false);
  const [title, setTitle] = useState("");
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
        setMood(result.mood);
        track("tour_completed", {
          mood: result.mood,
          blocks_visited: blocksVisited,
          distance_m: distanceM,
          duration_sec: durationSec,
        });
      } catch (e) {
        console.error("Failed to end tour:", e);
      }
      setLoading(false);
    }

    if (tourId) {
      finalize();
    } else {
      setLoading(false);
    }
  }, []);

  function handleContinueFromName() {
    if (!title.trim()) return;
    tap();
    if (loading) {
      // endTour() is still finishing up in the background — show a brief
      // beat instead of the name step just vanishing into nothing.
      setAdvancing(true);
      return;
    }
    setNameStep(false);
  }

  // Once endTour() resolves, advance automatically if the walker already
  // hit Continue and was waiting on it.
  useEffect(() => {
    if (advancing && !loading) {
      setAdvancing(false);
      setNameStep(false);
    }
  }, [loading, advancing]);

  async function handleSave() {
    setSaving(true);
    try {
      if (tourId) {
        await publishTour(tourId, shareAsRoute, title.trim() || undefined);
      }
      track("tour_saved", { published: shareAsRoute });
      success();
      if (shareAsRoute) {
        setSaving(false);
        setSaved(true);
        return;
      }
    } catch (e: any) {
      console.warn("Failed to publish tour:", e.message);
      showToast(t("tourComplete.couldntSaveDetails"));
    }
    setSaving(false);
    onDone();
  }

  function handleDiscard() {
    Alert.alert(
      t("tourComplete.discardConfirmTitle"),
      t("tourComplete.discardConfirmBody"),
      [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("tourComplete.discard"), style: "destructive", onPress: confirmDiscard },
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
      showToast(t("tourComplete.couldntDiscard"));
      setDiscarding(false);
    }
  }

  async function handleShare() {
    try {
      await Share.share({
        message: t("tourComplete.shareMessage", { title, tourId }),
      });
      track("route_shared", { source: "tour_complete" });
    } catch (e) {
      console.warn("Share failed:", e);
    }
  }

  if (nameStep) {
    if (advancing) {
      return (
        <View style={styles.container}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>{t("tourComplete.finishingUp")}</Text>
        </View>
      );
    }
    return (
      <View style={styles.container}>
        <Text style={styles.emoji}>🎉</Text>
        <Text style={styles.title}>{t("tourComplete.whatWasThisWalk")}</Text>
        <Text style={styles.nameSubtitle}>{t("tourComplete.nameSubtitle")}</Text>

        <TextInput
          style={styles.titleInput}
          value={title}
          onChangeText={setTitle}
          placeholder={t("tourComplete.titlePlaceholder")}
          placeholderTextColor={colors.muted}
          accessibilityLabel={t("tourComplete.tourTitleA11y")}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={handleContinueFromName}
        />

        <TouchableOpacity
          style={[styles.doneBtn, !title.trim() && styles.doneBtnDisabled]}
          onPress={handleContinueFromName}
          disabled={!title.trim()}
          accessibilityRole="button"
          accessibilityLabel={t("tourComplete.continue")}
        >
          <Text style={styles.doneBtnText}>{t("tourComplete.continue")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (saved) {
    return (
      <View style={styles.container}>
        <Text style={styles.emoji}>✅</Text>
        <Text style={styles.title}>{t("tourComplete.savedPublished")}</Text>
        <Text style={styles.loadingText}>{t("tourComplete.shareToWalkToo")}</Text>

        <TouchableOpacity
          style={styles.doneBtn}
          onPress={() => {
            tap();
            handleShare();
          }}
          accessibilityRole="button"
          accessibilityLabel={t("tourComplete.shareThisRouteA11y")}
        >
          <Text style={styles.doneBtnText}>{t("tourComplete.share")}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onDone}
          accessibilityRole="button"
          accessibilityLabel={t("tourComplete.continue")}
          style={{ marginTop: 16 }}
        >
          <Text style={styles.shareDesc}>{t("tourComplete.continue")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>🎉</Text>
      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>

      <TextInput
        style={styles.editNameInput}
        value={title}
        onChangeText={setTitle}
        placeholder={t("tourComplete.editNamePlaceholder")}
        placeholderTextColor={colors.muted}
        accessibilityLabel={t("tourComplete.editNameA11y")}
      />

      <TourStatsGrid
        blocksVisited={blocksVisited}
        distanceKm={distanceKm}
        durationMin={durationMin}
        mood={mood}
      />

      <View style={styles.shareRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.shareTitle}>{t("tourComplete.shareAsRouteQuestion")}</Text>
          <Text style={styles.shareDesc}>{t("tourComplete.shareAsRouteDesc")}</Text>
        </View>
        <Switch
          value={shareAsRoute}
          onValueChange={setShareAsRoute}
          trackColor={{ false: colors.border, true: colors.accent }}
          accessibilityLabel={t("tourComplete.publishToggleA11y")}
        />
      </View>

      <TouchableOpacity
        style={styles.doneBtn}
        onPress={handleSave}
        disabled={saving || discarding}
        accessibilityRole="button"
        accessibilityLabel={t("tourComplete.saveTourA11y")}
      >
        <Text style={styles.doneBtnText}>{saving ? t("tourComplete.saving") : t("tourComplete.save")}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={handleDiscard}
        disabled={saving || discarding}
        accessibilityRole="button"
        accessibilityLabel={t("tourComplete.discardThisWalk")}
        style={styles.discardBtn}
      >
        <Text style={styles.discardBtnText}>
          {discarding ? t("tourComplete.discarding") : t("tourComplete.discardThisWalk")}
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
    textAlign: "center",
  },
  nameSubtitle: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 24,
    textAlign: "center",
  },
  titleInput: {
    width: "100%",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    fontSize: 17,
    color: colors.text,
    textAlign: "center",
    marginBottom: 24,
  },
  editNameInput: {
    width: "100%",
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 10,
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
    marginBottom: 20,
  },
  doneBtnDisabled: {
    backgroundColor: colors.border,
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
