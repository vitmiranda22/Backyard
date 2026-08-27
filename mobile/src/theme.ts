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
  // Darkened from #6B7280 -- that failed WCAG AA contrast (4.5:1) on both
  // `bg` (~4.28:1) and `surfaceAlt` (~4.40:1), including on compliance-
  // relevant text like the Paywall's Terms/Privacy links. This clears
  // AA with real headroom on every surface color (5.3-6.0:1), which
  // matters more than usual here since this app is mostly used outdoors
  // in bright sunlight, where effective contrast perception drops.
  muted: "#5A6472",
  accent: "#FF6B4A",
  accentText: "#FFFFFF",
  pro: "#1F7A6C",
  proText: "#EAFFF9",
  danger: "#D64545",
  // "Low info" zone flag on the Home map — deliberately warm/amber, not
  // danger's red, since this isn't an error state, just a heads-up.
  lowInfo: "#C9922B",
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
