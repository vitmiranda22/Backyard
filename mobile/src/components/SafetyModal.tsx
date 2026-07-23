// Pre-walk safety reminder — shown every time a tour starts (see
// ActiveTourScreen's init()), on top of whatever's loading underneath.
// Purely a visual overlay: dismissing it doesn't gate or delay the actual
// start-tour/narration calls, which keep running in the background
// regardless of whether this is still open.

import React from "react";
import { View, Text, StyleSheet, Modal, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";
import { colors, font, radius } from "../theme";

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
      transparent
      animationType="slide"
      // No-op on purpose -- Android's hardware back button shouldn't
      // silently dismiss a safety notice any more than tapping the scrim
      // should. The only way out is the CTA button below.
      onRequestClose={() => {}}
    >
      <View style={styles.scrim}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>{t("activeTour.safety.title")}</Text>
          <Text style={styles.subtitle}>{t("activeTour.safety.subtitle")}</Text>

          <View style={styles.tipList}>
            {TIP_ICONS.map((icon, i) => (
              <View key={i} style={styles.tip}>
                <Text style={styles.tipIcon}>{icon}</Text>
                <Text style={styles.tipText}>{t(`activeTour.safety.tip${i + 1}`)}</Text>
              </View>
            ))}
          </View>

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
  scrim: {
    flex: 1,
    backgroundColor: "rgba(10, 12, 18, 0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: 22,
    paddingBottom: 28,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: 16,
  },
  title: {
    fontFamily: font.display,
    fontSize: 21,
    color: colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12.5,
    color: colors.muted,
    lineHeight: 18,
    marginBottom: 16,
  },
  tipList: {
    gap: 10,
    marginBottom: 20,
  },
  tip: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  tipIcon: {
    fontSize: 16,
    width: 22,
    textAlign: "center",
    marginTop: 1,
  },
  tipText: {
    flex: 1,
    fontSize: 12.5,
    color: colors.text,
    lineHeight: 18,
  },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    padding: 15,
  },
  ctaText: {
    textAlign: "center",
    color: colors.accentText,
    fontWeight: "700",
    fontSize: 15,
  },
});
