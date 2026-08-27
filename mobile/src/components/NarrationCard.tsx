// Narration card — the bottom card showing the current narration
//
// Shows: a floating "popup" photo peeking above the card, a peek-drawer
// transcript (a few lines + tap to read the full story), and audio
// controls. Has loading and error states.

import React, { useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Modal, TouchableOpacity, ScrollView } from "react-native";
import { useTranslation } from "react-i18next";
import AudioPlayer from "./AudioPlayer";
import ZonePhoto from "./ZonePhoto";
import EmptyState from "./EmptyState";
import { colors, radius, type, spacing } from "../theme";

interface NarrationCardProps {
  isLoading: boolean;
  error: string | null;
  streetName: string | null;
  narrationText: string | null;
  audioUrl: string | null;
  imageUrl?: string | null;
  onAudioFinished?: () => void;
  onSkip?: () => void;
  onAudioError?: () => void;
  onRetry?: () => void;
}

export default function NarrationCard({
  isLoading,
  error,
  streetName,
  narrationText,
  audioUrl,
  imageUrl,
  onAudioFinished,
  onSkip,
  onAudioError,
  onRetry,
}: NarrationCardProps) {
  const { t } = useTranslation();
  const [fullTextOpen, setFullTextOpen] = useState(false);

  if (isLoading) {
    return (
      <View style={styles.card}>
        <View style={styles.content}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={styles.loadingText}>{t("narrationCard.finding")}</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.card}>
        <View style={styles.content}>
          <EmptyState message={error} isError onRetry={onRetry} fill={false} />
        </View>
      </View>
    );
  }

  if (!narrationText) {
    return (
      <View style={styles.card}>
        <View style={styles.content}>
          <Text style={styles.emptyText}>
            {t("narrationCard.walkAround")}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <View style={styles.card}>
        <View style={styles.content}>
          {/* Street name — a location label, not the content itself, so it
              reads as secondary (small-caps eyebrow) rather than competing
              with the actual story below it for the same glance. */}
          <Text style={styles.streetName}>📍 {streetName}</Text>

          {/* The narration text IS the product -- this is what someone
              opened the app to hear, so it carries the primary reading
              weight on this card, not the label above it. Peek drawer: a
              few lines, tap to read the full story in the modal below. */}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setFullTextOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t("narrationCard.readFullStoryA11y")}
          >
            <Text style={styles.narrationText} numberOfLines={5} ellipsizeMode="tail">
              {narrationText}
            </Text>
            <Text style={styles.expandHint}>{t("narrationCard.swipeUpHint")}</Text>
          </TouchableOpacity>

          {/* Audio controls */}
          <AudioPlayer
            audioUrl={audioUrl}
            onFinished={onAudioFinished}
            onSkip={onSkip}
            onError={onAudioError}
          />
        </View>
      </View>

      {/* Photo floats as a popup peeking above the card, instead of sitting
          flush inside it — tap to expand full-screen (see ZonePhoto). */}
      {imageUrl && (
        <View style={styles.photoPopup}>
          <ZonePhoto uri={imageUrl} thumbnailStyle={styles.photoImage} />
        </View>
      )}

      <Modal
        visible={fullTextOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setFullTextOpen(false)}
      >
        <View style={styles.modalScrim}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalStreetName}>📍 {streetName}</Text>
            <ScrollView style={styles.modalScroll}>
              <Text style={styles.modalText}>{narrationText}</Text>
            </ScrollView>
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setFullTextOpen(false)}
              accessibilityRole="button"
              accessibilityLabel={t("narrationCard.closeFullStoryA11y")}
            >
              <Text style={styles.modalCloseBtnText}>{t("narrationCard.close")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    // No clipping here — the popup photo needs to poke above the card.
  },
  card: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomWidth: 0,
    overflow: "hidden",
    maxHeight: 460,
  },
  photoPopup: {
    position: "absolute",
    top: -34,
    right: 18,
    transform: [{ rotate: "-4deg" }],
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.xs,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  photoImage: {
    width: 118,
    height: 88,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
  },
  content: {
    padding: spacing.md,
    paddingTop: 26,
  },
  streetName: {
    fontSize: type.caption,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: colors.muted,
    marginBottom: 10,
    maxWidth: "85%",
  },
  narrationText: {
    fontSize: type.body,
    fontWeight: "500",
    color: colors.text,
    lineHeight: 24,
  },
  expandHint: {
    fontSize: type.caption,
    fontWeight: "700",
    color: colors.accent,
    textAlign: "center",
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  loadingText: {
    color: colors.muted,
    textAlign: "center",
    marginTop: spacing.sm,
    fontSize: type.label,
  },
  emptyText: {
    color: colors.muted,
    textAlign: "center",
    fontSize: type.label,
    padding: 20,
  },
  modalScrim: {
    flex: 1,
    backgroundColor: "rgba(10, 12, 18, 0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: 20,
    maxHeight: "70%",
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: 14,
  },
  modalStreetName: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 12,
  },
  modalScroll: {
    marginBottom: spacing.md,
  },
  modalText: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 23,
  },
  modalCloseBtn: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
  },
  modalCloseBtnText: {
    textAlign: "center",
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
});
