// Reset Password — only reachable via the backyard://reset-password deep
// link (App.tsx already exchanged the link's tokens for a temporary
// recovery session before showing this screen). No "back" affordance: the
// only way out is finishing (or force-closing the app), same as any other
// password-recovery flow.

import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import { updatePassword, signOut } from "../services/auth";
import { colors, font, radius } from "../theme";

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
    <View style={styles.container}>
      <Text style={styles.heading}>{t("resetPassword.heading")}</Text>
      <Text style={styles.subheading}>{t("resetPassword.subheading")}</Text>

      <TextInput
        style={styles.input}
        placeholder={t("resetPassword.newPasswordPlaceholder")}
        placeholderTextColor={colors.muted}
        value={newPassword}
        onChangeText={setNewPassword}
        secureTextEntry
      />
      <Text style={styles.helperText}>{t("resetPassword.passwordHelper")}</Text>

      <TextInput
        style={styles.input}
        placeholder={t("resetPassword.confirmPasswordPlaceholder")}
        placeholderTextColor={colors.muted}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
      />

      {loading ? (
        <ActivityIndicator size="large" color={colors.accent} style={{ margin: 20 }} />
      ) : (
        <TouchableOpacity style={styles.primaryBtn} onPress={handleSave}>
          <Text style={styles.primaryBtnText}>{t("resetPassword.save")}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: "center",
    padding: 24,
  },
  heading: {
    fontFamily: font.display,
    fontSize: 24,
    color: colors.text,
    marginBottom: 4,
  },
  subheading: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 22,
    lineHeight: 20,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    padding: 14,
    borderRadius: radius.md,
    marginBottom: 6,
    fontSize: 16,
  },
  helperText: {
    fontSize: 11.5,
    color: colors.muted,
    marginBottom: 16,
  },
  primaryBtn: {
    backgroundColor: colors.accent,
    padding: 16,
    borderRadius: radius.md,
    marginTop: 8,
  },
  primaryBtnText: {
    color: colors.accentText,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "700",
  },
});
