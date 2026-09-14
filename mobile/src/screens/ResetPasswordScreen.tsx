// Reset Password — only reachable via the backyard://reset-password deep
// link (App.tsx already exchanged the link's tokens for a temporary
// recovery session before showing this screen). No "back" affordance: the
// only way out is finishing (or force-closing the app), same as any other
// password-recovery flow.

import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { updatePassword, signOut } from "../services/auth";
import { colors, font, radius, type, spacing } from "../theme";

interface ResetPasswordScreenProps {
  onDone: () => void;
}

export default function ResetPasswordScreen({ onDone }: ResetPasswordScreenProps) {
  const { t } = useTranslation();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    if (newPassword.length < 6) {
      Alert.alert(t("common.error"), t("resetPassword.passwordTooShort"));
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert(t("common.error"), t("resetPassword.passwordsDontMatch"));
      return;
    }
    setLoading(true);
    try {
      await updatePassword(newPassword);
      // The recovery link leaves the user in a real (if short-lived)
      // session -- sign out and send them back to a normal sign-in with
      // the new password, rather than silently landing them in the app.
      await signOut();
      Alert.alert(t("common.success"), t("resetPassword.success"));
      onDone();
    } catch (e: any) {
      Alert.alert(t("resetPassword.failed"), e.message || t("common.tryAgain"));
    }
    setLoading(false);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.heading}>{t("resetPassword.heading")}</Text>
      <Text style={styles.subheading}>{t("resetPassword.subheading")}</Text>

      <TextInput
        style={styles.input}
        placeholder={t("resetPassword.newPasswordPlaceholder")}
        placeholderTextColor={colors.fieldMuted}
        value={newPassword}
        onChangeText={setNewPassword}
        secureTextEntry
      />
      <Text style={styles.helperText}>{t("resetPassword.passwordHelper")}</Text>

      <TextInput
        style={styles.input}
        placeholder={t("resetPassword.confirmPasswordPlaceholder")}
        placeholderTextColor={colors.fieldMuted}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
      />

      {loading ? (
        <ActivityIndicator size="large" color={colors.ink} style={{ margin: 20 }} />
      ) : (
        <TouchableOpacity style={styles.primaryBtn} onPress={handleSave}>
          <Text style={styles.primaryBtnText}>{t("resetPassword.save")}</Text>
        </TouchableOpacity>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent",
    justifyContent: "center",
    padding: spacing.lg,
  },
  heading: {
    fontFamily: font.cursiveBold,
    fontSize: 32,
    lineHeight: 43,
    color: colors.ink,
    marginBottom: spacing.xs,
  },
  subheading: {
    fontFamily: font.serifItalic,
    fontSize: type.title,
    color: colors.fieldMuted,
    marginBottom: 22,
    lineHeight: 23,
  },
  // Deliberately NOT cursive -- live user-typed text, not UI chrome.
  input: {
    backgroundColor: colors.parchmentSurface,
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    color: colors.ink,
    padding: 14,
    borderRadius: radius.md,
    marginBottom: 6,
    fontFamily: font.sans,
    fontSize: type.body,
  },
  helperText: {
    fontSize: 13,
    color: colors.fieldMuted,
    marginBottom: spacing.md,
  },
  primaryBtn: {
    backgroundColor: colors.ink,
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  primaryBtnText: {
    fontFamily: font.cursiveBold,
    color: colors.parchmentSurface,
    textAlign: "center",
    fontSize: 23,
    lineHeight: 32,
  },
});
