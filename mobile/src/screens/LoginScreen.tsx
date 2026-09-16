// Login screen — "The Guide" direction (picked from the 3-direction mockup
// review). Full-bleed Bosco hero behind a top brand/quote block and a
// bottom sign-in card, on the confirmed gradient-scrim template shared
// with Signup/Onboarding card 4. Sign-up now lives on its own screen (see
// SignupScreen.tsx) instead of being a second inline button here.

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Dimensions,
} from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { useTranslation } from "react-i18next";
import { signIn, signInWithApple, signInWithGoogle, setKeepSignedIn } from "../services/auth";
import { track } from "../services/analytics";
import { colors, font, radius, type, spacing } from "../theme";
import BoscoHero from "../components/BoscoHero";

// Bosco, the app's mascot -- distinct from the in-tour narrator personas
// quoted below. He's the app-level host (login, onboarding, safety); they
// narrate mood-specific blocks once a tour is underway. Send-off pose,
// shared with Signup's method step and Onboarding card 4.
const MASCOT_IMAGE = require("../../assets/bosco-sendoff.jpg");

// The sign-in card stacks enough fields/buttons to grow taller than a
// comfortable share of the screen on real devices (see styles.content),
// which was swallowing the hero above it -- Bosco's face, the logo, the
// quote all disappeared behind it. Capped to a fixed proportion of the
// actual screen height (not a flex-based split) so the hero always keeps
// a guaranteed visible band no matter how tall the card's own content is.
const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const CARD_AREA_HEIGHT = SCREEN_HEIGHT * 0.48;

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
          <Image
            source={require("../../assets/lOGOBACKYARD.png")}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel={t("login.title")}
          />
          <Text style={styles.quote}>"{quote.text}"</Text>
          <Text style={styles.quoteAttr}>— {quote.guide}, one of your guides</Text>
        </View>
      </BoscoHero>

      <View style={styles.content} pointerEvents="box-none">
        <View style={styles.card}>
          {/* This card stacks 9 elements (title, 2 inputs, checkbox, CTA,
              divider, 2 social buttons, 2 links) -- tall enough on real
              devices to grow past a comfortable share of the screen and
              swallow the hero above it entirely (Bosco's face, the logo,
              the quote). Capped via styles.content's maxHeight instead;
              this ScrollView is what lets the card's own content overflow
              WITHIN that cap and scroll, rather than forcing the cap
              itself taller -- same fix Signup's own details step uses for
              the same "too much content for one screen" problem. */}
          <ScrollView style={styles.cardScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Text style={styles.cardTitle}>{t("login.signInHeading")}</Text>

          <TextInput
            style={styles.input}
            placeholder={t("login.emailPlaceholder")}
            placeholderTextColor={colors.fieldMuted}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <TextInput
            style={styles.input}
            placeholder={t("login.passwordPlaceholder")}
            placeholderTextColor={colors.fieldMuted}
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
            <ActivityIndicator size="large" color={colors.ink} style={{ margin: 20 }} />
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

              <View style={styles.socialRow}>
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
                  style={[styles.googleBtn, appleAvailable && styles.googleBtnHalf]}
                  onPress={() => handleSocialSignIn("google")}
                  accessibilityRole="button"
                  accessibilityLabel={t("login.continueWithGoogle")}
                >
                  <Text style={styles.googleBtnText} numberOfLines={1} adjustsFontSizeToFit>
                    {t("login.continueWithGoogle")}
                  </Text>
                </TouchableOpacity>
              </View>

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
          </ScrollView>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.ink,
  },
  topContent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 56,
    paddingHorizontal: 26,
  },
  // Real content aspect ratio is ~2.28:1 (source file is a square canvas
  // with a lot of transparent padding around the actual wood-sign art) --
  // sized off height, not width, so it actually reads as big. +20% over
  // the original 220x96 per direct feedback that it read too small.
  logo: {
    alignSelf: "center",
    width: 264,
    height: 115,
    marginBottom: 6,
  },
  quote: {
    fontFamily: font.serifItalic,
    fontSize: type.title,
    lineHeight: 26,
    color: "#fff",
    textAlign: "center",
    marginBottom: 6,
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  quoteAttr: {
    fontFamily: font.cursiveBold,
    fontSize: 16,
    lineHeight: 22,
    color: "rgba(255,255,255,0.85)",
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
    height: CARD_AREA_HEIGHT,
    padding: spacing.lg,
    paddingBottom: 40,
  },
  card: {
    flex: 1,
    backgroundColor: colors.parchmentSurface,
    borderRadius: radius.lg,
    padding: 18,
  },
  cardScroll: {
    flex: 1,
  },
  cardTitle: {
    fontFamily: font.cursiveBold,
    fontSize: 26,
    lineHeight: 34,
    color: colors.ink,
    textAlign: "center",
    marginBottom: 10,
  },
  // Deliberately NOT cursive -- this is live user-typed text (email/
  // password), not UI chrome, so it stays in a plain legible face like
  // every other real-content field in the app.
  input: {
    backgroundColor: colors.parchmentBg,
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    color: colors.ink,
    padding: 11,
    borderRadius: radius.md,
    marginBottom: 9,
    fontFamily: font.sans,
    fontSize: type.body,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 10,
  },
  checkboxBox: {
    width: 21,
    height: 21,
    borderWidth: 1.5,
    borderColor: colors.fieldMuted,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxBoxChecked: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  checkboxMark: {
    color: colors.parchmentSurface,
    fontSize: type.caption,
    fontWeight: "700",
  },
  checkboxLabel: {
    fontFamily: font.cursiveBold,
    fontSize: 17,
    lineHeight: 23,
    color: colors.ink,
  },
  signInBtn: {
    backgroundColor: colors.ink,
    padding: 12,
    borderRadius: radius.md,
    marginTop: spacing.xs,
  },
  signInText: {
    fontFamily: font.cursiveBold,
    color: colors.parchmentSurface,
    textAlign: "center",
    fontSize: 19,
    lineHeight: 26,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 9,
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.fieldBorder,
  },
  dividerText: {
    fontFamily: font.cursiveBold,
    fontSize: 14,
    lineHeight: 19,
    color: colors.fieldMuted,
  },
  // Apple/Google side by side (rather than stacked) to save vertical
  // space, per direct feedback -- Google alone (no Apple on this device)
  // still gets the full row width via googleBtnHalf being conditional.
  socialRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 9,
  },
  // AppleAuthenticationButton forbids backgroundColor/borderRadius in its
  // own style prop (those go through buttonStyle/cornerRadius instead, see
  // where this is used) -- height is required or the button renders with
  // zero size; flex:1 splits it evenly with Google in socialRow.
  appleBtn: {
    flex: 1,
    height: 42,
  },
  googleBtn: {
    width: "100%",
    backgroundColor: colors.parchmentSurface,
    borderWidth: 1.3,
    borderColor: colors.ink,
    padding: 10,
    borderRadius: radius.md,
    justifyContent: "center",
  },
  googleBtnHalf: {
    width: undefined,
    flex: 1,
  },
  googleBtnText: {
    fontFamily: font.cursiveBold,
    color: colors.ink,
    textAlign: "center",
    fontSize: 16,
    lineHeight: 21,
  },
  forgotBtn: {
    padding: 7,
    marginTop: 2,
  },
  forgotText: {
    fontFamily: font.cursiveBold,
    color: colors.fieldMuted,
    textAlign: "center",
    fontSize: 14,
    lineHeight: 19,
  },
  newHereBtn: {
    padding: 10,
  },
  newHereText: {
    fontFamily: font.cursiveBold,
    color: colors.fieldGreen,
    textAlign: "center",
    fontSize: 17,
    lineHeight: 22,
  },
});
