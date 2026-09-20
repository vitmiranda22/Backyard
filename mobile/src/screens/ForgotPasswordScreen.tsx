// Forgot Password — email entry, then a "check your email" confirmation
// state. Deliberately doesn't reveal whether the address has an account
// (same behavior Supabase's resetPasswordForEmail already has server-side)
// so this can't be used to enumerate registered emails.

import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { requestPasswordReset } from "../services/auth";
import { colors, font, radius, type, spacing } from "../theme";

interface ForgotPasswordScreenProps {
  onBack: () => void;
}

export default function ForgotPasswordScreen({ onBack }: ForgotPasswordScreenProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSend() {
    if (!email.trim()) {
      Alert.alert(t("common.error"), t("forgotPassword.missingEmail"));
      return;
    }
    setLoading(true);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch (e: any) {
      Alert.alert(t("forgotPassword.failed"), e.message || t("common.tryAgain"));
    }
    setLoading(false);
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <TouchableOpacity onPress={onBack} accessibilityRole="button" accessibilityLabel={t("forgotPassword.backA11y")}>
        <Text style={styles.backArrow}>‹ {t("common.back")}</Text>
      </TouchableOpacity>

      {sent ? (
        <>
          <Text style={styles.heading}>{t("forgotPassword.sentHeading")}</Text>
          <Text style={styles.subheading}>{t("forgotPassword.sentBody")}</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={onBack}>
            <Text style={styles.primaryBtnText}>{t("forgotPassword.backToSignIn")}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.heading}>{t("forgotPassword.heading")}</Text>
          <Text style={styles.subheading}>{t("forgotPassword.subheading")}</Text>

          <TextInput
            style={styles.input}
            placeholder={t("forgotPassword.emailPlaceholder")}
            placeholderTextColor={colors.fieldMuted}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          {loading ? (
            <ActivityIndicator size="large" color={colors.ink} style={{ margin: 20 }} />
          ) : (
            <TouchableOpacity style={styles.primaryBtn} onPress={handleSend}>
              <Text style={styles.primaryBtnText}>{t("forgotPassword.sendLink")}</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent",
    padding: spacing.lg,
    paddingTop: 60,
  },
  backArrow: {
    fontFamily: font.headingBold,
    fontSize: 20,
    lineHeight: 26,
    color: colors.fieldMuted,
    marginBottom: 18,
  },
  heading: {
    fontFamily: font.headingBold,
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
    marginBottom: spacing.md,
    fontFamily: font.sans,
    fontSize: type.body,
  },
  primaryBtn: {
    backgroundColor: colors.ink,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  primaryBtnText: {
    fontFamily: font.headingBold,
    color: colors.parchmentSurface,
    textAlign: "center",
    fontSize: 23,
    lineHeight: 32,
  },
});
