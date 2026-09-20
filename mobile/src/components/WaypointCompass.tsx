// Waypoint compass — a quiet parchment badge with a single hand-drawn ink
// arrow icon that rotates to point toward wherever the current block was
// triggered, like a literal N/E/S/W compass face. Matches the flat, plain
// FAB icon language used on Home instead of standing out as its own
// separate "gadget" look (the previous version was a deliberately dark/
// neon "video-game HUD" badge; before the real icon existed, an even
// earlier pass tried a CSS border-triangle arrow, which read as a blunt
// solid wedge rather than a recognizable arrow).

import React from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { colors, font } from "../theme";

const ARROW_ICON = require("../../assets/icons/compass_arrow.png");

interface WaypointCompassProps {
  bearingDeg: number; // relative to current device heading, 0 = straight ahead/up
  distanceLabel: string; // e.g. "42m · NE"
}

export default function WaypointCompass({ bearingDeg, distanceLabel }: WaypointCompassProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.badge}>
        <Image
          source={ARROW_ICON}
          style={[styles.arrow, { transform: [{ rotate: `${bearingDeg}deg` }] }]}
          resizeMode="contain"
        />
      </View>
      <Text style={styles.label}>{distanceLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
  },
  badge: {
    width: 69,
    height: 69,
    borderRadius: 35,
    backgroundColor: colors.parchmentSurface,
    borderWidth: 1.5,
    borderColor: colors.fieldBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  // The source art's real ink content is a tall, narrow sliver (146x512,
  // padded out to a square 512x512 canvas like the rest of this icon set)
  // -- sized to that actual aspect ratio (~0.285) rather than a square box,
  // or `resizeMode="contain"` would shrink it down to fit the square and
  // leave a ~10px-wide arrow, too thin to read at this size.
  arrow: {
    width: 15,
    height: 54,
    tintColor: colors.ink,
  },
  label: {
    marginTop: 6,
    fontFamily: font.headingBold,
    fontSize: 16,
    lineHeight: 22,
    color: colors.ink,
  },
});
