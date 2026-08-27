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
import { colors, radius, type } from "../theme";

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
          <Text style={styles.retryLinkText}>↻ {t("common.retry")}</Text>
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
    fontSize: 34,
    marginBottom: 14,
  },
  message: {
    fontSize: type.label,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 20,
  },
  messageError: {
    color: colors.danger,
    fontWeight: "600",
  },
  retryBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingHorizontal: 26,
    paddingVertical: 13,
    marginTop: 16,
  },
  retryBtnText: {
    color: colors.accentText,
    fontSize: 14.5,
    fontWeight: "700",
    textAlign: "center",
  },
  retryLink: {
    marginTop: 12,
    padding: 6,
  },
  retryLinkText: {
    color: colors.accent,
    fontSize: 13.5,
    fontWeight: "700",
    textAlign: "center",
  },
  secondaryBtn: {
    marginTop: 10,
    padding: 4,
  },
  secondaryBtnText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
});
