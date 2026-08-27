// Create Account screen — "The Guide" direction. Two steps in one
// component: pick a method (Google/Apple/Email), then, for Email, a
// details form collecting name/DOB/password plus a required Privacy
// Policy/Terms acceptance checkbox. DOB is read server-side to age-gate
// the app's mature content mode (see backend is_user_underage) -- entered
// via the OS's native date picker. Google/Apple skip the details form
// entirely -- Supabase creates the account on first authorization, DOB
// gets backfilled later via ProfileScreen's existing "Add" flow for
// accounts with none on file (see handle_new_user()'s nullable column).

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Linking,
  KeyboardAvoidingView,
  ScrollView,
  Modal,
  Platform,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as AppleAuthentication from "expo-apple-authentication";
import { useTranslation } from "react-i18next";
import { signUp, signInWithApple, signInWithGoogle } from "../services/auth";
import { track } from "../services/analytics";
import { colors, font, radius } from "../theme";
import BoscoHero from "../components/BoscoHero";

// Same send-off pose as LoginScreen, for auth-flow continuity. Only the
// method step gets the full-bleed hero treatment -- the email/DOB details
// step is a dense form that needs to stay a plain, focused card.
const MASCOT_IMAGE = require("../../assets/bosco-sendoff.jpg");

const PRIVACY_URL = "https://backyard-api.onrender.com/privacy";
const TERMS_URL = "https://backyard-api.onrender.com/terms";

// COPPA: 13 is the floor for creating an account at all (separate from
// is_user_underage's 18+ gate on mature content). Real enforcement is
// server-side (the handle_new_user() trigger, see migration
// 018_min_signup_age.sql) -- this is just the friendly, same-day UX so a
// child entering their real birthday doesn't get a raw DB error.
const MIN_SIGNUP_AGE = 13;

// Opens the picker roughly a generation back from today, not on today's
// date -- today's date always fails the 13+ check, so nobody should have
// to scroll years back from a default that starts them out invalid.
const DEFAULT_DOB_YEARS_AGO = 25;
function defaultPickerDate(): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() - DEFAULT_DOB_YEARS_AGO);
  return d;
}

type Step = "method" | "email";

interface SignupScreenProps {
  onBack: () => void;
  onSignedUp: () => void;
}

export default function SignupScreen({ onBack, onSignedUp }: SignupScreenProps) {
  const { t, i18n } = useTranslation();
  const [step, setStep] = useState<Step>("method");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [dobDate, setDobDate] = useState<Date | null>(null);
  // iOS only -- Android's DateTimePicker is its own native dialog with its
  // own Cancel/OK, so it commits or discards on its own. iOS instead
  // renders inline (see the Modal below), which needs an explicit
  // Cancel/Done pair -- pendingDob is the in-progress scroll value, only
  // copied into dobDate on Done, so Cancel can discard it.
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pendingDob, setPendingDob] = useState<Date>(defaultPickerDate());
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [socialLoading, setSocialLoading] = useState<"apple" | "google" | null>(null);

  useEffect(() => {
    if (Platform.OS === "ios") {
      AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
    }
  }, []);

  async function handleSocialSignUp(provider: "apple" | "google") {
    setSocialLoading(provider);
    try {
      if (provider === "apple") {
        await signInWithApple();
      } else {
        await signInWithGoogle();
      }
      track("signup_completed", { provider });
      onSignedUp();
    } catch (e: any) {
      const cancelled = e?.code === "ERR_REQUEST_CANCELED" || e?.code === "SIGN_IN_CANCELLED";
      if (!cancelled) {
        Alert.alert(t("signup.signUpFailed"), e.message || t("common.tryAgain"));
      }
    }
    setSocialLoading(null);
  }

  function parsedDob(): string | null {
    if (!dobDate) return null;
    const y = dobDate.getFullYear();
    const m = dobDate.getMonth() + 1;
    const d = dobDate.getDate();
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  function openDatePicker() {
    setPendingDob(dobDate || defaultPickerDate());
    setShowDatePicker(true);
  }

  function confirmDatePicker() {
    setDobDate(pendingDob);
    setShowDatePicker(false);
  }

  function cancelDatePicker() {
    setShowDatePicker(false);
  }

  function handleAndroidDateChange(event: { type: string }, selectedDate?: Date) {
    setShowDatePicker(false);
    if (event.type === "set" && selectedDate) setDobDate(selectedDate);
  }

  // Mirrors is_user_underage's age math (backend/app/services/supabase_db.py)
  // so the client's floor and the server's floor never disagree on a
  // birthday that falls exactly on today's month/day.
  function ageFromDob(dob: string): number {
    const [y, m, d] = dob.split("-").map(Number);
    const today = new Date();
    let age = today.getFullYear() - y;
    if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) {
      age -= 1;
    }
    return age;
  }

  const dob = parsedDob();
  const oldEnough = dob !== null && ageFromDob(dob) >= MIN_SIGNUP_AGE;

  const canSubmit =
    fullName.trim().length > 0 &&
    email.trim().length > 0 &&
    oldEnough &&
    password.length >= 6 &&
    password === confirmPassword &&
    privacyAccepted;

  async function handleBackFromEmail() {
    setStep("method");
  }

  async function handleCreateAccount() {
    if (!fullName.trim() || !email.trim() || !password) {
      Alert.alert(t("common.error"), t("signup.missingFields"));
      return;
    }
    if (password.length < 6) {
      Alert.alert(t("common.error"), t("signup.passwordTooShort"));
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert(t("common.error"), t("signup.passwordsDontMatch"));
      return;
    }
    if (!dob) {
      Alert.alert(t("common.error"), t("signup.invalidDob"));
      return;
    }
    if (!oldEnough) {
      Alert.alert(t("common.error"), t("signup.tooYoung"));
      return;
    }
    if (!privacyAccepted) {
      Alert.alert(t("common.error"), t("signup.mustAcceptPrivacy"));
      return;
    }

    setLoading(true);
    try {
      const result = await signUp(email.trim(), password, fullName.trim(), dob);
      track("signup_completed");
      if (result.session) {
        // A session came back immediately -- this project's Supabase Auth
        // isn't requiring email confirmation, so there's no reason to make
        // the walker log in a second time right after they just signed up.
        onSignedUp();
      } else {
        // Confirmation required -- no session exists yet to log in with,
        // no matter how this screen routes from here. Back to Login, where
        // they'll land once they've clicked the email link.
        Alert.alert(t("common.success"), t("signup.checkEmailToConfirm"));
        onBack();
      }
    } catch (e: any) {
      Alert.alert(t("signup.signUpFailed"), e.message || t("common.tryAgain"));
    }
    setLoading(false);
  }

  if (step === "method") {
    return (
      <View style={styles.methodContainer}>
        <BoscoHero
          image={MASCOT_IMAGE}
          imageAccessibilityLabel={t("login.mascotA11y")}
          imageTopOffset="-70%"
          scrimColors={["rgba(10,12,18,0)", "rgba(10,12,18,0)", "rgba(10,12,18,0.6)", "rgba(10,12,18,0.94)"]}
          scrimLocations={[0, 0.55, 0.75, 1]}
        >
          <TouchableOpacity
            style={styles.methodBackArrow}
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel={t("signup.backA11y")}
          >
            <Text style={styles.backArrowOnDark}>←</Text>
          </TouchableOpacity>

          <View style={styles.methodContent}>
            <Text style={styles.wordmarkOnDark}>{t("login.title")}</Text>
            <Text style={styles.subheadingOnDark}>{t("signup.methodSubtitle")}</Text>

            {socialLoading ? (
              <ActivityIndicator size="large" color="#fff" style={{ marginBottom: 16 }} />
            ) : (
              <>
                {appleAvailable && (
                  <AppleAuthentication.AppleAuthenticationButton
                    testID="apple-auth-button"
                    buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                    buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                    cornerRadius={radius.md}
                    style={styles.appleBtn}
                    onPress={() => handleSocialSignUp("apple")}
                  />
                )}
                <TouchableOpacity
                  style={styles.oauthBtn}
                  onPress={() => handleSocialSignUp("google")}
                  accessibilityRole="button"
                  accessibilityLabel={t("signup.continueWithGoogle")}
                >
                  <Text style={styles.oauthText}>{t("signup.continueWithGoogle")}</Text>
                </TouchableOpacity>
              </>
            )}

            <View style={styles.dividerRow}>
              <View style={styles.dividerLineOnDark} />
              <Text style={styles.dividerTextOnDark}>{t("signup.or")}</Text>
              <View style={styles.dividerLineOnDark} />
            </View>

            <TouchableOpacity style={styles.primaryBtn} onPress={() => setStep("email")}>
              <Text style={styles.primaryBtnText}>{t("signup.continueWithEmail")}</Text>
            </TouchableOpacity>
          </View>
        </BoscoHero>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* This is a long 7-field form -- taller than the screen on many
          devices even before a keyboard shows up. Without this ScrollView,
          the checkbox and submit button at the bottom were unreachable
          whenever the keyboard was open, and possibly even when it wasn't
          on shorter devices. */}
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      <TouchableOpacity onPress={handleBackFromEmail} accessibilityRole="button" accessibilityLabel={t("signup.backA11y")}>
        <Text style={styles.backArrow}>←</Text>
      </TouchableOpacity>

      <Text style={styles.heading}>{t("signup.detailsHeading")}</Text>
      <Text style={styles.subheading}>{t("signup.detailsSubtitle")}</Text>

      <TextInput
        style={styles.input}
        placeholder={t("signup.fullNamePlaceholder")}
        placeholderTextColor={colors.muted}
        value={fullName}
        onChangeText={setFullName}
        autoCapitalize="words"
      />

      <TextInput
        style={styles.input}
        placeholder={t("signup.emailPlaceholder")}
        placeholderTextColor={colors.muted}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <Text style={styles.fieldLabel}>{t("signup.dobLabel")}</Text>
      <TouchableOpacity
        style={[styles.input, styles.dobField]}
        onPress={openDatePicker}
        accessibilityRole="button"
        accessibilityLabel={t("signup.dobLabel")}
      >
        <Text style={dobDate ? styles.dobFieldValue : styles.dobFieldPlaceholder}>
          {dobDate
            ? dobDate.toLocaleDateString(i18n.language, { month: "long", day: "numeric", year: "numeric" })
            : t("signup.dobPlaceholder")}
        </Text>
        <Text style={styles.dobFieldIcon}>📅</Text>
      </TouchableOpacity>
      <Text style={styles.helperText}>{t("signup.dobHelper")}</Text>

      {/* Android's DateTimePicker is a native dialog with its own Cancel/OK
          -- mounting it is enough to show it, and it unmounts itself via
          handleAndroidDateChange once the walker picks or dismisses. */}
      {Platform.OS === "android" && showDatePicker && (
        <DateTimePicker
          value={dobDate || defaultPickerDate()}
          mode="date"
          display="default"
          maximumDate={new Date()}
          onChange={handleAndroidDateChange}
        />
      )}

      {/* iOS renders inline rather than as a dialog, so it needs its own
          sheet chrome (Cancel/Done) -- matches the bottom-sheet treatment
          already used for Tour Complete's discard confirm. */}
      {Platform.OS === "ios" && (
        <Modal transparent visible={showDatePicker} animationType="slide" onRequestClose={cancelDatePicker}>
          <View style={styles.dobSheetScrim}>
            <View style={styles.dobSheet}>
              <View style={styles.dobSheetBar}>
                <TouchableOpacity onPress={cancelDatePicker} accessibilityRole="button" accessibilityLabel={t("common.cancel")}>
                  <Text style={styles.dobSheetCancel}>{t("common.cancel")}</Text>
                </TouchableOpacity>
                <Text style={styles.dobSheetTitle}>{t("signup.dobLabel")}</Text>
                <TouchableOpacity onPress={confirmDatePicker} accessibilityRole="button" accessibilityLabel={t("signup.dobDone")}>
                  <Text style={styles.dobSheetDone}>{t("signup.dobDone")}</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={pendingDob}
                mode="date"
                display="spinner"
                maximumDate={new Date()}
                onChange={(_, selectedDate) => selectedDate && setPendingDob(selectedDate)}
              />
            </View>
          </View>
        </Modal>
      )}

      <TextInput
        style={styles.input}
        placeholder={t("signup.passwordPlaceholder")}
        placeholderTextColor={colors.muted}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <Text style={styles.helperText}>{t("signup.passwordHelper")}</Text>

      <TextInput
        style={styles.input}
        placeholder={t("signup.confirmPasswordPlaceholder")}
        placeholderTextColor={colors.muted}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
      />
      {confirmPassword.length > 0 && password !== confirmPassword && (
        <Text style={styles.errorText}>{t("signup.passwordsDontMatch")}</Text>
      )}

      <TouchableOpacity
        style={styles.checkboxRow}
        onPress={() => setPrivacyAccepted(!privacyAccepted)}
        accessibilityRole="checkbox"
        accessibilityLabel={t("signup.privacyCheckboxA11y")}
        accessibilityState={{ checked: privacyAccepted }}
      >
        <View style={[styles.checkboxBox, privacyAccepted && styles.checkboxBoxChecked]}>
          {privacyAccepted && <Text style={styles.checkboxMark}>✓</Text>}
        </View>
        <Text style={styles.checkboxText}>
          {t("signup.privacyAgreementPrefix")}{" "}
          <Text style={styles.checkboxLink} onPress={() => Linking.openURL(PRIVACY_URL)}>
            {t("signup.privacyPolicy")}
          </Text>{" "}
          {t("signup.and")}{" "}
          <Text style={styles.checkboxLink} onPress={() => Linking.openURL(TERMS_URL)}>
            {t("signup.termsOfService")}
          </Text>
        </Text>
      </TouchableOpacity>

      {loading ? (
        <ActivityIndicator size="large" color={colors.accent} style={{ margin: 20 }} />
      ) : (
        <TouchableOpacity
          style={[styles.primaryBtn, !canSubmit && styles.primaryBtnDisabled]}
          onPress={handleCreateAccount}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel={t("signup.createAccount")}
          accessibilityState={{ disabled: !canSubmit }}
        >
          <Text style={styles.primaryBtnText}>{t("signup.createAccount")}</Text>
        </TouchableOpacity>
      )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    padding: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  methodContainer: {
    flex: 1,
    backgroundColor: colors.text,
  },
  methodBackArrow: {
    position: "absolute",
    top: 56,
    left: 24,
    zIndex: 1,
  },
  backArrowOnDark: {
    fontSize: 22,
    color: "#fff",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  methodContent: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 24,
    paddingBottom: 44,
  },
  wordmarkOnDark: {
    fontFamily: font.display,
    fontWeight: "800",
    fontSize: 26,
    color: "#fff",
    textAlign: "center",
    marginBottom: 8,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  subheadingOnDark: {
    fontSize: 14,
    color: "rgba(255,255,255,0.8)",
    textAlign: "center",
    marginBottom: 22,
  },
  dividerLineOnDark: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  dividerTextOnDark: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "rgba(255,255,255,0.7)",
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
    textAlign: "center",
    marginBottom: 4,
  },
  subheading: {
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    marginBottom: 22,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
    marginBottom: 6,
    marginTop: 2,
  },
  // AppleAuthenticationButton forbids backgroundColor/borderRadius in its own
  // style prop (those go through buttonStyle/cornerRadius instead, see where
  // this is used) -- height is required or the button renders with zero size.
  appleBtn: {
    width: "100%",
    height: 48,
    marginBottom: 12,
  },
  oauthBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 12,
  },
  oauthText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 16,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    padding: 14,
    borderRadius: radius.md,
    marginBottom: 10,
    fontSize: 16,
  },
  dobField: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dobFieldValue: {
    fontSize: 16,
    color: colors.text,
    fontWeight: "600",
  },
  dobFieldPlaceholder: {
    fontSize: 16,
    color: colors.muted,
  },
  dobFieldIcon: {
    fontSize: 16,
    opacity: 0.6,
  },
  dobSheetScrim: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(10,12,18,0.4)",
  },
  dobSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingBottom: 20,
  },
  dobSheetBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dobSheetCancel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.muted,
  },
  dobSheetTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  dobSheetDone: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.accent,
  },
  helperText: {
    fontSize: 11.5,
    color: colors.muted,
    marginTop: 4,
    marginBottom: 14,
  },
  errorText: {
    fontSize: 11.5,
    color: colors.danger,
    marginTop: -6,
    marginBottom: 14,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 20,
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderWidth: 1.5,
    borderColor: colors.muted,
    borderRadius: 5,
    marginTop: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxBoxChecked: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  checkboxMark: {
    color: colors.accentText,
    fontSize: 13,
    fontWeight: "700",
  },
  checkboxText: {
    flex: 1,
    fontSize: 13,
    color: colors.muted,
    lineHeight: 19,
  },
  checkboxLink: {
    color: colors.accent,
    fontWeight: "600",
  },
  primaryBtn: {
    backgroundColor: colors.accent,
    padding: 16,
    borderRadius: radius.md,
  },
  primaryBtnDisabled: {
    opacity: 0.4,
  },
  primaryBtnText: {
    color: colors.accentText,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "700",
  },
});
