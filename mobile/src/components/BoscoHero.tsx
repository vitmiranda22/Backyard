// Bosco hero — the full-bleed "oversized image + negative offset crop"
// background used behind Bosco moments (Login, Signup's method step,
// Tour Complete, Badge Gallery, error/safety screens, Onboarding's hero
// cards). Extracted from 7 near-identical hand-copied implementations
// (each with its own slightly different crop offset and scrim stops) into
// one component so those magic numbers live in one auditable place.
//
// This renders ONLY the image + scrim layers, filling whatever parent
// container the caller already has (a full-bleed screen, or a fixed-
// height band like BadgeGalleryScreen's 260px hero) — it doesn't dictate
// screen layout, that stays with each screen's own existing container.
// Content goes in as `children`, rendered on top of the scrims.

import React, { ReactNode } from "react";
import { ColorValue, Image, ImageSourcePropType, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

// Every crop offset/height in every one of the 7 original implementations
// is a percentage string ("-70%", "200%", etc.) -- this pins that down at
// the type level instead of accepting an arbitrary string.
type Percent = `${number}%`;

interface TopScrim {
  // Opacity of the near-black tint at the very top edge, fading to 0 by
  // the bottom of this band (colors are always rgba(10,12,18,X) -- no
  // file in the app has ever deviated from that base tint).
  opacity: number;
  heightPercent: Percent;
}

interface BoscoHeroProps {
  image: ImageSourcePropType;
  imageAccessibilityLabel?: string;
  // e.g. "-70%" -- how far to shift the oversized image up so the right
  // part of Bosco's pose stays in frame. Hand-tuned per source image.
  imageTopOffset: Percent;
  // Default 200% covers a full-bleed screen; BadgeGalleryScreen's short
  // 260px band needs more (268%) since the crop math is relative to the
  // container's own height, not the screen's.
  imageHeightPercent?: Percent;
  // Omit entirely for screens with no separate top scrim (Signup's
  // method step, Badge Gallery, Onboarding's hero cards).
  topScrim?: TopScrim;
  // The full-height gradient's own colors/locations -- always 3 or 4
  // stops of rgba(10,12,18,X), but the exact stops vary enough per
  // screen (darker/lighter, different fade points) that this is passed
  // through as-is rather than reduced to a smaller set of presets.
  scrimColors: readonly [ColorValue, ColorValue, ...ColorValue[]];
  scrimLocations?: readonly [number, number, ...number[]];
  children?: ReactNode;
}

export default function BoscoHero({
  image,
  imageAccessibilityLabel,
  imageTopOffset,
  imageHeightPercent = "200%",
  topScrim,
  scrimColors,
  scrimLocations,
  children,
}: BoscoHeroProps) {
  return (
    <>
      <View style={styles.bgWrap}>
        <Image
          source={image}
          style={[styles.bg, { height: imageHeightPercent, top: imageTopOffset }]}
          resizeMode="cover"
          accessibilityLabel={imageAccessibilityLabel}
        />
      </View>

      {topScrim && (
        <LinearGradient
          colors={[`rgba(10,12,18,${topScrim.opacity})`, "rgba(10,12,18,0)"]}
          style={[styles.topScrim, { height: topScrim.heightPercent }]}
        />
      )}

      <LinearGradient colors={scrimColors} locations={scrimLocations} style={StyleSheet.absoluteFill} />

      {children}
    </>
  );
}

const styles = StyleSheet.create({
  bgWrap: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  bg: {
    position: "absolute",
    width: "100%",
  },
  topScrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
});
