// Top-level crash safety net. Without this, an uncaught render error
// anywhere in the tree white-screens the whole app with no recovery —
// mount this once, wrapping everything in App.tsx. Must be a class
// component; React has no hook equivalent of componentDidCatch.

import React from "react";
import { StyleSheet, Text, View, Pressable } from "react-native";
import * as Sentry from "@sentry/react-native";
import * as Updates from "expo-updates";
import { withTranslation, WithTranslation } from "react-i18next";
import { colors, radius } from "../theme";

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
        <Text style={styles.title}>{t("errorBoundary.title")}</Text>
        <Text style={styles.body}>{t("errorBoundary.body")}</Text>
        <Pressable style={styles.button} onPress={this.handleRestart}>
          <Text style={styles.buttonText}>{t("errorBoundary.restart")}</Text>
        </Pressable>
      </View>
    );
  }
}

export default withTranslation()(ErrorBoundary);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 10,
    textAlign: "center",
  },
  body: {
    fontSize: 14.5,
    color: colors.muted,
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 21,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  buttonText: {
    color: colors.accentText,
    fontSize: 15,
    fontWeight: "700",
  },
});
