// Report reason picker — a themed bottom sheet replacing the raw native
// Alert.alert action sheet previously used for both a tour's "Report" link
// (RouteDetailScreen) and a comment's report action (CommentsSection). The
// native sheet rendered in the OS's default system font/colors, which stood
// out against the rest of the app's parchment/Field Guide look.

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal } from "react-native";
import { useTranslation } from "react-i18next";
import { colors, font, radius, type, spacing } from "../theme";
import { ReportReason } from "../services/api";

interface ReportModalProps {
  visible: boolean;
  onCancel: () => void;
  onSelectReason: (reason: ReportReason) => void;
}

const REASONS: { value: ReportReason; labelKey: string }[] = [
  { value: "inaccurate", labelKey: "report.reasonInaccurate" },
  { value: "offensive", labelKey: "report.reasonOffensive" },
  { value: "spam", labelKey: "report.reasonSpam" },
  { value: "other", labelKey: "report.reasonOther" },
];

export default function ReportModal({ visible, onCancel, onSelectReason }: ReportModalProps) {
  const { t } = useTranslation();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.scrim}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>{t("report.title")}</Text>
          <Text style={styles.body}>{t("report.body")}</Text>

          {REASONS.map((r) => (
            <TouchableOpacity
              key={r.value}
              style={styles.reasonBtn}
              onPress={() => onSelectReason(r.value)}
              accessibilityRole="button"
              accessibilityLabel={t(r.labelKey)}
            >
              <Text style={styles.reasonText}>{t(r.labelKey)}</Text>
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel={t("common.cancel")}
          >
            <Text style={styles.cancelText}>{t("common.cancel")}</Text>
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
    marginBottom: spacing.xs,
  },
  body: {
    fontFamily: font.sans,
    fontSize: type.label,
    color: colors.fieldMuted,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  reasonBtn: {
    backgroundColor: colors.parchmentBg,
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    borderRadius: radius.pill,
    paddingVertical: 14,
    marginBottom: spacing.sm,
  },
  reasonText: {
    fontFamily: font.sansMedium,
    fontSize: type.body,
    color: colors.ink,
    textAlign: "center",
  },
  cancelBtn: {
    borderRadius: radius.pill,
    paddingVertical: 14,
    marginTop: spacing.xs,
  },
  cancelText: {
    fontFamily: font.sansBold,
    fontSize: type.body,
    color: colors.fieldGreen,
    textAlign: "center",
  },
});
