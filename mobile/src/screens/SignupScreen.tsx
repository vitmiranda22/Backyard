// Create Account screen — "The Guide" direction. Two steps in one
// component: pick a method (Google/Apple visible but disabled -- both
// need native modules + OAuth credentials that don't exist yet, see the
// mockup review notes -- or Email), then, for Email, a details form
// collecting name/DOB/password plus a required Privacy Policy/Terms
// acceptance checkbox. DOB is read server-side to age-gate the app's
// mature content mode (see backend is_user_underage) -- entered as three
// plain text fields rather than a native date picker, which would also
// need a new build to add.

import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Linking,
} from "react-native";
import { useTranslation } from "react-i18next";
import { signUp } from "../services/auth";
import { track } from "../services/analytics";
import { colors, font, radius } from "../theme";

const PRIVACY_URL = "https://backyard-api.onrender.com/privacy";
const TERMS_URL = "https://backyard-api.onrender.com/terms";

type Step = "method" | "email";

interface SignupScreenProps {
  onBack: () => void;
  onSignedUp: () => void;
}

export default function SignupScreen({ onBack, onSignedUp }: SignupScreenProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>("method");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [month, setMonth] = useState("");
  const [day, setDay] = useState("");
  const [year, setYear] = useState("");
  const [password, setPassword] = useState("");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [loading, setLoading] = useState(false);

  function parsedDob(): string | null {
    const m = parseInt(month, 10);
    const d = parseInt(day, 10);
    const y = parseInt(year, 10);
    if (!m || !d || !y || m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > new Date().getFullYear()) {
      return null;
    }
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  const canSubmit =
    fullName.trim().length > 0 &&
    email.trim().length > 0 &&
    parsedDob() !== null &&
    password.length >= 6 &&
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
    const dob = parsedDob();
    if (!dob) {
      Alert.alert(t("common.error"), t("signup.invalidDob"));
      return;
    }
    if (!privacyAccepted) {
      Alert.alert(t("common.error"), t("signup.mustAcceptPrivacy"));
      return;
    }

    setLoading(true);
    try {
      await signUp(email.trim(), password, fullName.trim(), dob);
      track("signup_completed");
      Alert.alert(t("common.success"), t("signup.accountCreated"));
      onSignedUp();
    } catch (e: any) {
      Alert.alert(t("signup.signUpFailed"), e.message || t("common.tryAgain"));
    }
    setLoading(false);
  }

  if (step === "method") {
    return (
      <View style={styles.container}>
        <TouchableOpacity onPress={onBack} accessibilityRole="button" accessibilityLabel={t("signup.backA11y")}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>

        <Text style={styles.brand}>{t("login.title")}</Text>
        <Text style={styles.heading}>{t("signup.joinHeading")}</Text>
        <Text style={styles.subheading}>{t("signup.methodSubtitle")}</Text>

        <View style={styles.oauthBtn}>
          <Text style={styles.oauthText}>{t("signup.continueWithGoogle")}</Text>
          <View style={styles.soonTag}>
            <Text style={styles.soonTagText}>{t("common.soon")}</Text>
          </View>
        </View>
        <View style={styles.oauthBtn}>
          <Text style={styles.oauthText}>{t("signup.continueWithApple")}</Text>
          <View style={styles.soonTag}>
            <Text style={styles.soonTagText}>{t("common.soon")}</Text>
          </View>
        </View>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>{t("signup.or")}</Text>
          <View style={styles.dividerLine} />
        </View>

        <TouchableOpacity style={styles.primaryBtn} onPress={() => setStep("email")}>
          <Text style={styles.primaryBtnText}>{t("signup.continueWithEmail")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
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
      <View style={styles.dobRow}>
        <TextInput
          style={[styles.input, styles.dobInput]}
          placeholder={t("signup.dobMonthPlaceholder")}
          placeholderTextColor={colors.muted}
          value={month}
          onChangeText={setMonth}
          keyboardType="number-pad"
          maxLength={2}
        />
        <TextInput
          style={[styles.input, styles.dobInput]}
          placeholder={t("signup.dobDayPlaceholder")}
          placeholderTextColor={colors.muted}
          value={day}
          onChangeText={setDay}
          keyboardType="number-pad"
          maxLength={2}
        />
        <TextInput
          style={[styles.input, styles.dobInput, styles.dobYearInput]}
          placeholder={t("signup.dobYearPlaceholder")}
          placeholderTextColor={colors.muted}
          value={year}
          onChangeText={setYear}
          keyboardType="number-pad"
          maxLength={4}
        />
      </View>
      <Text style={styles.helperText}>{t("signup.dobHelper")}</Text>

      <TextInput
        style={styles.input}
        placeholder={t("signup.passwordPlaceholder")}
        placeholderTextColor={colors.muted}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <Text style={styles.helperText}>{t("signup.passwordHelper")}</Text>

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
  brand: {
    fontFamily: font.display,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: colors.muted,
    marginBottom: 14,
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
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
    marginBottom: 6,
    marginTop: 2,
  },
  oauthBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 12,
    opacity: 0.6,
  },
  oauthText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
  },
  soonTag: {
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  soonTagText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.muted,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: colors.muted,
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
  dobRow: {
    flexDirection: "row",
    gap: 10,
  },
  dobInput: {
    flex: 1,
    textAlign: "center",
    marginBottom: 0,
  },
  dobYearInput: {
    flex: 1.4,
  },
  helperText: {
    fontSize: 11.5,
    color: colors.muted,
    marginTop: 4,
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
