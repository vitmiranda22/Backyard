// Neighborhoods bottom sheet — shows the caller's explored cells grouped
// by neighborhood (GET /explored-cells/neighborhoods), with a real
// percentage only when a boundary has been mapped for that neighborhood
// (see backend/scripts/map_neighborhood_boundaries.py) -- most won't
// have one yet, which is the expected common state, not an error.
// Structurally mirrors ReportModal.tsx (same transparent/slide Modal +
// scrim + sheet + handle pattern) for visual consistency.

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import { colors, font, radius, type, spacing } from "../theme";
import { ExploredNeighborhood } from "../services/api";

interface NeighborhoodsSheetProps {
  visible: boolean;
  onClose: () => void;
  neighborhoods: ExploredNeighborhood[];
  loading: boolean;
  failed: boolean;
}

export default function NeighborhoodsSheet({ visible, onClose, neighborhoods, loading, failed }: NeighborhoodsSheetProps) {
  const { t } = useTranslation();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>{t("neighborhoods.title")}</Text>
          <Text style={styles.subtitle}>{t("neighborhoods.subtitle")}</Text>

          {loading ? (
            <View style={styles.stateBox}>
              <ActivityIndicator color={colors.fieldGreen} />
              <Text style={styles.stateText}>{t("neighborhoods.loading")}</Text>
            </View>
          ) : failed ? (
            <View style={styles.stateBox}>
              <Text style={styles.stateText}>{t("neighborhoods.failedToLoad")}</Text>
            </View>
          ) : neighborhoods.length === 0 ? (
            <View style={styles.stateBox}>
              <Text style={styles.stateText}>{t("neighborhoods.empty")}</Text>
            </View>
          ) : (
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              {neighborhoods.map((n) => (
                <View key={`${n.neighborhood}-${n.city}`} style={styles.row} testID="neighborhood-row">
                  <View style={styles.rowBody}>
                    <Text style={styles.rowName}>{n.neighborhood}</Text>
                    <Text style={styles.rowCity}>{n.city}</Text>
                    {n.percentage !== null && (
                      <View style={styles.barTrack}>
                        <View style={[styles.barFill, { width: `${Math.min(100, Math.max(0, n.percentage))}%` }]} />
                      </View>
                    )}
                  </View>
                  <View style={styles.rowRight}>
                    <Text style={styles.rowCount}>{t(n.count === 1 ? "neighborhoods.spot" : "neighborhoods.spots", { count: n.count })}</Text>
                    {n.percentage !== null ? (
                      <View style={styles.pctBadge}>
                        <Text style={styles.pctBadgeText}>{t("neighborhoods.percentExplored", { percent: n.percentage })}</Text>
                      </View>
                    ) : (
                      <Text style={styles.noBoundaryText}>{t("neighborhoods.noBoundaryYet")}</Text>
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
            accessibilityLabel={t("neighborhoods.closeA11y")}
          >
            <Text style={styles.closeText}>{t("neighborhoods.closeA11y")}</Text>
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
  rowCity: {
    fontFamily: font.sans,
    fontSize: type.caption,
    color: colors.fieldMuted,
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
