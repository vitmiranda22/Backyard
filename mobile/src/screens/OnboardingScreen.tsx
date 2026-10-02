// Onboarding — shown once, on first-ever launch after login. Persisted via
// expo-secure-store (already linked for auth tokens, so this needs no new
// native dependency / build).
//
// Cards 2-5 preview the actual on-screen elements they're explaining (the
// Home FAB row, the real WaypointCompass widget, the real ask-question
// footer, a real Badges/Challenge crop) instead of a generic icon, so
// they're recognizable the moment the walker sees the real thing.

import React, { useState } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { colors, font, radius, type, spacing } from "../theme";
import { tap } from "../services/haptics";
import BoscoHero from "../components/BoscoHero";
import WaypointCompass from "../components/WaypointCompass";

const CARD_KEYS = ["card1", "card2", "card3", "card4", "card5", "card6"];

// Holding a "Welcome Backyard" sign -- card 1 only.
const WELCOME_IMAGE = require("../../assets/bosco-onboarding-welcome.jpg");
// Send-off pose, shared with Login/Signup for continuity -- card 6 only.
const SENDOFF_IMAGE = require("../../assets/bosco-sendoff.jpg");

function HomeStartPreview({ callout }: { callout: string }) {
  return (
    <View style={styles.previewCard}>
      <View style={styles.fabRowPreview}>
        <View style={styles.fabPreviewItem}>
          <View style={styles.fabSecondaryPreview}>
            <Image source={require("../../assets/icons/map.png")} style={styles.fabIconSmall} resizeMode="contain" />
          </View>
        </View>
        <View style={styles.fabPreviewItem}>
          <View style={styles.calloutRing} />
          <View style={styles.fabPrimaryPreview}>
            <Image source={require("../../assets/icons/explore.png")} style={styles.fabIconPrimary} resizeMode="contain" />
          </View>
        </View>
        <View style={styles.fabPreviewItem}>
          <View style={styles.fabSecondaryPreview}>
            <Image source={require("../../assets/icons/journal.png")} style={styles.fabIconSmall} resizeMode="contain" />
          </View>
        </View>
      </View>
      <Text style={styles.previewCallout}>↑ {callout}</Text>
    </View>
  );
}

function CompassStartPreview({ callout }: { callout: string }) {
  return (
    <View style={[styles.previewCard, styles.mapPreviewBg]}>
      <View style={styles.mapPreviewRoadH} />
      <View style={styles.mapPreviewRoadV} />
      <View style={styles.mapPreviewPin} />
      <View style={styles.compassPreviewWrap}>
        <WaypointCompass bearingDeg={-35} distanceLabel="68m · NE" />
      </View>
      <Text style={[styles.previewCallout, styles.previewCalloutOnMap]}>↑ {callout}</Text>
    </View>
  );
}

function AskButtonPreview({ hint, pro, callout }: { hint: string; pro: string; callout: string }) {
  return (
    <View style={[styles.previewCard, styles.previewCardFooter]}>
      <View style={styles.askBtnWrap}>
        <View style={styles.askBtnPreview}>
          <Image source={require("../../assets/icons/ask_question_mic.png")} style={styles.askBtnPreviewIcon} resizeMode="contain" />
        </View>
        <View style={styles.askProBadgePreview}>
          <Text style={styles.askProBadgePreviewText}>{pro}</Text>
        </View>
      </View>
      <Text style={styles.askHintPreview}>{hint}</Text>
      <Text style={[styles.previewCallout, styles.previewCalloutStatic]}>↑ {callout}</Text>
    </View>
  );
}

function CollectPreview({
  badgesLabel,
  challengeHeading,
  challengeCompleted,
  challengeTitle,
}: {
  badgesLabel: string;
  challengeHeading: string;
  challengeCompleted: string;
  challengeTitle: string;
}) {
  return (
    <View style={styles.previewCard}>
      <Text style={styles.previewSectionLabel}>{badgesLabel}</Text>
      <View style={styles.previewBadgeRow}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={styles.previewBadgeChip}>
            <Image source={require("../../assets/icons/lock.png")} style={styles.previewBadgeLockIcon} resizeMode="contain" />
          </View>
        ))}
      </View>
      <View style={styles.previewChallengeCard}>
        <View style={styles.previewChallengeTop}>
          <Text style={styles.previewChallengeLabel}>{challengeHeading}</Text>
          <Text style={styles.previewChallengeCompleted}>{challengeCompleted}</Text>
        </View>
        <Text style={styles.previewChallengeTitle}>{challengeTitle}</Text>
        <View style={styles.previewChallengeTrack}>
          <View style={[styles.previewChallengeFill, { width: "0%" }]} />
        </View>
      </View>
    </View>
  );
}

interface OnboardingScreenProps {
  onDone: () => void;
}

export default function OnboardingScreen({ onDone }: OnboardingScreenProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const isLast = index === CARD_KEYS.length - 1;
  const isWelcomeCard = index === 0;
  const isSendoffCard = isLast;

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
    const cardKey = CARD_KEYS[index];
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

  const cardKey = CARD_KEYS[index];

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={onDone} accessibilityRole="button" accessibilityLabel={t("onboarding.skipA11y")}>
        <Text style={styles.skip}>{t("onboarding.skip")}</Text>
      </TouchableOpacity>

      <View style={styles.content}>
        {index === 1 && <HomeStartPreview callout={t("onboarding.card2.callout")} />}
        {index === 2 && <CompassStartPreview callout={t("onboarding.card3.callout")} />}
        {index === 3 && (
          <AskButtonPreview
            hint={t("activeTour.holdToAsk")}
            pro={t("common.pro")}
            callout={t("onboarding.card4.callout")}
          />
        )}
        {index === 4 && (
          <CollectPreview
            badgesLabel={t("profile.badges")}
            challengeHeading={t("home.challengeHeading")}
            challengeCompleted={t("home.challengeCompleted", { count: 0 })}
            challengeTitle={t("challenges.weekly_blocks.label", { count: 5 })}
          />
        )}
        <Text style={styles.title}>{t(`onboarding.${cardKey}.title`)}</Text>
        <Text style={styles.body}>{t(`onboarding.${cardKey}.body`)}</Text>
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
    fontFamily: font.headingBold,
    color: "rgba(255,255,255,0.9)",
    fontSize: 18,
    lineHeight: 25,
  },
  welcomeTitle: {
    fontFamily: font.headingBold,
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
    fontFamily: font.headingBold,
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
  title: {
    fontFamily: font.headingBold,
    fontSize: 28,
    lineHeight: 37,
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
    fontFamily: font.headingBold,
    color: colors.parchmentSurface,
    textAlign: "center",
    fontSize: 23,
    lineHeight: 32,
  },

  // Shared chrome for the cards 2-5 real-UI preview crops.
  previewCard: {
    width: "100%",
    borderRadius: radius.md,
    marginBottom: spacing.md,
    overflow: "hidden",
  },
  previewCallout: {
    position: "absolute",
    bottom: 10,
    alignSelf: "center",
    fontFamily: font.sansBold,
    fontSize: 11,
    color: colors.fieldGreen,
    backgroundColor: colors.parchmentSurface,
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  previewCalloutOnMap: {
    bottom: 8,
  },
  previewCalloutStatic: {
    position: "relative",
    bottom: 0,
    marginTop: spacing.sm,
  },

  // Card 2 — real Home FAB row, Explore circled.
  fabRowPreview: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "flex-end",
    gap: 26,
    backgroundColor: colors.parchmentBg,
    paddingTop: 30,
    paddingBottom: 44,
    paddingHorizontal: 10,
  },
  fabPreviewItem: {
    position: "relative",
  },
  calloutRing: {
    position: "absolute",
    top: -6,
    left: -6,
    right: -6,
    bottom: 12,
    borderWidth: 2,
    borderColor: colors.fieldGreen,
    borderStyle: "dashed",
    borderRadius: 44,
  },
  fabSecondaryPreview: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.parchmentSurface,
    borderWidth: 1.5,
    borderColor: colors.fieldBorder,
    justifyContent: "center",
    alignItems: "center",
  },
  fabIconSmall: {
    width: 24,
    height: 24,
    tintColor: colors.fieldMuted,
  },
  fabPrimaryPreview: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.ink,
    justifyContent: "center",
    alignItems: "center",
  },
  fabIconPrimary: {
    width: 34,
    height: 34,
    tintColor: colors.parchmentSurface,
  },

  // Card 3 — a tiny map with the real WaypointCompass widget on it.
  mapPreviewBg: {
    height: 150,
    backgroundColor: "#DCE3D1",
    position: "relative",
  },
  mapPreviewRoadH: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "46%",
    height: 10,
    backgroundColor: "#C9D4BA",
  },
  mapPreviewRoadV: {
    position: "absolute",
    left: "38%",
    top: 0,
    bottom: 0,
    width: 10,
    backgroundColor: "#C9D4BA",
  },
  mapPreviewPin: {
    position: "absolute",
    left: "34%",
    top: "41%",
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.fieldGreen,
    borderWidth: 2,
    borderColor: colors.parchmentSurface,
  },
  compassPreviewWrap: {
    position: "absolute",
    top: 10,
    right: 10,
  },

  // Card 4 — the real ask-question footer.
  previewCardFooter: {
    backgroundColor: colors.parchmentSurface,
    borderWidth: 1,
    borderColor: colors.fieldBorderSoft,
    alignItems: "center",
    paddingTop: 22,
    paddingBottom: 14,
  },
  askBtnWrap: {
    position: "relative",
  },
  askBtnPreview: {
    width: 69,
    height: 69,
    borderRadius: 38,
    backgroundColor: colors.ink,
    justifyContent: "center",
    alignItems: "center",
  },
  askBtnPreviewIcon: {
    width: 28,
    height: 28,
    tintColor: colors.parchmentSurface,
  },
  askProBadgePreview: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: colors.fieldGreen,
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  askProBadgePreviewText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.parchmentSurface,
  },
  askHintPreview: {
    marginTop: 8,
    fontFamily: font.headingBold,
    fontSize: 14,
    color: colors.fieldMuted,
  },

  // Card 5 — a real Badges row + Challenge card crop.
  previewSectionLabel: {
    fontFamily: font.headingBold,
    fontSize: 18,
    lineHeight: 25,
    color: colors.fieldMuted,
    marginBottom: spacing.sm,
    textAlign: "center",
  },
  previewBadgeRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginBottom: spacing.md,
  },
  previewBadgeChip: {
    width: 38,
    height: 38,
    borderRadius: 20,
    backgroundColor: colors.parchmentSurface,
    borderWidth: 1.5,
    borderColor: colors.fieldBorder,
    justifyContent: "center",
    alignItems: "center",
  },
  previewBadgeLockIcon: {
    width: 15,
    height: 15,
    tintColor: colors.fieldMuted,
  },
  previewChallengeCard: {
    backgroundColor: colors.parchmentSurface,
    borderWidth: 1.5,
    borderColor: "#E3B15C",
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  previewChallengeTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  previewChallengeLabel: {
    fontFamily: font.sansBold,
    fontSize: 11,
    color: "#B4791F",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  previewChallengeCompleted: {
    fontFamily: font.sansMedium,
    fontSize: 10,
    color: colors.fieldMuted,
  },
  previewChallengeTitle: {
    fontFamily: font.heading,
    fontSize: 16,
    color: colors.ink,
    marginBottom: 6,
  },
  previewChallengeTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.fieldBorderSoft,
    overflow: "hidden",
  },
  previewChallengeFill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: "#E3B15C",
  },
});
