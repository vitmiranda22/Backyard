// Shared empty/failed-state view -- an icon or mascot image, a message,
// and an optional retry button. Used both for genuinely-empty states
// (no retry, nothing to retry) and failed-fetch states (retry re-runs
// whatever load failed). Two layouts: `fill` (the default) centers
// itself in whatever flex:1 space its parent gives it -- a full screen,
// or a FlatList's ListEmptyComponent slot; non-fill sits inline inside
// an already-padded container (NarrationCard's card body).

import React from "react";
import { View, Text, Image, ImageSourcePropType, TouchableOpacity, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { colors, font, radius, type, spacing } from "../theme";

interface EmptyStateProps {
  image?: ImageSourcePropType;
  imageAccessibilityLabel?: string;
  imageSize?: number;
  emoji?: string;
  message: string;
  isError?: boolean;
  onRetry?: () => void;
  onSecondaryAction?: () => void;
  secondaryLabel?: string;
  fill?: boolean;
}

export default function EmptyState({
  image,
  imageAccessibilityLabel,
  imageSize = 74,
  emoji,
  message,
  isError,
  onRetry,
  onSecondaryAction,
  secondaryLabel,
  fill = true,
}: EmptyStateProps) {
  const { t } = useTranslation();

  return (
    <View style={fill ? styles.fillContainer : styles.inlineContainer}>
      {image && (
        <Image
          source={image}
          style={[styles.image, { width: imageSize, height: imageSize, borderRadius: imageSize / 2 }]}
          accessibilityLabel={imageAccessibilityLabel}
        />
      )}
      {emoji && <Text style={styles.emoji}>{emoji}</Text>}
      <Text style={[styles.message, isError && styles.messageError]}>{message}</Text>

      {onRetry && fill && (
        <TouchableOpacity
          style={styles.retryBtn}
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel={t("common.retry")}
        >
          <Text style={styles.retryBtnText}>{t("common.retry")}</Text>
        </TouchableOpacity>
      )}

      {onRetry && !fill && (
        <TouchableOpacity
          style={styles.retryLink}
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel={t("common.retry")}
        >
          <Image source={require("../../assets/icons/retry.png")} style={styles.retryLinkIcon} resizeMode="contain" />
          <Text style={styles.retryLinkText}>{t("common.retry")}</Text>
        </TouchableOpacity>
      )}

      {onSecondaryAction && (
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={onSecondaryAction}
          accessibilityRole="button"
          accessibilityLabel={secondaryLabel}
        >
          <Text style={styles.secondaryBtnText}>{secondaryLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fillContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  inlineContainer: {
    alignItems: "center",
    padding: 12,
  },
  image: {
    marginBottom: 14,
  },
  emoji: {
    fontSize: 37,
    marginBottom: 14,
  },
  message: {
    fontFamily: font.serifItalic,
    fontSize: type.label,
    color: colors.fieldMuted,
    textAlign: "center",
    lineHeight: 22,
  },
  messageError: {
    color: colors.danger,
    fontWeight: "600",
  },
  retryBtn: {
    backgroundColor: colors.ink,
    borderRadius: radius.md,
    paddingHorizontal: 26,
    paddingVertical: 13,
    marginTop: spacing.md,
  },
  retryBtnText: {
    fontFamily: font.headingBold,
    color: colors.parchmentSurface,
    fontSize: 20,
    lineHeight: 26,
    textAlign: "center",
  },
  retryLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    padding: 6,
  },
  retryLinkIcon: {
    width: 15,
    height: 15,
    tintColor: colors.fieldGreen,
  },
  retryLinkText: {
    fontFamily: font.headingBold,
    color: colors.fieldGreen,
    fontSize: 16,
    lineHeight: 22,
    textAlign: "center",
  },
  secondaryBtn: {
    marginTop: 10,
    padding: spacing.xs,
  },
  secondaryBtnText: {
    fontFamily: font.headingBold,
    color: colors.fieldMuted,
    fontSize: 15,
    lineHeight: 21,
    textAlign: "center",
  },
});
