// Profile screen — account info, content safety toggle, sign out.

import React, { useEffect, useState } from "react";
import { View, Text, Switch, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { getCurrentUserEmail, signOut } from "../services/auth";
import { getSettings, updateSettings } from "../services/api";
import { colors, font, radius } from "../theme";
import { showToast } from "../services/toast";

interface ProfileScreenProps {
  onSignedOut: () => void;
  isPremium: boolean;
  onOpenVoicePicker: () => void;
  onOpenPaywall: () => void;
}

export default function ProfileScreen({
  onSignedOut,
  isPremium,
  onOpenVoicePicker,
  onOpenPaywall,
}: ProfileScreenProps) {
  const [email, setEmail] = useState<string | null>(null);
  const [contentSafety, setContentSafety] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [userEmail, settings] = await Promise.all([
        getCurrentUserEmail().catch(() => null),
        getSettings().catch(() => null),
      ]);
      setEmail(userEmail);
      if (settings) setContentSafety(settings.content_safety);
      setLoading(false);
    }
    load();
  }, []);

  async function toggleContentSafety(value: boolean) {
    setContentSafety(value);
    try {
      await updateSettings({ content_safety: value });
    } catch (e: any) {
      console.warn("Failed to update settings:", e.message);
      showToast("Couldn't save that setting.");
    }
  }

  async function handleSignOut() {
    await signOut();
    onSignedOut();
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Profile</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Signed in as</Text>
        <Text style={styles.email}>{email || "Unknown"}</Text>
      </View>

      {isPremium ? (
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Premium member</Text>
              <Text style={styles.rowDesc}>All moods and voices unlocked</Text>
            </View>
            <View style={styles.premiumBadge}>
              <Text style={styles.premiumBadgeText}>PRO</Text>
            </View>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.upgradeBtn}
          onPress={onOpenPaywall}
          accessibilityRole="button"
          accessibilityLabel="Upgrade to Premium"
        >
          <Text style={styles.upgradeBtnText}>Upgrade to Premium</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={styles.card}
        onPress={onOpenVoicePicker}
        accessibilityRole="button"
        accessibilityLabel="Narration voice settings"
      >
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Narration voice</Text>
            <Text style={styles.rowDesc}>Choose which voice reads your tours</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </View>
      </TouchableOpacity>

      <View style={styles.card}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Mature content</Text>
            <Text style={styles.rowDesc}>Allow graphic history, crime, and adult themes</Text>
          </View>
          <Switch
            value={contentSafety}
            onValueChange={toggleContentSafety}
            trackColor={{ false: colors.border, true: colors.accent }}
            accessibilityLabel="Mature content toggle"
          />
        </View>
      </View>

      <TouchableOpacity
        style={styles.signOutBtn}
        onPress={handleSignOut}
        accessibilityRole="button"
        accessibilityLabel="Sign out"
      >
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: 20,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.bg,
  },
  header: {
    fontFamily: font.display,
    fontSize: 24,
    color: colors.text,
    marginBottom: 20,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 16,
    marginBottom: 14,
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: colors.muted,
  },
  email: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
    marginTop: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  rowDesc: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  premiumBadge: {
    backgroundColor: colors.pro,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  premiumBadgeText: {
    color: colors.proText,
    fontSize: 11,
    fontWeight: "800",
  },
  upgradeBtn: {
    backgroundColor: colors.pro,
    padding: 15,
    borderRadius: radius.md,
    marginBottom: 14,
  },
  upgradeBtnText: {
    color: colors.proText,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "700",
  },
  chevron: {
    fontSize: 22,
    color: colors.muted,
  },
  signOutBtn: {
    marginTop: 10,
    padding: 15,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  signOutText: {
    color: colors.danger,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "700",
  },
});
