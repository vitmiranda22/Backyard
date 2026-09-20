// Profile screen — account info, content safety toggle, sign out.

import React, { useEffect, useState } from "react";
import { View, Text, Switch, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, Alert, ScrollView, KeyboardAvoidingView, Platform, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { getCurrentUserEmail, signOut } from "../services/auth";
import { getSettings, updateSettings, deleteAccount } from "../services/api";
import { colors, font, radius, type, spacing } from "../theme";
import { showToast } from "../services/toast";
import { SUPPORTED_LANGUAGES, setLanguage } from "../i18n";

interface ProfileScreenProps {
  onBack: () => void;
  onSignedOut: () => void;
  isPremium: boolean;
  onOpenPaywall: () => void;
}

export default function ProfileScreen({
  onBack,
  onSignedOut,
  isPremium,
  onOpenPaywall,
}: ProfileScreenProps) {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState<string | null>(null);
  const [contentSafety, setContentSafety] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [languageModalOpen, setLanguageModalOpen] = useState(false);

  // Set at signup from the "full name" field (see SignupScreen), read-only
  // in the UI until now -- PATCH /user/settings has always accepted this,
  // ProfileScreen just never exposed a way to reach it.
  const [displayName, setDisplayName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [savingName, setSavingName] = useState(false);

  // null until settings load, then either a real "YYYY-MM-DD" or "" for
  // any account with none on file (pre-signup-redesign accounts, mainly).
  const [dateOfBirth, setDateOfBirth] = useState<string | null>(null);
  const [editingDob, setEditingDob] = useState(false);
  const [dobMonth, setDobMonth] = useState("");
  const [dobDay, setDobDay] = useState("");
  const [dobYear, setDobYear] = useState("");
  const [savingDob, setSavingDob] = useState(false);

  useEffect(() => {
    async function load() {
      const [userEmail, settings] = await Promise.all([
        getCurrentUserEmail().catch(() => null),
        getSettings().catch(() => null),
      ]);
      setEmail(userEmail);
      if (settings) {
        setContentSafety(settings.content_safety);
        setDisplayName(settings.display_name);
        setNameInput(settings.display_name);
        setDateOfBirth(settings.date_of_birth ?? "");
        if (settings.date_of_birth) {
          const [y, m, d] = settings.date_of_birth.split("-");
          setDobYear(y);
          setDobMonth(m);
          setDobDay(d);
        }
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

  function parsedDob(): string | null {
    const m = parseInt(dobMonth, 10);
    const d = parseInt(dobDay, 10);
    const y = parseInt(dobYear, 10);
    if (!m || !d || !y || m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > new Date().getFullYear()) {
      return null;
    }
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  async function handleSaveName() {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      Alert.alert(t("common.error"), t("profile.nameCannotBeEmpty"));
      return;
    }
    setSavingName(true);
    try {
      await updateSettings({ display_name: trimmed });
      setDisplayName(trimmed);
      setNameInput(trimmed);
      setEditingName(false);
      showToast(t("profile.displayNameSaved"));
    } catch (e: any) {
      console.warn("Failed to save display name:", e.message);
      showToast(t("profile.couldntSaveDisplayName"));
    }
    setSavingName(false);
  }

  async function handleSaveDob() {
    const parsed = parsedDob();
    if (!parsed) {
      Alert.alert(t("common.error"), t("signup.invalidDob"));
      return;
    }
    setSavingDob(true);
    try {
      await updateSettings({ date_of_birth: parsed });
      setDateOfBirth(parsed);
      setEditingDob(false);
      showToast(t("profile.dateOfBirthSaved"));
    } catch (e: any) {
      console.warn("Failed to save date of birth:", e.message);
      showToast(t("profile.couldntSaveDateOfBirth"));
    }
    setSavingDob(false);
  }

  async function handleSignOut() {
    await signOut();
    onSignedOut();
  }

  function handleChangeLanguage() {
    setLanguageModalOpen(true);
  }

  function selectLanguage(code: string) {
    setLanguage(code);
    setLanguageModalOpen(false);
  }

  function handleDeleteAccount() {
    Alert.alert(
      t("profile.deleteAccountTitle"),
      isPremium ? t("profile.deleteAccountBodyPremium") : t("profile.deleteAccountBody"),
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
        <ActivityIndicator size="large" color={colors.ink} />
      </View>
    );
  }

  const currentLanguageLabel =
    SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language)?.label ?? SUPPORTED_LANGUAGES[0].label;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: Math.max(insets.top, 54) }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={onBack} accessibilityRole="button" accessibilityLabel={t("common.back")}>
          <Text style={styles.backArrow}>‹ {t("common.back")}</Text>
        </TouchableOpacity>
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
            trackColor={{ false: colors.fieldBorder, true: colors.fieldGreen }}
            accessibilityLabel={t("profile.matureContentToggleA11y")}
          />
        </View>
      </View>

      <View style={styles.card}>
        {editingName ? (
          <>
            <Text style={styles.rowTitle}>{t("profile.displayName")}</Text>
            <TextInput
              style={styles.nameInput}
              value={nameInput}
              onChangeText={setNameInput}
              placeholder={t("profile.displayName")}
              placeholderTextColor={colors.fieldMuted}
              maxLength={50}
              autoCapitalize="words"
            />
            {savingName ? (
              <ActivityIndicator color={colors.ink} style={{ marginTop: 10 }} />
            ) : (
              <TouchableOpacity
                style={styles.saveDobBtn}
                onPress={handleSaveName}
                accessibilityRole="button"
                accessibilityLabel={t("profile.saveDisplayName")}
              >
                <Text style={styles.saveDobBtnText}>{t("profile.saveDisplayName")}</Text>
              </TouchableOpacity>
            )}
          </>
        ) : (
          <TouchableOpacity
            style={styles.row}
            onPress={() => setEditingName(true)}
            accessibilityRole="button"
            accessibilityLabel={t("profile.editDisplayNameA11y")}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{t("profile.displayName")}</Text>
              <Text style={styles.rowDesc}>{displayName}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        )}
      </View>

      {dateOfBirth !== null && (
        <View style={styles.card}>
          {editingDob ? (
            <>
              <Text style={styles.rowTitle}>{t("profile.dateOfBirth")}</Text>
              <View style={styles.dobRow}>
                <TextInput
                  style={[styles.dobInput]}
                  placeholder={t("signup.dobMonthPlaceholder")}
                  placeholderTextColor={colors.fieldMuted}
                  value={dobMonth}
                  onChangeText={setDobMonth}
                  keyboardType="number-pad"
                  maxLength={2}
                />
                <TextInput
                  style={[styles.dobInput]}
                  placeholder={t("signup.dobDayPlaceholder")}
                  placeholderTextColor={colors.fieldMuted}
                  value={dobDay}
                  onChangeText={setDobDay}
                  keyboardType="number-pad"
                  maxLength={2}
                />
                <TextInput
                  style={[styles.dobInput, styles.dobYearInput]}
                  placeholder={t("signup.dobYearPlaceholder")}
                  placeholderTextColor={colors.fieldMuted}
                  value={dobYear}
                  onChangeText={setDobYear}
                  keyboardType="number-pad"
                  maxLength={4}
                />
              </View>
              {savingDob ? (
                <ActivityIndicator color={colors.ink} style={{ marginTop: 10 }} />
              ) : (
                <TouchableOpacity
                  style={styles.saveDobBtn}
                  onPress={handleSaveDob}
                  accessibilityRole="button"
                  accessibilityLabel={t("profile.saveDateOfBirth")}
                >
                  <Text style={styles.saveDobBtnText}>{t("profile.saveDateOfBirth")}</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <TouchableOpacity
              style={styles.row}
              onPress={() => setEditingDob(true)}
              accessibilityRole="button"
              accessibilityLabel={t("profile.editDateOfBirthA11y")}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{t("profile.dateOfBirth")}</Text>
                <Text style={styles.rowDesc}>
                  {dateOfBirth ? `${dobMonth}/${dobDay}/${dobYear}` : t("profile.dateOfBirthMissingDesc")}
                </Text>
              </View>
              {dateOfBirth ? (
                <Text style={styles.chevron}>›</Text>
              ) : (
                <View style={styles.addDobPill}>
                  <Text style={styles.addDobPillText}>{t("profile.add")}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
        </View>
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

      <Modal
        visible={languageModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLanguageModalOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalScrim}
          activeOpacity={1}
          onPress={() => setLanguageModalOpen(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.modalSheet} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{t("profile.language")}</Text>
            {SUPPORTED_LANGUAGES.map((lang) => {
              const active = lang.code === i18n.language;
              return (
                <TouchableOpacity
                  key={lang.code}
                  style={[styles.languageRow, active && styles.languageRowActive]}
                  onPress={() => selectLanguage(lang.code)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.languageRowText, active && styles.languageRowTextActive]}>{lang.label}</Text>
                  {active && <Text style={styles.languageCheck}>✓</Text>}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => setLanguageModalOpen(false)}
              accessibilityRole="button"
              accessibilityLabel={t("common.cancel")}
            >
              <Text style={styles.modalCancelBtnText}>{t("common.cancel")}</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent",
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  backArrow: {
    fontFamily: font.headingBold,
    fontSize: 20,
    lineHeight: 26,
    color: colors.fieldMuted,
    marginBottom: 12,
  },
  header: {
    fontFamily: font.headingBold,
    fontSize: 34,
    lineHeight: 47,
    color: colors.ink,
    marginBottom: 20,
    textAlign: "center",
  },
  card: {
    backgroundColor: colors.parchmentSurface,
    borderWidth: 1,
    borderColor: colors.fieldBorderSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: 14,
  },
  label: {
    fontFamily: font.headingBold,
    fontSize: 14,
    lineHeight: 20,
    color: colors.fieldMuted,
  },
  email: {
    fontFamily: font.headingBold,
    fontSize: type.body,
    color: colors.ink,
    marginTop: spacing.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowTitle: {
    fontFamily: font.headingBold,
    fontSize: 20,
    lineHeight: 26,
    color: colors.ink,
  },
  rowDesc: {
    fontFamily: font.heading,
    fontSize: type.caption,
    color: colors.fieldMuted,
    marginTop: 2,
  },
  premiumBadge: {
    backgroundColor: colors.fieldGreen,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  premiumBadgeText: {
    color: colors.parchmentSurface,
    fontSize: 12,
    fontWeight: "800",
  },
  upgradeBtn: {
    backgroundColor: colors.fieldGreen,
    padding: 15,
    borderRadius: radius.md,
    marginBottom: 14,
  },
  upgradeBtnText: {
    fontFamily: font.headingBold,
    color: colors.parchmentSurface,
    textAlign: "center",
    fontSize: 20,
    lineHeight: 26,
  },
  chevron: {
    fontSize: 23,
    color: colors.fieldMuted,
  },
  addDobPill: {
    backgroundColor: colors.ink,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  addDobPillText: {
    fontFamily: font.headingBold,
    color: colors.parchmentSurface,
    fontSize: 14,
    lineHeight: 20,
  },
  // Deliberately NOT cursive -- live user-typed text, not UI chrome.
  nameInput: {
    backgroundColor: colors.parchmentBg,
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    color: colors.ink,
    padding: 12,
    borderRadius: radius.md,
    fontFamily: font.sans,
    fontSize: 16,
    marginTop: 10,
  },
  dobRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  dobInput: {
    flex: 1,
    backgroundColor: colors.parchmentBg,
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    color: colors.ink,
    padding: 12,
    borderRadius: radius.md,
    fontFamily: font.sans,
    fontSize: 16,
    textAlign: "center",
  },
  dobYearInput: {
    flex: 1.4,
  },
  saveDobBtn: {
    backgroundColor: colors.ink,
    padding: 13,
    borderRadius: radius.md,
    marginTop: 12,
  },
  saveDobBtnText: {
    fontFamily: font.headingBold,
    color: colors.parchmentSurface,
    textAlign: "center",
    fontSize: 20,
    lineHeight: 26,
  },
  signOutBtn: {
    marginTop: 10,
    padding: 15,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  signOutText: {
    fontFamily: font.headingBold,
    color: colors.danger,
    textAlign: "center",
    fontSize: 20,
    lineHeight: 26,
  },
  deleteBtn: {
    marginTop: 10,
    padding: 12,
  },
  deleteText: {
    fontFamily: font.headingBold,
    color: colors.fieldMuted,
    textAlign: "center",
    fontSize: 16,
    lineHeight: 22,
  },
  modalScrim: {
    flex: 1,
    backgroundColor: "rgba(36, 29, 18, 0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: colors.parchmentSurface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: 20,
    paddingBottom: 34,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.fieldBorder,
    alignSelf: "center",
    marginBottom: 14,
  },
  modalTitle: {
    fontFamily: font.headingBold,
    fontSize: 23,
    lineHeight: 32,
    color: colors.ink,
    textAlign: "center",
    marginBottom: 16,
  },
  languageRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.parchmentBg,
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  languageRowActive: {
    borderColor: colors.fieldGreen,
    backgroundColor: colors.parchmentSurface,
  },
  languageRowText: {
    fontFamily: font.heading,
    fontSize: 20,
    lineHeight: 26,
    color: colors.ink,
  },
  languageRowTextActive: {
    fontFamily: font.headingBold,
    color: colors.fieldGreen,
  },
  languageCheck: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.fieldGreen,
  },
  modalCancelBtn: {
    marginTop: 4,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.fieldBorder,
  },
  modalCancelBtnText: {
    fontFamily: font.headingBold,
    fontSize: 21,
    lineHeight: 28,
    color: colors.fieldMuted,
    textAlign: "center",
  },
});
