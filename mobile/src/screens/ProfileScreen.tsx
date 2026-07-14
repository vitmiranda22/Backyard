// Profile screen — account info, content safety toggle, sign out.

import React, { useEffect, useState } from "react";
import { View, Text, Switch, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { getCurrentUserEmail, signOut } from "../services/auth";
import { getSettings, updateSettings, getUserStats, deleteAccount, UserStats } from "../services/api";
import { getEarnedBadges, Badge } from "../services/badges";
import { colors, font, radius } from "../theme";
import { showToast } from "../services/toast";
import { SUPPORTED_LANGUAGES, setLanguage } from "../i18n";

interface ProfileScreenProps {
  onSignedOut: () => void;
  isPremium: boolean;
  onOpenVoicePicker: () => void;
  onOpenPaywall: () => void;
  onOpenBadges: () => void;
}

export default function ProfileScreen({
  onSignedOut,
  isPremium,
  onOpenVoicePicker,
  onOpenPaywall,
  onOpenBadges,
}: ProfileScreenProps) {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState<string | null>(null);
  const [contentSafety, setContentSafety] = useState(false);
  const [loading, setLoading] = useState(true);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function load() {
      const [userEmail, settings, userStats] = await Promise.all([
        getCurrentUserEmail().catch(() => null),
        getSettings().catch(() => null),
        getUserStats().catch(() => null),
      ]);
      setEmail(userEmail);
      if (settings) setContentSafety(settings.content_safety);
      if (userStats) {
        setStats(userStats);
        setBadges(getEarnedBadges(userStats));
      }
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
      showToast(t("profile.couldntSaveSetting"));
    }
  }

  async function handleSignOut() {
    await signOut();
    onSignedOut();
  }

  function handleChangeLanguage() {
    Alert.alert(
      t("profile.language"),
      undefined,
      SUPPORTED_LANGUAGES.map((lang) => ({
        text: lang.label,
        onPress: () => setLanguage(lang.code),
      })).concat([{ text: t("common.cancel"), style: "cancel" } as any])
    );
  }

  function handleDeleteAccount() {
    Alert.alert(
      t("profile.deleteAccountTitle"),
      t("profile.deleteAccountBody"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("profile.delete"),
          style: "destructive",
          onPress: () => {
            Alert.alert(
              t("profile.deleteConfirmTitle"),
              t("profile.deleteConfirmBody"),
              [
                { text: t("common.cancel"), style: "cancel" },
                { text: t("profile.deleteMyAccount"), style: "destructive", onPress: confirmDeleteAccount },
              ]
            );
          },
        },
      ]
    );
  }

  async function confirmDeleteAccount() {
    setDeleting(true);
    try {
      await deleteAccount();
      await signOut();
      onSignedOut();
    } catch (e: any) {
      console.warn("Failed to delete account:", e.message);
      showToast(t("profile.couldntDeleteAccount"));
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const currentLanguageLabel =
    SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language)?.label ?? SUPPORTED_LANGUAGES[0].label;

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 54) }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.header}>{t("profile.header")}</Text>

      <View style={styles.card}>
        <Text style={styles.label}>{t("profile.signedInAs")}</Text>
        <Text style={styles.email}>{email || t("common.unknown")}</Text>
      </View>

      {isPremium ? (
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{t("profile.premiumMember")}</Text>
              <Text style={styles.rowDesc}>{t("profile.premiumUnlocked")}</Text>
            </View>
            <View style={styles.premiumBadge}>
              <Text style={styles.premiumBadgeText}>{t("common.pro")}</Text>
            </View>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.upgradeBtn}
          onPress={onOpenPaywall}
          accessibilityRole="button"
          accessibilityLabel={t("profile.upgradeToPremium")}
        >
          <Text style={styles.upgradeBtnText}>{t("profile.upgradeToPremium")}</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={styles.card}
        onPress={onOpenVoicePicker}
        accessibilityRole="button"
        accessibilityLabel={t("profile.narrationVoiceSettingsA11y")}
      >
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{t("profile.narrationVoice")}</Text>
            <Text style={styles.rowDesc}>{t("profile.narrationVoiceDesc")}</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.card}
        onPress={handleChangeLanguage}
        accessibilityRole="button"
        accessibilityLabel={t("profile.language")}
      >
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{t("profile.language")}</Text>
            <Text style={styles.rowDesc}>{currentLanguageLabel}</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </View>
      </TouchableOpacity>

      <View style={styles.card}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{t("profile.matureContent")}</Text>
            <Text style={styles.rowDesc}>{t("profile.matureContentDesc")}</Text>
          </View>
          <Switch
            value={contentSafety}
            onValueChange={toggleContentSafety}
            trackColor={{ false: colors.border, true: colors.accent }}
            accessibilityLabel={t("profile.matureContentToggleA11y")}
          />
        </View>
      </View>

      {stats && (
        <View style={styles.card}>
          <Text style={[styles.label, styles.centerText]}>{t("profile.yourStats")}</Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.tours_completed}</Text>
              <Text style={styles.statLabel}>{t("profile.statTours")}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{(stats.total_distance_m / 1000).toFixed(1)}</Text>
              <Text style={styles.statLabel}>{t("profile.statKm")}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.cities_visited}</Text>
              <Text style={styles.statLabel}>{t("profile.statCities")}</Text>
            </View>
          </View>
        </View>
      )}

      {badges.length > 0 && (
        <TouchableOpacity
          style={styles.card}
          onPress={onOpenBadges}
          accessibilityRole="button"
          accessibilityLabel={t("profile.viewAllBadgesA11y")}
        >
          <View style={styles.badgeHeaderRow}>
            <Text style={[styles.label, styles.centerText]}>{t("profile.badges")}</Text>
            <Text style={styles.badgeHeaderChevron}>›</Text>
          </View>
          <View style={[styles.badgeRow, styles.centerRow]}>
            {badges.map((b) => (
              <View key={b.id} style={styles.badgeChip}>
                <Text style={styles.badgeEmoji}>{b.emoji}</Text>
                <Text style={styles.badgeLabel}>{t(`badges.${b.id}.label`)}</Text>
              </View>
            ))}
          </View>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={styles.signOutBtn}
        onPress={handleSignOut}
        accessibilityRole="button"
        accessibilityLabel={t("profile.signOut")}
      >
        <Text style={styles.signOutText}>{t("profile.signOut")}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={handleDeleteAccount}
        disabled={deleting}
        accessibilityRole="button"
        accessibilityLabel={t("profile.deleteAccount")}
      >
        <Text style={styles.deleteText}>{deleting ? t("profile.deleting") : t("profile.deleteAccount")}</Text>
      </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
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
  badgeHeaderRow: {
    position: "relative",
    justifyContent: "center",
  },
  badgeHeaderChevron: {
    position: "absolute",
    right: 0,
    top: -2,
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
  centerText: {
    textAlign: "center",
  },
  centerRow: {
    justifyContent: "center",
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 10,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.text,
  },
  statLabel: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  badgeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  badgeEmoji: {
    fontSize: 14,
  },
  badgeLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text,
  },
  deleteBtn: {
    marginTop: 10,
    padding: 12,
  },
  deleteText: {
    color: colors.muted,
    textAlign: "center",
    fontSize: 13,
  },
});
