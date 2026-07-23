// Forgot Password — email entry, then a "check your email" confirmation
// state. Deliberately doesn't reveal whether the address has an account
// (same behavior Supabase's resetPasswordForEmail already has server-side)
// so this can't be used to enumerate registered emails.

import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import { requestPasswordReset } from "../services/auth";
import { colors, font, radius } from "../theme";

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
    <View style={styles.container}>
      <TouchableOpacity onPress={onBack} accessibilityRole="button" accessibilityLabel={t("forgotPassword.backA11y")}>
        <Text style={styles.backArrow}>←</Text>
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
            placeholderTextColor={colors.muted}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          {loading ? (
            <ActivityIndicator size="large" color={colors.accent} style={{ margin: 20 }} />
          ) : (
            <TouchableOpacity style={styles.primaryBtn} onPress={handleSend}>
              <Text style={styles.primaryBtnText}>{t("forgotPassword.sendLink")}</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: 24,
    paddingTop: 60,
  },
  backArrow: {
    fontSize: 22,
    color: colors.text,
    marginBottom: 18,
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
    marginBottom: 16,
    fontSize: 16,
  },
  primaryBtn: {
    backgroundColor: colors.accent,
    padding: 16,
    borderRadius: radius.md,
  },
  primaryBtnText: {
    color: colors.accentText,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "700",
  },
});
