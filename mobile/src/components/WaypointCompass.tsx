// Waypoint compass — a dark badge with glowing nested chevrons that rotate
// as a unit to point toward wherever the current block was triggered,
// like a video-game quest marker rather than a literal N/E/S/W compass
// face. Built from plain Views (border-triangle trick) so it ships without
// a new native dependency (no react-native-svg) — a true smooth-arc
// version would need one.

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../theme";

interface WaypointCompassProps {
  bearingDeg: number; // relative to current device heading, 0 = straight ahead/up
  distanceLabel: string; // e.g. "42m · NE"
}

export default function WaypointCompass({ bearingDeg, distanceLabel }: WaypointCompassProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.badge}>
        <View style={[styles.needle, { transform: [{ rotate: `${bearingDeg}deg` }] }]}>
          <View style={styles.chevronOuter} />
          <View style={styles.chevronInner} />
        </View>
      </View>
      <Text style={styles.label}>{distanceLabel}</Text>
    </View>
  );
}

const NEON = "#FF9666";

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
  },
  badge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#181A24",
    borderWidth: 1.4,
    borderColor: "rgba(255, 107, 74, 0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  needle: {
    alignItems: "center",
    justifyContent: "center",
  },
  chevronOuter: {
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderBottomWidth: 12,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: NEON,
    shadowColor: NEON,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  chevronInner: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: NEON,
    shadowColor: NEON,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    marginTop: 3,
  },
  label: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
  },
});
