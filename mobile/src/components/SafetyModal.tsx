// Pre-walk safety reminder — shown every time a tour starts (see
// ActiveTourScreen's init()), on top of whatever's loading underneath.
// Doesn't gate or delay the actual start-tour/narration calls, which keep
// running in the background regardless of whether this is still open --
// but it DOES double as the tour's loading screen: tapping the CTA before
// the map/first block are ready doesn't dismiss immediately, it switches
// to a brief "still finding your first story" state and auto-continues
// once isReady flips true, so the walker never sees the bare map/loading
// placeholder underneath mid-transition.

import React, { useState, useEffect } from "react";
import { View, Text, Image, StyleSheet, Modal, TouchableOpacity, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import { colors, font, radius, type, spacing } from "../theme";
import BoscoHero from "./BoscoHero";

// Bosco, the app's mascot, checking both ways before crossing -- matches
// the "before you walk" safety framing. Full-bleed hero, same gradient-
// scrim template used across the other host-layer screens.
const MASCOT_IMAGE = require("../../assets/bosco-safety.jpg");

interface SafetyModalProps {
  visible: boolean;
  onDismiss: () => void;
  // True once the map/first block are actually ready to show. Defaults to
  // true so any other caller (tests, a future reuse) keeps today's
  // dismiss-immediately behavior unless it opts into the gating.
  isReady?: boolean;
}

// "General awareness" has no real icon yet -- emoji fallback per the
// ship-with-placeholders call, swap in real art via OTA once it exists.
const TIP_ICONS: (any | null)[] = [
  require("../../assets/icons/traffic_awareness.png"),
  null,
  require("../../assets/icons/headphones.png"),
  require("../../assets/icons/phone_distraction.png"),
  require("../../assets/icons/night_walking.png"),
];
const TIP_EMOJI_FALLBACK = ["🚦", "👀", "🎧", "📱", "🌙"];

export default function SafetyModal({ visible, onDismiss, isReady = true }: SafetyModalProps) {
  const { t } = useTranslation();
  const [waiting, setWaiting] = useState(false);

  // The walker already tapped "let's walk" while it wasn't ready yet --
  // continue the moment it is, without needing a second tap.
  useEffect(() => {
    if (waiting && isReady) {
      setWaiting(false);
      onDismiss();
    }
  }, [waiting, isReady, onDismiss]);

  function handlePress() {
    if (isReady) {
      onDismiss();
    } else {
      setWaiting(true);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      // No-op on purpose -- Android's hardware back button shouldn't
      // silently dismiss a safety notice any more than tapping the scrim
      // should. The only way out is the CTA button below.
      onRequestClose={() => {}}
    >
      <View style={styles.container}>
        <BoscoHero
          image={MASCOT_IMAGE}
          imageTopOffset="-65%"
          topScrim={{ opacity: 0.55, heightPercent: "22%" }}
          scrimColors={["rgba(10,12,18,0)", "rgba(10,12,18,0)", "rgba(10,12,18,0.72)", "rgba(10,12,18,0.95)"]}
          scrimLocations={[0, 0.78, 0.9, 1]}
        >
          <Text style={styles.topTitle}>{t("activeTour.safety.title")}</Text>

          <View style={styles.content}>
            {TIP_ICONS.map((icon, i) => (
              <View key={i} style={styles.tip}>
                {icon ? (
                  <Image source={icon} style={styles.tipIconImage} resizeMode="contain" />
                ) : (
                  <Text style={styles.tipIcon}>{TIP_EMOJI_FALLBACK[i]}</Text>
                )}
                <Text style={styles.tipText}>{t(`activeTour.safety.tip${i + 1}`)}</Text>
              </View>
            ))}

            <TouchableOpacity
              style={styles.cta}
              onPress={handlePress}
              disabled={waiting}
              accessibilityRole="button"
              accessibilityLabel={t("activeTour.safety.cta")}
            >
              {waiting ? (
                <View style={styles.ctaWaitingRow}>
                  <ActivityIndicator color={colors.parchmentSurface} />
                  <Text style={styles.ctaText}>{t("activeTour.safety.preparingWalk")}</Text>
                </View>
              ) : (
                <Text style={styles.ctaText}>{t("activeTour.safety.cta")}</Text>
              )}
            </TouchableOpacity>
          </View>
        </BoscoHero>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.ink,
  },
  topTitle: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 56,
    paddingHorizontal: spacing.lg,
    fontFamily: font.headingBold,
    fontSize: 43,
    lineHeight: 45,
    color: "#fff",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 14,
  },
  content: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 22,
    paddingBottom: 34,
  },
  tip: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "flex-start",
    marginBottom: 6,
  },
  tipIcon: {
    fontSize: type.label,
    width: 20,
    textAlign: "center",
  },
  tipIconImage: {
    width: 22,
    height: 22,
    tintColor: "#fff",
  },
  tipText: {
    flex: 1,
    fontFamily: font.serifItalic,
    fontSize: 14,
    color: "#fff",
    lineHeight: 20,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  cta: {
    backgroundColor: colors.fieldGreen,
    borderRadius: radius.md,
    padding: 15,
    marginTop: 10,
  },
  ctaText: {
    fontFamily: font.headingBold,
    textAlign: "center",
    color: colors.parchmentSurface,
    fontSize: 21,
    lineHeight: 28,
  },
  ctaWaitingRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.sm,
  },
});
