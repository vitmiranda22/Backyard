// Narration card — the bottom card showing the current narration
//
// Shows: street name, narration text (scrollable), and audio controls.
// Has loading and error states.

import React from "react";
import { View, Text, Image, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import AudioPlayer from "./AudioPlayer";
import { colors, radius } from "../theme";

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
}: NarrationCardProps) {
  if (isLoading) {
    return (
      <View style={styles.card}>
        <View style={styles.content}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={styles.loadingText}>Finding stories about this block...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.card}>
        <View style={styles.content}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </View>
    );
  }

  if (!narrationText) {
    return (
      <View style={styles.card}>
        <View style={styles.content}>
          <Text style={styles.emptyText}>
            Walk around to hear stories about your surroundings...
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      {/* Photo of the spot being discussed, when we have one */}
      {imageUrl && (
        <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="cover" />
      )}

      <View style={styles.content}>
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
    overflow: "hidden",
    maxHeight: 460,
  },
  image: {
    width: "100%",
    height: 140,
    backgroundColor: colors.surfaceAlt,
  },
  content: {
    padding: 16,
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
