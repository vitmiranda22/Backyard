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
  // WaypointCompass's "video-game HUD" look, deliberately its own dark/
  // neon palette rather than the rest of the light theme — tokenized
  // here so it's an intentional, named choice instead of a hardcoded
  // one-off, not because the look itself needed to change.
  hudBackground: "#181A24",
  hudAccent: "#FF9666",
};

export const font = {
  // Serif for headlines/greetings; body text just uses the system default
  // (omit fontFamily entirely rather than pass undefined).
  display: Platform.select({ ios: "Georgia", android: "serif", default: "Georgia" }),
};

// Named by role, not size — before this existed, every screen picked its
// own "this is the headline" number by hand (9 different values across
// the app for what was conceptually the same role). New screens should
// reach for one of these; existing screens are being migrated over
// incrementally, not all at once.
export const type = {
  display: 32, // full-bleed hero moments (Login, Safety modal)
  headline: 24, // standard screen headline — matches the existing majority value
  title: 18, // section/card titles
  body: 16, // primary reading text
  label: 14, // secondary/meta text, form labels
  caption: 12, // fine print, hints
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  pill: 999,
};
