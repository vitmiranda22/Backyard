// Top-level crash safety net. Without this, an uncaught render error
// anywhere in the tree white-screens the whole app with no recovery —
// mount this once, wrapping everything in App.tsx. Must be a class
// component; React has no hook equivalent of componentDidCatch.

import React from "react";
import { StyleSheet, Text, View, Pressable } from "react-native";
import * as Sentry from "@sentry/react-native";
import * as Updates from "expo-updates";
import { withTranslation, WithTranslation } from "react-i18next";
import { colors, font, radius, type, spacing } from "../theme";
import BoscoHero from "./BoscoHero";

// Bosco, apologetic and scratching his head -- full-bleed, same
// gradient-scrim template as the other host-layer screens.
const MASCOT_IMAGE = require("../../assets/bosco-error.jpg");

interface Props extends WithTranslation {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
  }

  handleRestart = async () => {
    try {
      if (!__DEV__) {
        await Updates.reloadAsync();
        return;
      }
    } catch (e) {
      // Fall through to the in-place reset below.
    }
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const { t } = this.props;
    return (
      <View style={styles.container}>
        <BoscoHero
          image={MASCOT_IMAGE}
          imageAccessibilityLabel={t("login.mascotA11y")}
          imageTopOffset="-52%"
          topScrim={{ opacity: 0.55, heightPercent: "26%" }}
          scrimColors={["rgba(10,12,18,0)", "rgba(10,12,18,0)", "rgba(10,12,18,0.55)", "rgba(10,12,18,0.93)"]}
          scrimLocations={[0, 0.6, 0.76, 1]}
        >
          <Text style={styles.topTitle}>{t("errorBoundary.title")}</Text>

          <View style={styles.content}>
            <Text style={styles.body}>{t("errorBoundary.body")}</Text>
            <Pressable style={styles.button} onPress={this.handleRestart}>
              <Text style={styles.buttonText}>{t("errorBoundary.restart")}</Text>
            </Pressable>
          </View>
        </BoscoHero>
      </View>
    );
  }
}

export default withTranslation()(ErrorBoundary);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.text,
  },
  topTitle: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 56,
    paddingHorizontal: spacing.lg,
    fontFamily: font.display,
    fontSize: type.headline,
    color: "#fff",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
  },
  content: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.xl,
    paddingBottom: 44,
    alignItems: "center",
  },
  body: {
    fontSize: 14.5,
    color: "#fff",
    textAlign: "center",
    marginBottom: spacing.lg,
    lineHeight: 21,
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
  },
  buttonText: {
    color: colors.accentText,
    fontSize: 15,
    fontWeight: "700",
  },
});
