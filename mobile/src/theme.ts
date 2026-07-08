// Backyard — "Dawn Air" design tokens
//
// Light, cool-toned palette with a sunset-coral accent. Shared across
// screens so colors/type don't get re-invented per file.

import { Platform } from "react-native";

export const colors = {
  bg: "#EEF1FB",
  surface: "#FFFFFF",
  surfaceAlt: "#F3F4F9",
  border: "#E3E5F1",
  text: "#1B1E27",
  muted: "#6B7280",
  accent: "#FF6B4A",
  accentText: "#FFFFFF",
  pro: "#1F7A6C",
  proText: "#EAFFF9",
  danger: "#D64545",
};

export const font = {
  // Serif for headlines/greetings; body text just uses the system default
  // (omit fontFamily entirely rather than pass undefined).
  display: Platform.select({ ios: "Georgia", android: "serif", default: "Georgia" }),
};

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  pill: 999,
};
