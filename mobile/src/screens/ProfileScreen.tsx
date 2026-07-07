// Profile screen — account info, content safety toggle, sign out.

import React, { useEffect, useState } from "react";
import { View, Text, Switch, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { getCurrentUserEmail, signOut } from "../services/auth";
import { getSettings, updateSettings } from "../services/api";
import { colors, font, radius } from "../theme";

export default function ProfileScreen({ onSignedOut }: { onSignedOut: () => void }) {
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
          />
        </View>
      </View>

      <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
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
