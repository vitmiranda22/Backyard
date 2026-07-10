// Badge gallery — every badge that exists, not just the ones you've
// earned. Locked ones are greyed out with what it takes to unlock them.

import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from "react-native";
import { getUserStats } from "../services/api";
import { getAllBadges, BadgeStatus } from "../services/badges";
import { colors, font, radius } from "../theme";
import { showToast } from "../services/toast";

interface BadgeGalleryScreenProps {
  onBack: () => void;
}

export default function BadgeGalleryScreen({ onBack }: BadgeGalleryScreenProps) {
  const [badges, setBadges] = useState<BadgeStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getUserStats()
      .then((stats) => setBadges(getAllBadges(stats)))
      .catch((e: any) => {
        console.warn("Failed to load stats for badges:", e.message);
        showToast("Couldn't load your badges.");
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backBtn} onPress={onBack} accessibilityRole="button" accessibilityLabel="Back">
        <Text style={styles.backText}>‹ Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Badges</Text>
      <Text style={styles.subtitle}>Every badge you can earn walking with Backyard</Text>

      <ScrollView contentContainerStyle={styles.list}>
        {badges.map((badge) => (
          <View key={badge.id} style={[styles.card, !badge.earned && styles.cardLocked]}>
            <View style={[styles.emojiWrap, !badge.earned && styles.emojiWrapLocked]}>
              <Text style={[styles.emoji, !badge.earned && styles.emojiLocked]}>{badge.emoji}</Text>
            </View>
            <View style={styles.info}>
              <Text style={[styles.label, !badge.earned && styles.labelLocked]}>{badge.label}</Text>
              <Text style={styles.requirement}>
                {badge.earned ? "Unlocked" : badge.requirement}
              </Text>
            </View>
            {!badge.earned && <Text style={styles.lock}>🔒</Text>}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 20,
    paddingTop: 60,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.bg,
  },
  backBtn: {
    position: "absolute",
    top: 56,
    left: 20,
    zIndex: 1,
  },
  backText: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: "600",
  },
  title: {
    fontFamily: font.display,
    fontSize: 24,
    color: colors.text,
    textAlign: "center",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
    marginBottom: 24,
  },
  list: {
    paddingBottom: 40,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    borderRadius: radius.md,
    marginBottom: 10,
  },
  cardLocked: {
    backgroundColor: colors.surfaceAlt,
    opacity: 0.65,
  },
  emojiWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceAlt,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  emojiWrapLocked: {
    backgroundColor: colors.border,
  },
  emoji: {
    fontSize: 22,
  },
  emojiLocked: {
    opacity: 0.4,
  },
  info: {
    flex: 1,
  },
  label: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  labelLocked: {
    color: colors.muted,
  },
  requirement: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  lock: {
    fontSize: 16,
    marginLeft: 8,
  },
});
