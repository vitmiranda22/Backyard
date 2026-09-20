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
  Keyboard,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import * as ImagePicker from "expo-image-picker";
import * as Sharing from "expo-sharing";
import ViewShot from "react-native-view-shot";
import { endTour, EndTourResponse, publishTour, deleteTour } from "../services/api";
import TourStatsGrid from "../components/TourStatsGrid";
import BoscoHero from "../components/BoscoHero";
import { colors, font, radius, type, spacing } from "../theme";
import { showToast } from "../services/toast";
import { tap, success } from "../services/haptics";
import { track } from "../services/analytics";
import { maybePromptForReview } from "../services/reviewPrompt";

// Celebrating pose -- shared with BadgeGalleryScreen's header.
const MASCOT_IMAGE = require("../../assets/bosco-celebrating.jpg");

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
  // Hides the photo/polaroid/stats/share-toggle while the keyboard is open --
  // KeyboardAvoidingView's "padding" behavior below shrinks this whole hero
  // to fit above the keyboard, and with all of that content still competing
  // for the leftover space the screen reads as cramped. Cutting it down to
  // just the title field + Save button while typing gives that shrunk space
  // room to breathe; everything else comes back once the keyboard closes.
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", () => setIsKeyboardVisible(true));
    const hideSub = Keyboard.addListener("keyboardDidHide", () => setIsKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

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

  // No blocks means no narration was ever generated for this walk (ended
  // seconds after it started) -- there's nothing real to name, photograph,
  // save, or share, so skip that whole flow instead of presenting a form
  // for content that doesn't exist. /publish-tour also rejects this
  // server-side, but this avoids showing the form at all.
  if (blocksVisited === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{t("tourComplete.emptyTourTitle")}</Text>
        <Text style={styles.loadingText}>{t("tourComplete.emptyTourBody")}</Text>

        <TouchableOpacity
          style={[styles.doneBtn, { marginTop: spacing.lg }]}
          disabled={discarding}
          onPress={() => {
            tap();
            confirmDiscard();
          }}
          accessibilityRole="button"
          accessibilityLabel={t("tourComplete.emptyTourButtonA11y")}
        >
          {discarding ? (
            <ActivityIndicator size="small" color={colors.parchmentSurface} />
          ) : (
            <Text style={styles.doneBtnText}>{t("tourComplete.continue")}</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  if (saved) {
    return (
      <View style={styles.container}>
        <Image source={require("../../assets/icons/success.png")} style={styles.successIcon} resizeMode="contain" />
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
      <BoscoHero
        image={MASCOT_IMAGE}
        imageAccessibilityLabel={t("login.mascotA11y")}
        imageTopOffset="-50%"
        topScrim={{ opacity: 0.5, heightPercent: "26%" }}
        scrimColors={["rgba(10,12,18,0)", "rgba(10,12,18,0)", "rgba(10,12,18,0.4)", "rgba(10,12,18,0.9)"]}
        scrimLocations={[0, 0.76, 0.86, 1]}
      >
      {!isKeyboardVisible && (
        <Text style={[styles.heroTopTitle, { paddingTop: Math.max(insets.top, 20) }]}>
          {t("tourComplete.heroTitle")}
        </Text>
      )}

      {isKeyboardVisible && <View style={styles.keyboardOverlay} pointerEvents="none" />}

      {/* Polaroid-style keepsake photo -- tap to add one if there isn't
          one yet, tap again to retake. Included inside the ViewShot above
          so it's part of the image that gets shared. */}
      {!isKeyboardVisible && (
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
      )}

      <View style={[styles.heroContent, isKeyboardVisible && styles.heroContentCompact]}>
        <View style={[styles.heroCard, isKeyboardVisible && styles.heroCardCompact]}>
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

          {!isKeyboardVisible && (loading ? (
            <ActivityIndicator size="small" color="#fff" style={styles.statsLoading} />
          ) : (
            <TourStatsGrid
              blocksVisited={blocksVisited}
              distanceKm={distanceKm}
              durationMin={durationMin}
              mood={mood}
              variant="dark"
            />
          ))}

          {!isKeyboardVisible && (
            <View style={styles.shareRow}>
              <Text style={styles.shareText}>{t("tourComplete.shareAsRouteQuestion")}</Text>
              <Switch
                value={shareAsRoute}
                onValueChange={setShareAsRoute}
                trackColor={{ false: colors.fieldBorder, true: colors.fieldGreen }}
                accessibilityLabel={t("tourComplete.publishToggleA11y")}
              />
            </View>
          )}

          {saving ? (
            <ActivityIndicator size="large" color="#fff" style={{ margin: 10 }} />
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

              {isKeyboardVisible && (
                <Text style={styles.compactHint}>{t("tourComplete.detailsHint")}</Text>
              )}

              {!isKeyboardVisible && (
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
              )}
            </>
          )}
        </View>
      </View>
      </BoscoHero>
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
    backgroundColor: colors.ink,
  },
  closeBtn: {
    position: "absolute",
    top: 16,
    right: 16,
    zIndex: 2,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(10,12,18,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  heroTopTitle: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 20,
    paddingHorizontal: 22,
    fontFamily: font.headingBold,
    fontSize: 28,
    lineHeight: 38,
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
    paddingBottom: spacing.lg,
  },
  // While the keyboard is open, the photo/polaroid are hidden (see
  // keyboardOverlay below) and this card is the only thing left in the
  // hero -- center it instead of pinning it to the bottom, so it doesn't
  // read as glued to the keyboard's top edge.
  heroContentCompact: {
    justifyContent: "center",
  },
  heroCardCompact: {
    paddingVertical: spacing.lg,
  },
  // Solid cover over Bosco's photo while the keyboard is up -- painted as
  // a sibling here (not baked into BoscoHero) so it sits above the image/
  // scrim layers but below heroContent, matching colors.ink so it reads
  // as an intentional dark backdrop rather than a missing image.
  keyboardOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.ink,
  },
  compactHint: {
    fontFamily: font.headingBold,
    fontSize: 15,
    lineHeight: 21,
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
    marginTop: spacing.sm,
  },
  polaroid: {
    position: "absolute",
    top: 130,
    right: 26,
    width: 118,
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: spacing.sm,
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
    backgroundColor: colors.parchmentBg,
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  polaroidPlaceholderText: {
    fontFamily: font.headingBold,
    fontSize: 14,
    lineHeight: 20,
    color: colors.fieldMuted,
    textAlign: "center",
    paddingHorizontal: 6,
  },
  polaroidCaption: {
    fontFamily: font.serifItalic,
    fontSize: 12,
    color: "#555",
    textAlign: "center",
    marginTop: 6,
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
    padding: spacing.md,
  },
  heroCardLabel: {
    fontFamily: font.headingBold,
    fontSize: 16,
    lineHeight: 22,
    color: "rgba(255,255,255,0.8)",
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  container: {
    flex: 1,
    backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  successIcon: {
    width: 69,
    height: 69,
    marginBottom: 12,
    tintColor: colors.fieldGreen,
  },
  title: {
    fontFamily: font.headingBold,
    fontSize: 34,
    lineHeight: 47,
    color: colors.ink,
    marginBottom: spacing.md,
    textAlign: "center",
  },
  titleInput: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    borderRadius: radius.md,
    padding: 12,
    fontSize: 16,
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
    fontFamily: font.headingBold,
    fontSize: 16,
    lineHeight: 22,
    color: "#fff",
  },
  doneBtnDisabled: {
    backgroundColor: colors.fieldBorder,
  },
  doneBtn: {
    backgroundColor: colors.fieldGreen,
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: radius.md,
    width: "100%",
  },
  doneBtnText: {
    fontFamily: font.headingBold,
    color: colors.parchmentSurface,
    fontSize: 22,
    lineHeight: 29,
    textAlign: "center",
  },
  discardBtn: {
    marginTop: 10,
    padding: 6,
  },
  discardBtnText: {
    fontFamily: font.headingBold,
    color: colors.danger,
    fontSize: 16,
    lineHeight: 22,
    textAlign: "center",
  },
  shareDesc: {
    fontFamily: font.headingBold,
    fontSize: 16,
    lineHeight: 22,
    color: colors.fieldMuted,
    marginTop: 2,
  },
  loadingText: {
    fontFamily: font.serifItalic,
    color: colors.fieldMuted,
    marginTop: spacing.md,
    fontSize: type.body,
  },
});
