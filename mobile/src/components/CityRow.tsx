// One city's exploration row -- name, an optional progress bar + %
// badge (only when a real boundary has been mapped for that city), and a
// spot count. Extracted out of CitiesSheet.tsx so the exact same row can
// also render inside Journal's new "Places" tab (ToursScreen.tsx) without
// duplicating this JSX/styling in two places that need to look identical.

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { colors, font, radius, type, spacing } from "../theme";
import { ExploredCity } from "../services/api";

interface CityRowProps {
  city: ExploredCity;
}

export default function CityRow({ city: c }: CityRowProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.row} testID="city-row">
      <View style={styles.rowBody}>
        <Text style={styles.rowName}>{c.city}</Text>
        {c.percentage !== null && (
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${Math.min(100, Math.max(0, c.percentage))}%` }]} />
          </View>
        )}
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.rowCount}>{t(c.count === 1 ? "cities.spot" : "cities.spots", { count: c.count })}</Text>
        {c.percentage !== null ? (
          <View style={styles.pctBadge}>
            <Text style={styles.pctBadgeText}>{t("cities.percentExplored", { percent: c.percentage })}</Text>
          </View>
        ) : (
          <Text style={styles.noBoundaryText}>{t("cities.noBoundaryYet")}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.fieldBorder,
    gap: spacing.sm,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowName: {
    fontFamily: font.sansBold,
    fontSize: type.body,
    color: colors.ink,
  },
  barTrack: {
    height: 4,
    borderRadius: 4,
    backgroundColor: colors.fieldBorder,
    marginTop: spacing.xs,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    backgroundColor: colors.fieldGreen,
    borderRadius: 4,
  },
  rowRight: {
    alignItems: "flex-end",
  },
  rowCount: {
    fontFamily: font.sansBold,
    fontSize: type.label,
    color: colors.ink,
  },
  pctBadge: {
    marginTop: 3,
    backgroundColor: "rgba(60, 79, 53, 0.12)",
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  pctBadgeText: {
    fontFamily: font.sansBold,
    fontSize: 11,
    color: colors.fieldGreen,
  },
  noBoundaryText: {
    fontFamily: font.sans,
    fontSize: 11,
    fontStyle: "italic",
    color: colors.fieldMuted,
    marginTop: 3,
  },
});
