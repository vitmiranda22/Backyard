// Tour Complete screen — shows stats after ending YOUR OWN tour, and lets
// you optionally publish it as a discoverable public route. Naming, stats,
// the share toggle, and save/discard all live on one Bosco hero screen now
// (previously a forced two-step flow: name, then a separate stats screen).

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Switch,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  Share,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { endTour, EndTourResponse, publishTour, deleteTour } from "../services/api";
import TourStatsGrid from "../components/TourStatsGrid";
import { colors, font, radius } from "../theme";
import { showToast } from "../services/toast";
import { tap, success } from "../services/haptics";
import { track } from "../services/analytics";
import { maybePromptForReview } from "../services/reviewPrompt";

// Celebrating pose -- shared with BadgeGalleryScreen's header.
const MASCOT_IMAGE = require("../../assets/bosco-celebrating.png");

interface TourCompleteProps {
  tourId: string;
  blocksVisited: number;
  startTime: number;
  path: { lat: number; lng: number }[];
  // Set when ActiveTourScreen already called /end-tour itself (an
  // auto-completed tour, so it could play the outro right after the last
  // block instead of here) -- reused instead of calling endTour() again,
  // which would otherwise regenerate the same outro TTS a second time.
  // Absent for a manual end, where this screen still does the real call.
  prefetchedResult?: EndTourResponse | null;
  onDone: () => void;
}

export default function TourCompleteScreen({
  tourId,
  blocksVisited,
  startTime,
  path,
  prefetchedResult,
  onDone,
}: TourCompleteProps) {
  const { t } = useTranslation();
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
    // Auto-completed tours already had /end-tour called (and the outro
    // played) by ActiveTourScreen, right after the last block -- reuse
    // that result instead of calling endTour() again here.
    if (prefetchedResult) {
      setMood(prefetchedResult.mood);
      track("tour_completed", {
        mood: prefetchedResult.mood,
        blocks_visited: blocksVisited,
        distance_m: distanceM,
        duration_sec: durationSec,
      });
      setLoading(false);
      return;
    }

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

  async function handleSave() {
    if (!title.trim()) return;
    tap();
    setSaving(true);
    try {
      if (tourId) {
        await publishTour(tourId, shareAsRoute, title.trim());
      }
      track("tour_saved", { published: shareAsRoute });
      success();
      // Fire-and-forget -- checks its own milestone/frequency conditions
      // and no-ops most of the time; never awaited so it can't delay the
      // screen transition below.
      maybePromptForReview();
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
    <KeyboardAvoidingView
      style={styles.heroContainer}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.bgWrap}>
        <Image source={MASCOT_IMAGE} style={styles.heroBg} resizeMode="cover" accessibilityLabel={t("login.mascotA11y")} />
      </View>

      <TouchableOpacity
        style={styles.closeBtn}
        onPress={handleDiscard}
        disabled={saving || discarding}
        accessibilityRole="button"
        accessibilityLabel={t("tourComplete.closeA11y")}
      >
        <Text style={styles.closeBtnText}>✕</Text>
      </TouchableOpacity>

      <LinearGradient colors={["rgba(10,12,18,0.5)", "rgba(10,12,18,0)"]} style={styles.heroTopScrim} />
      <Text style={styles.heroTopTitle}>{t("tourComplete.heroTitle")}</Text>

      <LinearGradient
        colors={["rgba(10,12,18,0)", "rgba(10,12,18,0)", "rgba(10,12,18,0.4)", "rgba(10,12,18,0.9)"]}
        locations={[0, 0.76, 0.86, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.heroContent}>
        <View style={styles.heroCard}>
          <Text style={styles.heroCardLabel}>{t("tourComplete.whatWasThisWalk")}</Text>

          <TextInput
            style={styles.titleInput}
            value={title}
            onChangeText={setTitle}
            placeholder={t("tourComplete.titlePlaceholder")}
            placeholderTextColor={colors.muted}
            accessibilityLabel={t("tourComplete.tourTitleA11y")}
            autoFocus
            returnKeyType="done"
          />

          {loading ? (
            <ActivityIndicator size="small" color={colors.accent} style={styles.statsLoading} />
          ) : (
            <TourStatsGrid
              blocksVisited={blocksVisited}
              distanceKm={distanceKm}
              durationMin={durationMin}
              mood={mood}
            />
          )}

          <View style={styles.shareRow}>
            <Text style={styles.shareText}>{t("tourComplete.shareAsRouteQuestion")}</Text>
            <Switch
              value={shareAsRoute}
              onValueChange={setShareAsRoute}
              trackColor={{ false: colors.border, true: colors.accent }}
              accessibilityLabel={t("tourComplete.publishToggleA11y")}
            />
          </View>

          {saving ? (
            <ActivityIndicator size="large" color={colors.accent} style={{ margin: 10 }} />
          ) : (
            <>
              <TouchableOpacity
                style={[styles.doneBtn, !title.trim() && styles.doneBtnDisabled]}
                onPress={handleSave}
                disabled={!title.trim() || discarding}
                accessibilityRole="button"
                accessibilityLabel={t("tourComplete.saveTourA11y")}
              >
                <Text style={styles.doneBtnText}>{t("tourComplete.save")}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleDiscard}
                disabled={discarding}
                accessibilityRole="button"
                accessibilityLabel={t("tourComplete.discardThisWalk")}
                style={styles.discardBtn}
              >
                <Text style={styles.discardBtnText}>
                  {discarding ? t("tourComplete.discarding") : t("tourComplete.discardThisWalk")}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  heroContainer: {
    flex: 1,
    backgroundColor: colors.text,
  },
  // Same oversized-image-with-negative-offset crop as LoginScreen -- see
  // that file's comment for why resizeMode="cover" alone isn't enough.
  bgWrap: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  heroBg: {
    position: "absolute",
    width: "100%",
    height: "200%",
    top: "-65%",
  },
  closeBtn: {
    position: "absolute",
    top: 16,
    right: 16,
    zIndex: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(10,12,18,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  heroTopScrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "26%",
  },
  heroTopTitle: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 20,
    paddingHorizontal: 22,
    fontFamily: font.display,
    fontSize: 20,
    color: "#fff",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
  },
  heroContent: {
    flex: 1,
    justifyContent: "flex-end",
    padding: 18,
    paddingBottom: 24,
  },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 16,
  },
  heroCardLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    color: colors.muted,
    textAlign: "center",
    marginBottom: 8,
  },
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
  titleInput: {
    width: "100%",
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    fontSize: 15,
    color: colors.text,
    textAlign: "center",
    marginBottom: 14,
  },
  statsLoading: {
    marginBottom: 14,
  },
  shareRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  shareText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  doneBtnDisabled: {
    backgroundColor: colors.border,
  },
  doneBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: radius.md,
    width: "100%",
  },
  doneBtnText: {
    color: colors.accentText,
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
  },
  discardBtn: {
    marginTop: 10,
    padding: 6,
  },
  discardBtnText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  shareDesc: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  loadingText: {
    color: colors.muted,
    marginTop: 16,
    fontSize: 16,
  },
});
