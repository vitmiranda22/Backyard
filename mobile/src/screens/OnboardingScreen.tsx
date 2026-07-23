// Onboarding — shown once, on first-ever launch after login. Persisted via
// expo-secure-store (already linked for auth tokens, so this needs no new
// native dependency / build).

import React, { useState } from "react";
import { View, Text, TouchableOpacity, Image, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { colors, font, radius } from "../theme";
import { tap } from "../services/haptics";

const CARD_KEYS = ["card1", "card2", "card3", "card4"];
// Cards 1 and 4 (the welcome and send-off cards) render Bosco full-bleed
// instead of an emoji -- see the branches in the component below. Indices
// 0 and 3 here are placeholders, never actually read.
const CARD_EMOJI = ["🚶", "🎭", "🗺️", "✨"];

// Holding a "Welcome Backyard" sign -- card 1 only.
const WELCOME_IMAGE = require("../../assets/bosco-onboarding-welcome.png");
// Send-off pose, shared with Login/Signup for continuity -- card 4 only.
const SENDOFF_IMAGE = require("../../assets/bosco-sendoff.png");

interface OnboardingScreenProps {
  onDone: () => void;
}

export default function OnboardingScreen({ onDone }: OnboardingScreenProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const isLast = index === CARD_KEYS.length - 1;
  const isWelcomeCard = index === 0;
  const isSendoffCard = index === 3;

  function handleNext() {
    tap();
    if (isLast) {
      onDone();
    } else {
      setIndex(index + 1);
    }
  }

  const dots = (dotStyle: any, activeDotStyle: any) => (
    <View style={styles.dots}>
      {CARD_KEYS.map((_, i) => (
        <View key={i} style={[dotStyle, i === index && activeDotStyle]} />
      ))}
    </View>
  );

  if (isWelcomeCard || isSendoffCard) {
    const heroImage = isWelcomeCard ? WELCOME_IMAGE : SENDOFF_IMAGE;
    const cardKey = isWelcomeCard ? "card1" : "card4";
    return (
      <View style={styles.welcomeContainer}>
        <Image source={heroImage} style={styles.welcomeBg} resizeMode="cover" accessibilityLabel={t("login.mascotA11y")} />
        <LinearGradient
          colors={["rgba(10,12,18,0)", "rgba(10,12,18,0)", "rgba(10,12,18,0.68)", "rgba(10,12,18,0.94)"]}
          locations={[0, 0.76, 0.88, 1]}
          style={StyleSheet.absoluteFill}
        />

        <TouchableOpacity
          style={[styles.welcomeSkip, { top: Math.max(insets.top, 18) }]}
          onPress={onDone}
          accessibilityRole="button"
          accessibilityLabel={t("onboarding.skipA11y")}
        >
          <Text style={styles.welcomeSkipText}>{t("onboarding.skip")}</Text>
        </TouchableOpacity>

        <View style={[styles.welcomeContent, { paddingBottom: Math.max(insets.bottom, 24) }]}>
          <Text style={styles.welcomeTitle}>{t(`onboarding.${cardKey}.title`)}</Text>
          <Text style={styles.welcomeBody}>{t(`onboarding.${cardKey}.body`)}</Text>
          {dots(styles.dotOnDark, styles.dotActive)}
          <TouchableOpacity
            style={styles.nextBtn}
            onPress={handleNext}
            accessibilityRole="button"
            accessibilityLabel={isSendoffCard ? t("onboarding.getStartedA11y") : t("onboarding.next")}
          >
            <Text style={styles.nextBtnText}>{isSendoffCard ? t("onboarding.getStarted") : t("onboarding.next")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
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

      {dots(styles.dot, styles.dotActive)}

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
  welcomeContainer: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  welcomeBg: {
    ...StyleSheet.absoluteFillObject,
  },
  welcomeContent: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 24,
    paddingTop: 60,
  },
  welcomeSkip: {
    position: "absolute",
    right: 18,
    zIndex: 2,
  },
  welcomeSkipText: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 14,
    fontWeight: "600",
  },
  welcomeTitle: {
    fontFamily: font.display,
    fontSize: 28,
    color: "#fff",
    marginBottom: 10,
  },
  welcomeBody: {
    fontSize: 14,
    color: "rgba(255,255,255,0.85)",
    lineHeight: 21,
    marginBottom: 20,
  },
  dotOnDark: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
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
