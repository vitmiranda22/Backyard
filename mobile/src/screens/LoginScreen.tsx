// Login screen — "The Guide" direction (picked from the 3-direction mockup
// review). Full-bleed Bosco hero behind a top brand/quote block and a
// bottom sign-in card, on the confirmed gradient-scrim template shared
// with Signup/Onboarding card 4. Sign-up now lives on its own screen (see
// SignupScreen.tsx) instead of being a second inline button here.

import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { signIn } from "../services/auth";
import { track } from "../services/analytics";
import { colors, font, radius } from "../theme";

// Bosco, the app's mascot -- distinct from the in-tour narrator personas
// quoted below. He's the app-level host (login, onboarding, safety); they
// narrate mood-specific blocks once a tour is underway. Send-off pose,
// shared with Signup's method step and Onboarding card 4.
const MASCOT_IMAGE = require("../../assets/bosco-sendoff.png");

// One line per named guide persona (GUIDE_PERSONAS in backend/app/api/tours.py),
// written in that persona's established voice — picked once per app open
// (lazy useState initializer below), not re-rolled on every re-render.
const GUIDE_QUOTES = [
  { text: "Every street has a story it never told the papers.", guide: "Silas" },
  { text: "This city buries its secrets in plain sight.", guide: "Silas" },
  { text: "Every block has a story that never made the press release.", guide: "Roxie" },
  { text: "I know what really happened here. Let's go dig it up.", guide: "Roxie" },
  { text: "Every street's got an opinion. So do I.", guide: "Frankie" },
  { text: "I don't do boring walks. Neither should you.", guide: "Frankie" },
];

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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Image
        source={MASCOT_IMAGE}
        style={styles.bg}
        resizeMode="cover"
        accessibilityLabel={t("login.mascotA11y")}
      />

      <LinearGradient colors={["rgba(10,12,18,0.5)", "rgba(10,12,18,0)"]} style={styles.topScrim} />
      <View style={styles.topContent}>
        <Text style={styles.brand}>{t("login.title")}</Text>
        <Text style={styles.quote}>"{quote.text}"</Text>
        <Text style={styles.quoteAttr}>— {quote.guide}, one of your guides</Text>
      </View>

      <LinearGradient
        colors={["rgba(10,12,18,0)", "rgba(10,12,18,0)", "rgba(10,12,18,0.55)", "rgba(10,12,18,0.92)"]}
        locations={[0, 0.68, 0.82, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.content}>
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.text,
  },
  bg: {
    ...StyleSheet.absoluteFillObject,
  },
  topScrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "34%",
  },
  topContent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 56,
    paddingHorizontal: 26,
  },
  brand: {
    fontFamily: font.display,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.85)",
    textAlign: "center",
    marginBottom: 14,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  quote: {
    fontFamily: font.display,
    fontStyle: "italic",
    fontSize: 18,
    lineHeight: 24,
    color: "#fff",
    textAlign: "center",
    marginBottom: 6,
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  quoteAttr: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "rgba(255,255,255,0.8)",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  content: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 24,
    paddingBottom: 40,
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
