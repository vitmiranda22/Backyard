// Onboarding — shown once, on first-ever launch after login. Persisted via
// expo-secure-store (already linked for auth tokens, so this needs no new
// native dependency / build).

import React, { useState } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { colors, font, radius, type, spacing } from "../theme";
import { tap } from "../services/haptics";
import BoscoHero from "../components/BoscoHero";

const CARD_KEYS = ["card1", "card2", "card3", "card4"];
// Cards 1 and 4 (the welcome and send-off cards) render Bosco full-bleed
// instead of an icon -- see the branches in the component below. Indices
// 0 and 3 here are placeholders, never actually read.
const CARD_ICON = [
  null,
  require("../../assets/icons/sparkle.png"),
  require("../../assets/icons/explore.png"),
  null,
];

// Holding a "Welcome Backyard" sign -- card 1 only.
const WELCOME_IMAGE = require("../../assets/bosco-onboarding-welcome.jpg");
// Send-off pose, shared with Login/Signup for continuity -- card 4 only.
const SENDOFF_IMAGE = require("../../assets/bosco-sendoff.jpg");

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
    // Same oversized-image-with-negative-offset crop as LoginScreen --
    // these two images share this one style block but Bosco's face sits
    // at slightly different heights in each, so the offset switches with
    // the image instead of using one fixed value for both.
    const heroOffset = isWelcomeCard ? "-74%" : "-70%";
    return (
      <View style={styles.welcomeContainer}>
        <BoscoHero
          image={heroImage}
          imageAccessibilityLabel={t("login.mascotA11y")}
          imageTopOffset={heroOffset}
          scrimColors={["rgba(10,12,18,0)", "rgba(10,12,18,0)", "rgba(10,12,18,0.68)", "rgba(10,12,18,0.94)"]}
          scrimLocations={[0, 0.76, 0.88, 1]}
        >
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
        </BoscoHero>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={onDone} accessibilityRole="button" accessibilityLabel={t("onboarding.skipA11y")}>
        <Text style={styles.skip}>{t("onboarding.skip")}</Text>
      </TouchableOpacity>

      <View style={styles.content}>
        <View style={styles.iconRing}>
          <Image source={CARD_ICON[index]} style={styles.icon} resizeMode="contain" />
        </View>
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
    backgroundColor: colors.ink,
  },
  welcomeContent: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
    paddingTop: 60,
  },
  welcomeSkip: {
    position: "absolute",
    right: 18,
    zIndex: 2,
  },
  welcomeSkipText: {
    fontFamily: font.cursiveBold,
    color: "rgba(255,255,255,0.9)",
    fontSize: 18,
    lineHeight: 25,
  },
  welcomeTitle: {
    fontFamily: font.cursiveBold,
    fontSize: 37,
    lineHeight: 50,
    color: "#fff",
    marginBottom: 10,
  },
  welcomeBody: {
    fontFamily: font.serifItalic,
    fontSize: type.title,
    color: "rgba(255,255,255,0.88)",
    lineHeight: 23,
    marginBottom: 20,
  },
  dotOnDark: {
    width: 9,
    height: 9,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  container: {
    flex: 1,
    backgroundColor: "transparent",
    padding: spacing.lg,
    paddingTop: 60,
    justifyContent: "space-between",
  },
  skip: {
    fontFamily: font.cursiveBold,
    alignSelf: "flex-end",
    color: colors.fieldMuted,
    fontSize: 18,
    lineHeight: 25,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  iconRing: {
    width: 77,
    height: 77,
    borderRadius: 38,
    borderWidth: 1.5,
    borderColor: colors.ink,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  icon: {
    width: 37,
    height: 37,
    tintColor: colors.ink,
  },
  title: {
    fontFamily: font.cursiveBold,
    fontSize: 32,
    lineHeight: 43,
    color: colors.ink,
    textAlign: "center",
    marginBottom: 12,
  },
  body: {
    fontFamily: font.serifItalic,
    fontSize: 17,
    color: colors.fieldMuted,
    textAlign: "center",
    lineHeight: 25,
    paddingHorizontal: 12,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 4,
    backgroundColor: colors.fieldBorder,
  },
  dotActive: {
    backgroundColor: colors.fieldGreen,
    width: 20,
  },
  nextBtn: {
    backgroundColor: colors.ink,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  nextBtnText: {
    fontFamily: font.cursiveBold,
    color: colors.parchmentSurface,
    textAlign: "center",
    fontSize: 23,
    lineHeight: 32,
  },
});
