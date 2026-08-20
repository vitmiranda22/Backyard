// Tour Complete screen — shows stats after ending YOUR OWN tour, and lets
// you optionally publish it as a discoverable public route. Naming, stats,
// the share toggle, and save/discard all live on one Bosco hero screen now
// (previously a forced two-step flow: name, then a separate stats screen).

import React, { useState, useEffect, useRef } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import * as ImagePicker from "expo-image-picker";
import * as Sharing from "expo-sharing";
import ViewShot from "react-native-view-shot";
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
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState("");
  const [mood, setMood] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [shareAsRoute, setShareAsRoute] = useState(true);
  const [saved, setSaved] = useState(false);
  const [selfieUri, setSelfieUri] = useState<string | null>(null);
  // Captured from the hero scene (Bosco + Polaroid + stats card) right
  // before handleSave switches away to the "saved" confirmation view --
  // that view doesn't render the hero at all, so this has to be grabbed
  // while it's still mounted, not later when Share is actually tapped.
  const [shareImageUri, setShareImageUri] = useState<string | null>(null);
  const viewShotRef = useRef<ViewShot>(null);

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

  async function handleAddPhoto() {
    tap();
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      showToast(t("tourComplete.cameraPermissionDenied"));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!result.canceled && result.assets && result.assets[0]) {
      setSelfieUri(result.assets[0].uri);
    }
  }

  async function handleSave() {
    if (!title.trim()) return;
    tap();
    setSaving(true);

    // Grab the hero scene (Bosco + Polaroid selfie + stats card) as a
    // shareable image now, while it's still on screen -- the "saved"
    // confirmation view that replaces it below doesn't render any of this.
    // Best-effort: a failed capture just falls back to text-only sharing.
    try {
      if (viewShotRef.current?.capture) {
        const uri = await viewShotRef.current.capture();
        setShareImageUri(uri);
      }
    } catch (e) {
      console.warn("Failed to capture share image (continuing anyway):", e);
    }

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
      const canShareImage = shareImageUri && (await Sharing.isAvailableAsync());
      if (canShareImage) {
        await Sharing.shareAsync(shareImageUri!, {
          dialogTitle: t("tourComplete.shareThisRouteA11y"),
        });
      } else {
        // Capture failed, or Sharing isn't available on this platform --
        // still share something rather than nothing.
        await Share.share({
          message: t("tourComplete.shareMessage", { title, tourId }),
        });
      }
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
      {/* flex:1, not StyleSheet.absoluteFill -- this is KeyboardAvoidingView's
          only child, and an absolutely-positioned child doesn't reliably
          shrink when "padding" behavior adds paddingBottom for the
          keyboard (ViewShot is a native wrapper and doesn't forward that
          resize the way a plain View does), which was letting the
          keyboard cover the Save button entirely. flex:1 keeps it in
          normal layout flow so it responds correctly. */}
      <ViewShot ref={viewShotRef} style={{ flex: 1 }} options={{ format: "png", quality: 0.9 }}>
      <View style={styles.bgWrap}>
        <Image source={MASCOT_IMAGE} style={styles.heroBg} resizeMode="cover" accessibilityLabel={t("login.mascotA11y")} />
      </View>

      <LinearGradient colors={["rgba(10,12,18,0.5)", "rgba(10,12,18,0)"]} style={styles.heroTopScrim} />
      <Text style={[styles.heroTopTitle, { paddingTop: Math.max(insets.top, 20) }]}>
        {t("tourComplete.heroTitle")}
      </Text>

      <LinearGradient
        colors={["rgba(10,12,18,0)", "rgba(10,12,18,0)", "rgba(10,12,18,0.4)", "rgba(10,12,18,0.9)"]}
        locations={[0, 0.76, 0.86, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Polaroid-style keepsake photo -- tap to add one if there isn't
          one yet, tap again to retake. Included inside the ViewShot above
          so it's part of the image that gets shared. */}
      <TouchableOpacity
        style={styles.polaroid}
        onPress={handleAddPhoto}
        accessibilityRole="button"
        accessibilityLabel={t("tourComplete.addPhotoA11y")}
      >
        {selfieUri ? (
          <Image source={{ uri: selfieUri }} style={styles.polaroidPhoto} />
        ) : (
          <View style={[styles.polaroidPhoto, styles.polaroidPlaceholder]}>
            <Text style={styles.polaroidPlaceholderText}>{t("tourComplete.addPhoto")}</Text>
          </View>
        )}
        <Text style={styles.polaroidCaption} numberOfLines={1}>
          {title.trim() || t("tourComplete.titlePlaceholder")}
        </Text>
      </TouchableOpacity>

      <View style={styles.heroContent}>
        <View style={styles.heroCard}>
          <Text style={styles.heroCardLabel}>{t("tourComplete.whatWasThisWalk")}</Text>

          <TextInput
            style={styles.titleInput}
            value={title}
            onChangeText={setTitle}
            placeholder={t("tourComplete.titlePlaceholder")}
            placeholderTextColor="rgba(255,255,255,0.55)"
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
      </ViewShot>

      {/* Outside the ViewShot deliberately -- this is app chrome, not
          something that should end up in the shared image. */}
      <TouchableOpacity
        style={[styles.closeBtn, { top: Math.max(insets.top, 16) }]}
        onPress={handleDiscard}
        disabled={saving || discarding}
        accessibilityRole="button"
        accessibilityLabel={t("tourComplete.closeA11y")}
      >
        <Text style={styles.closeBtnText}>✕</Text>
      </TouchableOpacity>
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
    top: "-50%",
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
  polaroid: {
    position: "absolute",
    top: 130,
    right: 26,
    width: 118,
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 8,
    paddingBottom: 14,
    transform: [{ rotate: "6deg" }],
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  polaroidPhoto: {
    width: "100%",
    height: 100,
    borderRadius: 3,
  },
  polaroidPlaceholder: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  polaroidPlaceholderText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted,
    textAlign: "center",
    paddingHorizontal: 6,
  },
  polaroidCaption: {
    fontSize: 10,
    color: "#555",
    textAlign: "center",
    marginTop: 6,
    fontStyle: "italic",
  },
  // Semi-transparent instead of a solid card -- Bosco's photo shows through
  // behind the form instead of getting fully covered by an opaque panel.
  // The dark gradient scrim behind this (see heroContent's sibling above)
  // already darkens this part of the image, which is what keeps the white
  // text below legible against a photo background.
  heroCard: {
    backgroundColor: "rgba(15,16,22,0.42)",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    padding: 16,
  },
  heroCardLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.75)",
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
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    borderRadius: radius.md,
    padding: 12,
    fontSize: 15,
    color: "#fff",
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
    color: "#fff",
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
