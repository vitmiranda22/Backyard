// Onboarding — shown once, on first-ever launch after login. Persisted via
// expo-secure-store (already linked for auth tokens, so this needs no new
// native dependency / build).

import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { colors, font, radius } from "../theme";
import { tap } from "../services/haptics";

const CARD_KEYS = ["card1", "card2", "card3", "card4"];
const CARD_EMOJI = ["🚶", "🎭", "🗺️", "✨"];

interface OnboardingScreenProps {
  onDone: () => void;
}

export default function OnboardingScreen({ onDone }: OnboardingScreenProps) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const isLast = index === CARD_KEYS.length - 1;

  function handleNext() {
    tap();
    if (isLast) {
      onDone();
    } else {
      setIndex(index + 1);
    }
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={onDone} accessibilityRole="button" accessibilityLabel={t("onboarding.skipA11y")}>
        <Text style={styles.skip}>{t("onboarding.skip")}</Text>
      </TouchableOpacity>

      <View style={styles.content}>
        <Text style={styles.emoji}>{CARD_EMOJI[index]}</Text>
        <Text style={styles.title}>{t(`onboarding.${CARD_KEYS[index]}.title`)}</Text>
        <Text style={styles.body}>{t(`onboarding.${CARD_KEYS[index]}.body`)}</Text>
      </View>

      <View style={styles.dots}>
        {CARD_KEYS.map((_, i) => (
          <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>

      <TouchableOpacity
        style={styles.nextBtn}
        onPress={handleNext}
        accessibilityRole="button"
        accessibilityLabel={isLast ? t("onboarding.getStartedA11y") : t("onboarding.next")}
      >
        <Text style={styles.nextBtnText}>{isLast ? t("onboarding.getStarted") : t("onboarding.next")}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: 24,
    paddingTop: 60,
    justifyContent: "space-between",
  },
  skip: {
    alignSelf: "flex-end",
    color: colors.muted,
    fontSize: 14,
    fontWeight: "600",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emoji: {
    fontSize: 56,
    marginBottom: 16,
  },
  title: {
    fontFamily: font.display,
    fontSize: 26,
    color: colors.text,
    textAlign: "center",
    marginBottom: 12,
  },
  body: {
    fontSize: 15,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 12,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginBottom: 24,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  dotActive: {
    backgroundColor: colors.accent,
    width: 20,
  },
  nextBtn: {
    backgroundColor: colors.accent,
    padding: 16,
    borderRadius: radius.md,
  },
  nextBtnText: {
    color: colors.accentText,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
  },
});
