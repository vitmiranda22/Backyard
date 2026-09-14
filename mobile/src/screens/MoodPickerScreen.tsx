// Mode picker — choose your experience before starting a tour
//
// 2 free modes + 3 premium modes, laid out as stops along a winding trail —
// no colored badge pills, no preview button, just the same hand-drawn mood
// icon used everywhere else a mood is shown (Home, Journal, Route Detail).
// See the "Field Guide" design direction (mobile/mockups/) and the "Choose
// Your Story" option comparison artifact this screen was picked from
// ("The Trail"). Tapping a premium mode without an active subscription
// opens the paywall instead of starting a tour.

import React, { useEffect, useState } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { colors, font, radius, type, spacing } from "../theme";
import { tap } from "../services/haptics";
import { getCurrentLocation } from "../services/location";
import { getRichness, RichnessInfo } from "../services/api";
import { MOOD_ICONS } from "../services/moods";

const MODES = [
  { id: "time_machine", premium: false },
  { id: "hidden_city", premium: false },
  { id: "dark_side", premium: true },
  { id: "behind_scenes", premium: true },
  { id: "unfiltered", premium: true },
];

// Real curved SVG paths need react-native-svg, a native module that only
// exists starting with the build this shipped in -- OTA updates can't add
// native code to an already-installed binary. Rather than gate this on
// build version, the trail is drawn with plain Views instead: each dot in
// a segment gets its own horizontal offset following a sine curve (0 at
// both ends of the segment, peaking at the middle), so it reads as a real
// weave between markers that themselves stay in one straight column --
// and it's guaranteed to render on every build, same as the rest of the
// screen.
const DOTS_PER_SEGMENT = 7;
const TRAIL_BULGE = 16;

function dotOffset(dotIndex: number, direction: number) {
  const t = dotIndex / (DOTS_PER_SEGMENT - 1);
  return direction * TRAIL_BULGE * Math.sin(Math.PI * t);
}

interface MoodPickerProps {
  onSelect: (mood: string) => void;
  onCancel: () => void;
  isPremium: boolean;
  onRequirePremium: () => void;
}

export default function MoodPickerScreen({ onSelect, onCancel, isPremium, onRequirePremium }: MoodPickerProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [richness, setRichness] = useState<RichnessInfo | null>(null);

  useEffect(() => {
    getCurrentLocation()
      .then((loc) => getRichness(loc.lat, loc.lng))
      .then(setRichness)
      .catch(() => {
        // Silent — the richness caption is a nice-to-have, not worth a
        // toast or blocking mood selection if location isn't available yet.
      });
  }, []);

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.cancelBtn, { top: Math.max(insets.top, 54) + 12 }]}
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel={t("common.cancel")}
      >
        <Text style={styles.cancelText}>{t("common.cancel")}</Text>
      </TouchableOpacity>

      <Text style={styles.title}>{t("moodPicker.title")}</Text>
      <Text style={styles.subtitle}>{t("moodPicker.subtitle")}</Text>
      {richness && richness.tier !== "full" && (
        <Text style={styles.richnessCaption}>{richness.message}</Text>
      )}

      <View style={styles.trail}>
        {MODES.map((mode, i) => (
          <TouchableOpacity
            key={mode.id}
            style={[styles.trailStop, i === MODES.length - 1 && styles.trailStopLast]}
            onPress={() => {
              tap();
              mode.premium && !isPremium ? onRequirePremium() : onSelect(mode.id);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${t(`moods.${mode.id}.label`)}, ${mode.premium ? t("common.pro") : t("common.free")}`}
          >
            {i < MODES.length - 1 && (
              <View style={styles.trailSegment}>
                {Array.from({ length: DOTS_PER_SEGMENT }).map((_, di) => (
                  <View
                    key={di}
                    style={[
                      styles.trailSegmentDot,
                      { transform: [{ translateX: dotOffset(di, i % 2 === 0 ? 1 : -1) }] },
                    ]}
                  />
                ))}
              </View>
            )}
            {/* The trail marker IS the mood's own hand-drawn icon, in a
                circle sitting in a straight column -- the winding comes
                from the dotted segment drawn behind it, not from moving
                this. */}
            <View style={[styles.trailIconWrap, mode.premium && styles.trailIconWrapPro]}>
              <Image
                source={MOOD_ICONS[mode.id]}
                style={[styles.trailIcon, mode.premium && styles.trailIconPro]}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.modeLabel}>{t(`moods.${mode.id}.label`)}</Text>
            <Text style={styles.modeDesc}>{t(`moods.${mode.id}.desc`)}</Text>
            <Text style={[styles.tag, mode.premium && styles.tagPro]}>
              {mode.premium ? t("common.pro") : t("common.free")}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent",
    padding: 20,
    paddingTop: 60,
    justifyContent: "center",
  },
  cancelBtn: {
    position: "absolute",
    left: 20,
    zIndex: 1,
  },
  cancelText: {
    fontFamily: font.cursiveBold,
    color: colors.fieldMuted,
    fontSize: 23,
    lineHeight: 32,
    paddingRight: 6,
  },
  title: {
    fontFamily: font.cursiveBold,
    fontSize: 34,
    lineHeight: 47,
    color: colors.ink,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontFamily: font.cursive,
    fontSize: 21,
    lineHeight: 28,
    color: colors.fieldMuted,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  richnessCaption: {
    fontSize: type.caption,
    color: colors.fieldMuted,
    textAlign: "center",
    marginTop: -14,
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  trail: {
    paddingLeft: 52,
  },
  trailStop: {
    position: "relative",
    paddingBottom: 28,
  },
  trailStopLast: {
    paddingBottom: 4,
  },
  // A column of dots from just below this marker to the top of the next
  // one, each with its own sine-curve horizontal offset (see dotOffset
  // above) -- chains into one continuous weaving trail down the column.
  trailSegment: {
    position: "absolute",
    left: -30,
    top: 36,
    bottom: 6,
    width: 4,
    alignItems: "center",
    justifyContent: "space-between",
  },
  trailSegmentDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.fieldMuted,
  },
  // The trail marker IS the mood's own hand-drawn icon, in a circle sized
  // to actually hold the artwork, all sitting at the same `left` -- a
  // straight column (it's the trailSegment dots that weave, not this).
  trailIconWrap: {
    position: "absolute",
    left: -40,
    top: -2,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.parchmentSurface,
    borderWidth: 2,
    borderColor: colors.ink,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1,
  },
  trailIconWrapPro: {
    borderColor: colors.fieldGreen,
  },
  trailIcon: {
    width: 18,
    height: 18,
    tintColor: colors.ink,
  },
  trailIconPro: {
    tintColor: colors.fieldGreen,
  },
  modeLabel: {
    fontFamily: font.cursiveBold,
    fontSize: 23,
    lineHeight: 32,
    color: colors.ink,
  },
  modeDesc: {
    fontFamily: font.serifItalic,
    fontSize: 14,
    color: colors.fieldMuted,
    marginTop: 3,
    marginBottom: 6,
    lineHeight: 20,
  },
  tag: {
    fontFamily: font.cursiveBold,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.3,
    color: colors.fieldMuted,
  },
  tagPro: {
    color: colors.fieldGreen,
  },
});
