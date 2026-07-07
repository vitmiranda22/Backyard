// Narration card — the bottom card showing the current narration
//
// Shows: street name, narration text (scrollable), and audio controls.
// Has loading and error states.

import React from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import AudioPlayer from "./AudioPlayer";
import { colors, radius } from "../theme";

interface NarrationCardProps {
  isLoading: boolean;
  error: string | null;
  streetName: string | null;
  narrationText: string | null;
  audioUrl: string | null;
  onAudioFinished?: () => void;
  onSkip?: () => void;
  onAudioError?: () => void;
}

export default function NarrationCard({
  isLoading,
  error,
  streetName,
  narrationText,
  audioUrl,
  onAudioFinished,
  onSkip,
  onAudioError,
}: NarrationCardProps) {
  if (isLoading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator size="small" color={colors.accent} />
        <Text style={styles.loadingText}>Finding stories about this block...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.card}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (!narrationText) {
    return (
      <View style={styles.card}>
        <Text style={styles.emptyText}>
          Walk around to hear stories about your surroundings...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      {/* Street name header */}
      <Text style={styles.streetName}>📍 {streetName}</Text>

      {/* Narration text - scrollable */}
      <ScrollView style={styles.textScroll} nestedScrollEnabled>
        <Text style={styles.narrationText}>{narrationText}</Text>
      </ScrollView>

      {/* Audio controls */}
      <AudioPlayer
        audioUrl={audioUrl}
        onFinished={onAudioFinished}
        onSkip={onSkip}
        onError={onAudioError}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomWidth: 0,
    padding: 16,
    maxHeight: 320,
  },
  streetName: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 8,
  },
  textScroll: {
    maxHeight: 120,
    marginBottom: 8,
  },
  narrationText: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
  loadingText: {
    color: colors.muted,
    textAlign: "center",
    marginTop: 8,
    fontSize: 14,
  },
  errorText: {
    color: colors.danger,
    textAlign: "center",
    fontSize: 14,
    padding: 12,
  },
  emptyText: {
    color: colors.muted,
    textAlign: "center",
    fontSize: 14,
    padding: 20,
  },
});
