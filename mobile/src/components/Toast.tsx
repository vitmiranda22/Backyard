// ToastHost — mount once at the root of the app. Subscribes to toast.ts's
// pub-sub and renders a non-blocking banner near the top of the screen,
// auto-dismissing after a few seconds.

import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text } from "react-native";
import { _setToastListener } from "../services/toast";
import { colors, radius } from "../theme";

const DISMISS_AFTER_MS = 2800;

export default function ToastHost() {
  const [toast, setToast] = useState<{ message: string; type: "error" | "success" } | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    _setToastListener((message, type) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setToast({ message, type });
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      timerRef.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => {
          setToast(null);
        });
      }, DISMISS_AFTER_MS);
    });
    return () => {
      _setToastListener(null);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [opacity]);

  if (!toast) return null;

  return (
    <Animated.View
      style={[
        styles.banner,
        { backgroundColor: toast.type === "error" ? colors.danger : colors.pro, opacity },
      ]}
      pointerEvents="none"
    >
      <Text style={styles.text}>{toast.message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    top: 54,
    left: 20,
    right: 20,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
    zIndex: 999,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  text: {
    color: "#FFFFFF",
    fontSize: 13.5,
    fontWeight: "600",
    textAlign: "center",
  },
});
