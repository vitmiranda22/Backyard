// Login screen — "The Guide" direction (picked from the 3-direction mockup
// review). Full-bleed Bosco hero behind a top brand/quote block and a
// bottom sign-in card, on the confirmed gradient-scrim template shared
// with Signup/Onboarding card 4. Sign-up now lives on its own screen (see
// SignupScreen.tsx) instead of being a second inline button here.

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { useTranslation } from "react-i18next";
import { signIn, signInWithApple, signInWithGoogle, setKeepSignedIn } from "../services/auth";
import { track } from "../services/analytics";
import { colors, font, radius } from "../theme";
import BoscoHero from "../components/BoscoHero";

// Bosco, the app's mascot -- distinct from the in-tour narrator personas
// quoted below. He's the app-level host (login, onboarding, safety); they
// narrate mood-specific blocks once a tour is underway. Send-off pose,
// shared with Signup's method step and Onboarding card 4.
const MASCOT_IMAGE = require("../../assets/bosco-sendoff.jpg");

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
  const [keepSignedIn, setKeepSignedInState] = useState(true);
  const [quote] = useState(() => GUIDE_QUOTES[Math.floor(Math.random() * GUIDE_QUOTES.length)]);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [socialLoading, setSocialLoading] = useState<"apple" | "google" | null>(null);

  useEffect(() => {
    if (Platform.OS === "ios") {
      AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
    }
  }, []);

  async function handleSocialSignIn(provider: "apple" | "google") {
    setSocialLoading(provider);
    try {
      await setKeepSignedIn(keepSignedIn);
      if (provider === "apple") {
        await signInWithApple();
      } else {
        await signInWithGoogle();
      }
      track("login_completed", { provider });
      onLogin();
    } catch (e: any) {
      // ERR_REQUEST_CANCELED (Apple) / SIGN_IN_CANCELLED (Google) fire on a
      // plain user-dismissed picker -- not a real failure worth an alert.
      const cancelled = e?.code === "ERR_REQUEST_CANCELED" || e?.code === "SIGN_IN_CANCELLED";
      if (!cancelled) {
        Alert.alert(t("login.signInFailed"), e.message || t("common.tryAgain"));
      }
    }
    setSocialLoading(null);
  }

  async function handleSignIn() {
    if (!email || !password) {
      Alert.alert(t("common.error"), t("login.missingFields"));
      return;
    }
    setLoading(true);
    try {
      // Must be set before signIn() -- Supabase persists the new session to
      // storage as part of that call, and the storage adapter (services/auth.ts)
      // reads this preference synchronously at write time to decide whether
      // that write actually reaches disk or stays in-memory-only.
      await setKeepSignedIn(keepSignedIn);
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
      <BoscoHero
        image={MASCOT_IMAGE}
        imageAccessibilityLabel={t("login.mascotA11y")}
        imageTopOffset="-70%"
        topScrim={{ opacity: 0.5, heightPercent: "34%" }}
        scrimColors={["rgba(10,12,18,0)", "rgba(10,12,18,0)", "rgba(10,12,18,0.55)", "rgba(10,12,18,0.92)"]}
        scrimLocations={[0, 0.68, 0.82, 1]}
      >
        <View style={styles.topContent}>
          <Text style={styles.wordmark}>{t("login.title")}</Text>
          <Text style={styles.quote}>"{quote.text}"</Text>
          <Text style={styles.quoteAttr}>— {quote.guide}, one of your guides</Text>
        </View>
      </BoscoHero>

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

          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setKeepSignedInState(!keepSignedIn)}
            accessibilityRole="checkbox"
            accessibilityLabel={t("login.keepSignedInA11y")}
            accessibilityState={{ checked: keepSignedIn }}
          >
            <View style={[styles.checkboxBox, keepSignedIn && styles.checkboxBoxChecked]}>
              {keepSignedIn && <Text style={styles.checkboxMark}>✓</Text>}
            </View>
            <Text style={styles.checkboxLabel}>{t("login.keepSignedIn")}</Text>
          </TouchableOpacity>

          {loading || socialLoading ? (
            <ActivityIndicator size="large" color={colors.accent} style={{ margin: 20 }} />
          ) : (
            <>
              <TouchableOpacity style={styles.signInBtn} onPress={handleSignIn}>
                <Text style={styles.signInText}>{t("login.signIn")}</Text>
              </TouchableOpacity>

              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>{t("login.orContinueWith")}</Text>
                <View style={styles.dividerLine} />
              </View>

              {appleAvailable && (
                <AppleAuthentication.AppleAuthenticationButton
                  testID="apple-auth-button"
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                  cornerRadius={radius.md}
                  style={styles.appleBtn}
                  onPress={() => handleSocialSignIn("apple")}
                />
              )}

              <TouchableOpacity
                style={styles.googleBtn}
                onPress={() => handleSocialSignIn("google")}
                accessibilityRole="button"
                accessibilityLabel={t("login.continueWithGoogle")}
              >
                <Text style={styles.googleBtnText}>{t("login.continueWithGoogle")}</Text>
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
  topContent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 56,
    paddingHorizontal: 26,
  },
  wordmark: {
    fontFamily: font.display,
    fontWeight: "800",
    fontSize: 34,
    color: "#fff",
    textAlign: "center",
    marginBottom: 14,
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 14,
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
    flex: 1,
    justifyContent: "flex-end",
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
    textAlign: "center",
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
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 14,
  },
  checkboxBox: {
    width: 19,
    height: 19,
    borderWidth: 1.5,
    borderColor: colors.muted,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxBoxChecked: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  checkboxMark: {
    color: colors.accentText,
    fontSize: 12,
    fontWeight: "700",
  },
  checkboxLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
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
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
    marginBottom: 12,
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
  },
  // AppleAuthenticationButton forbids backgroundColor/borderRadius in its
  // own style prop (those go through buttonStyle/cornerRadius instead, see
  // where this is used) -- height is required or the button renders with
  // zero size, width matches the other auth buttons on this card.
  appleBtn: {
    width: "100%",
    height: 48,
    marginBottom: 10,
  },
  googleBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    borderRadius: radius.md,
    marginBottom: 4,
  },
  googleBtnText: {
    color: colors.text,
    textAlign: "center",
    fontSize: 15,
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
