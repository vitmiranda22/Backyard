// Cities bottom sheet — shows the caller's explored cells grouped by
// city (GET /explored-cells/cities), with a real percentage only when a
// boundary has been mapped for that city (see
// backend/scripts/map_region_boundaries.py) -- most won't have one yet,
// which is the expected common state, not an error.
// Structurally mirrors ReportModal.tsx (same transparent/slide Modal +
// scrim + sheet + handle pattern) for visual consistency.

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import { colors, font, radius, type, spacing } from "../theme";
import { ExploredCity } from "../services/api";

interface CitiesSheetProps {
  visible: boolean;
  onClose: () => void;
  cities: ExploredCity[];
  loading: boolean;
  failed: boolean;
}

export default function CitiesSheet({ visible, onClose, cities, loading, failed }: CitiesSheetProps) {
  const { t } = useTranslation();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>{t("cities.title")}</Text>
          <Text style={styles.subtitle}>{t("cities.subtitle")}</Text>

          {loading ? (
            <View style={styles.stateBox}>
              <ActivityIndicator color={colors.fieldGreen} />
              <Text style={styles.stateText}>{t("cities.loading")}</Text>
            </View>
          ) : failed ? (
            <View style={styles.stateBox}>
              <Text style={styles.stateText}>{t("cities.failedToLoad")}</Text>
            </View>
          ) : cities.length === 0 ? (
            <View style={styles.stateBox}>
              <Text style={styles.stateText}>{t("cities.empty")}</Text>
            </View>
          ) : (
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              {cities.map((c) => (
                <View key={c.city} style={styles.row} testID="city-row">
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
              ))}
            </ScrollView>
          )}

          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t("cities.closeA11y")}
          >
            <Text style={styles.closeText}>{t("cities.closeA11y")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: "rgba(36, 29, 18, 0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.parchmentSurface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    maxHeight: "72%",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.fieldBorder,
    alignSelf: "center",
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: font.serif,
    fontSize: type.title,
    color: colors.ink,
    textAlign: "center",
  },
  subtitle: {
    fontFamily: font.sans,
    fontSize: type.caption,
    color: colors.fieldMuted,
    textAlign: "center",
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  stateBox: {
    paddingVertical: spacing.xl,
    alignItems: "center",
    gap: spacing.sm,
  },
  stateText: {
    fontFamily: font.sans,
    fontSize: type.label,
    color: colors.fieldMuted,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
  },
  list: {
    marginBottom: spacing.sm,
  },
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
  closeBtn: {
    borderRadius: radius.pill,
    paddingVertical: 14,
    marginTop: spacing.xs,
  },
  closeText: {
    fontFamily: font.sansBold,
    fontSize: type.body,
    color: colors.fieldGreen,
    textAlign: "center",
  },
});
