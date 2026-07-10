// Login screen — simple email + password sign in
//
// For MVP, just a basic form. No fancy onboarding yet.

import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useTranslation } from "react-i18next";
import { signIn, signUp } from "../services/auth";
import { track } from "../services/analytics";
import { colors, font, radius } from "../theme";

export default function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    if (!email || !password) {
      Alert.alert(t("common.error"), t("login.missingFields"));
      return;
    }
    setLoading(true);
    try {
      await signIn(email, password);
      track("login_completed");
      onLogin();
    } catch (e: any) {
      Alert.alert(t("login.signInFailed"), e.message || t("common.tryAgain"));
    }
    setLoading(false);
  }

  async function handleSignUp() {
    if (!email || !password) {
      Alert.alert(t("common.error"), t("login.missingFields"));
      return;
    }
    if (password.length < 6) {
      Alert.alert(t("common.error"), t("login.passwordTooShort"));
      return;
    }
    setLoading(true);
    try {
      await signUp(email, password);
      track("signup_completed");
      Alert.alert(t("common.success"), t("login.accountCreated"));
    } catch (e: any) {
      Alert.alert(t("login.signUpFailed"), e.message || t("common.tryAgain"));
    }
    setLoading(false);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🎙️ {t("login.title")}</Text>
      <Text style={styles.subtitle}>{t("login.subtitle")}</Text>

      <TextInput
        style={styles.input}
        placeholder={t("login.emailPlaceholder")}
        placeholderTextColor={colors.muted}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <TextInput
        style={styles.input}
        placeholder={t("login.passwordPlaceholder")}
        placeholderTextColor={colors.muted}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      {loading ? (
        <ActivityIndicator size="large" color={colors.accent} style={{ margin: 20 }} />
      ) : (
        <>
          <TouchableOpacity style={styles.signInBtn} onPress={handleSignIn}>
            <Text style={styles.signInText}>{t("login.signIn")}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.signUpBtn} onPress={handleSignUp}>
            <Text style={styles.signUpText}>{t("login.createAccount")}</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: "center",
    padding: 30,
  },
  title: {
    fontFamily: font.display,
    fontSize: 34,
    color: colors.text,
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.muted,
    textAlign: "center",
    marginBottom: 40,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    padding: 14,
    borderRadius: radius.md,
    marginBottom: 12,
    fontSize: 16,
  },
  signInBtn: {
    backgroundColor: colors.accent,
    padding: 16,
    borderRadius: radius.md,
    marginTop: 8,
  },
  signInText: {
    color: colors.accentText,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "700",
  },
  signUpBtn: {
    padding: 16,
    marginTop: 8,
  },
  signUpText: {
    color: colors.accent,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "600",
  },
});
