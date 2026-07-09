// Onboarding — shown once, on first-ever launch after login. Persisted via
// expo-secure-store (already linked for auth tokens, so this needs no new
// native dependency / build).

import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { colors, font, radius } from "../theme";
import { tap } from "../services/haptics";

const CARDS = [
  {
    emoji: "🚶",
    title: "Welcome to Backyard",
    body: "Walk anywhere, and hear real stories about the streets, buildings, and history around you — narrated as you go.",
  },
  {
    emoji: "🎭",
    title: "Pick a mood",
    body: "Time Machine, Hidden City, Dark Side, Behind the Scenes, Unfiltered — same streets, completely different stories each time.",
  },
  {
    emoji: "🗺️",
    title: "Discover routes from others",
    body: "Every walk can be published as a route for others to follow. Browse what's nearby, rated by the community.",
  },
  {
    emoji: "✨",
    title: "Ready to explore?",
    body: "Pick a mood and start walking — narration triggers automatically as you approach each new spot.",
  },
];

interface OnboardingScreenProps {
  onDone: () => void;
}

export default function OnboardingScreen({ onDone }: OnboardingScreenProps) {
  const [index, setIndex] = useState(0);
  const card = CARDS[index];
  const isLast = index === CARDS.length - 1;

  function handleNext() {
    tap();
    if (isLast) {
      onDone();
    } else {
      setIndex(index + 1);
    }
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={onDone} accessibilityRole="button" accessibilityLabel="Skip onboarding">
        <Text style={styles.skip}>Skip</Text>
      </TouchableOpacity>

      <View style={styles.content}>
        <Text style={styles.emoji}>{card.emoji}</Text>
        <Text style={styles.title}>{card.title}</Text>
        <Text style={styles.body}>{card.body}</Text>
      </View>

      <View style={styles.dots}>
        {CARDS.map((_, i) => (
          <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>

      <TouchableOpacity
        style={styles.nextBtn}
        onPress={handleNext}
        accessibilityRole="button"
        accessibilityLabel={isLast ? "Get started" : "Next"}
      >
        <Text style={styles.nextBtnText}>{isLast ? "Get Started" : "Next"}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: 24,
    paddingTop: 60,
    justifyContent: "space-between",
  },
  skip: {
    alignSelf: "flex-end",
    color: colors.muted,
    fontSize: 14,
    fontWeight: "600",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emoji: {
    fontSize: 56,
    marginBottom: 16,
  },
  title: {
    fontFamily: font.display,
    fontSize: 26,
    color: colors.text,
    textAlign: "center",
    marginBottom: 12,
  },
  body: {
    fontSize: 15,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 12,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginBottom: 24,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  dotActive: {
    backgroundColor: colors.accent,
    width: 20,
  },
  nextBtn: {
    backgroundColor: colors.accent,
    padding: 16,
    borderRadius: radius.md,
  },
  nextBtnText: {
    color: colors.accentText,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
  },
});
