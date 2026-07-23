// Login screen — "The Guide" direction (picked from the 3-direction mockup
// review). Leans into the thing that makes this app different: a voice in
// your ear. Sign-up now lives on its own screen (see SignupScreen.tsx)
// instead of being a second inline button here.

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
import { signIn } from "../services/auth";
import { track } from "../services/analytics";
import { colors, font, radius } from "../theme";

// One line per named guide persona (GUIDE_PERSONAS in backend/app/api/tours.py),
// written in that persona's established voice — picked once per app open
// (lazy useState initializer below), not re-rolled on every re-render.
// TODO: once the real mascot logo asset exists, render it above/beside the
// "Backyard" wordmark below — left as text-only for now rather than a
// placeholder graphic that would ship to real users.
const GUIDE_QUOTES = [
  { text: "Every street has a story it never told the papers.", guide: "Silas" },
  { text: "This city buries its secrets in plain sight.", guide: "Silas" },
  { text: "Every block has a story that never made the press release.", guide: "Roxie" },
  { text: "I know what really happened here. Let's go dig it up.", guide: "Roxie" },
  { text: "Every street's got an opinion. So do I.", guide: "Frankie" },
  { text: "I don't do boring walks. Neither should you.", guide: "Frankie" },
];

const WAVE_HEIGHTS = [6, 14, 9, 20, 11, 16, 7, 13];

interface LoginScreenProps {
  onLogin: () => void;
  onCreateAccount: () => void;
  onForgotPassword: () => void;
}

export default function LoginScreen({ onLogin, onCreateAccount, onForgotPassword }: LoginScreenProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [quote] = useState(() => GUIDE_QUOTES[Math.floor(Math.random() * GUIDE_QUOTES.length)]);

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

  return (
    <View style={styles.container}>
      <Text style={styles.brand}>{t("login.title")}</Text>

      <Text style={styles.quote}>"{quote.text}"</Text>
      <Text style={styles.quoteAttr}>— {quote.guide}, one of your guides</Text>

      <View style={styles.wave}>
        {WAVE_HEIGHTS.map((h, i) => (
          <View key={i} style={[styles.waveBar, { height: h }]} />
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("login.signInHeading")}</Text>

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

            <TouchableOpacity
              style={styles.forgotBtn}
              onPress={onForgotPassword}
              accessibilityRole="button"
            >
              <Text style={styles.forgotText}>{t("login.forgotPassword")}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.newHereBtn}
              onPress={onCreateAccount}
              accessibilityRole="button"
            >
              <Text style={styles.newHereText}>{t("login.newHere")}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
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
  brand: {
    fontFamily: font.display,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: colors.muted,
    textAlign: "center",
    marginBottom: 26,
  },
  quote: {
    fontFamily: font.display,
    fontStyle: "italic",
    fontSize: 22,
    lineHeight: 29,
    color: colors.text,
    textAlign: "center",
    marginBottom: 8,
  },
  quoteAttr: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: colors.muted,
    textAlign: "center",
    marginBottom: 22,
  },
  wave: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 4,
    height: 22,
    marginBottom: 30,
  },
  waveBar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: colors.accent,
    opacity: 0.55,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 22,
  },
  cardTitle: {
    fontFamily: font.display,
    fontSize: 19,
    color: colors.text,
    marginBottom: 16,
  },
  input: {
    backgroundColor: colors.surfaceAlt,
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
    marginTop: 4,
  },
  signInText: {
    color: colors.accentText,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "700",
  },
  forgotBtn: {
    padding: 10,
    marginTop: 6,
  },
  forgotText: {
    color: colors.muted,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "600",
  },
  newHereBtn: {
    padding: 14,
    marginTop: 4,
  },
  newHereText: {
    color: colors.accent,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "600",
  },
});
