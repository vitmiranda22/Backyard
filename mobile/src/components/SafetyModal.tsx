// Pre-walk safety reminder — shown every time a tour starts (see
// ActiveTourScreen's init()), on top of whatever's loading underneath.
// Purely a visual overlay: dismissing it doesn't gate or delay the actual
// start-tour/narration calls, which keep running in the background
// regardless of whether this is still open.

import React from "react";
import { View, Text, Image, StyleSheet, Modal, TouchableOpacity } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { colors, font, radius } from "../theme";

// Bosco, the app's mascot, checking both ways before crossing -- matches
// the "before you walk" safety framing. Full-bleed hero, same gradient-
// scrim template used across the other host-layer screens.
const MASCOT_IMAGE = require("../../assets/bosco-safety.png");

interface SafetyModalProps {
  visible: boolean;
  onDismiss: () => void;
}

const TIP_ICONS = ["🚦", "👀", "🎧", "📱", "🌙"];

export default function SafetyModal({ visible, onDismiss }: SafetyModalProps) {
  const { t } = useTranslation();

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
        <Image source={MASCOT_IMAGE} style={styles.bg} resizeMode="cover" />

        <LinearGradient colors={["rgba(10,12,18,0.55)", "rgba(10,12,18,0)"]} style={styles.topScrim} />
        <Text style={styles.topTitle}>{t("activeTour.safety.title")}</Text>

        <LinearGradient
          colors={["rgba(10,12,18,0)", "rgba(10,12,18,0)", "rgba(10,12,18,0.72)", "rgba(10,12,18,0.95)"]}
          locations={[0, 0.78, 0.9, 1]}
          style={StyleSheet.absoluteFill}
        />

        <View style={styles.content}>
          {TIP_ICONS.map((icon, i) => (
            <View key={i} style={styles.tip}>
              <Text style={styles.tipIcon}>{icon}</Text>
              <Text style={styles.tipText}>{t(`activeTour.safety.tip${i + 1}`)}</Text>
            </View>
          ))}

          <TouchableOpacity
            style={styles.cta}
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel={t("activeTour.safety.cta")}
          >
            <Text style={styles.ctaText}>{t("activeTour.safety.cta")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.text,
  },
  bg: {
    ...StyleSheet.absoluteFillObject,
  },
  topScrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "22%",
  },
  topTitle: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 56,
    paddingHorizontal: 24,
    fontFamily: font.display,
    fontSize: 32,
    lineHeight: 36,
    fontWeight: "700",
    color: "#fff",
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
    gap: 8,
    alignItems: "flex-start",
    marginBottom: 6,
  },
  tipIcon: {
    fontSize: 14,
    width: 20,
    textAlign: "center",
  },
  tipText: {
    flex: 1,
    fontSize: 12.5,
    color: "#fff",
    lineHeight: 17,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    padding: 15,
    marginTop: 10,
  },
  ctaText: {
    textAlign: "center",
    color: colors.accentText,
    fontWeight: "700",
    fontSize: 15,
  },
});
