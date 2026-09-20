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

  // "Field Guide" direction — sampled directly from mobile/mockups/
  // field_guide_mockup_v2.png's own pixels, not guessed. Additive, not a
  // replacement for the Dawn Air tokens above yet — screens migrate over
  // one at a time (see the design-direction plan), starting with this one.
  parchmentBg: "#F4EFE1",
  parchmentSurface: "#FBF7EA",
  ink: "#241D12",
  fieldMuted: "#96805F",
  fieldGreen: "#3C4F35",
  fieldBorder: "#E2D9C2",
  fieldBorderSoft: "#EBE3CD",

  // Paywall's own deliberate break from parchment -- a deep green/gold
  // "ticket" look reserved for that one screen, not a general-purpose pair.
  paywallBg: "#2E4028",
  paywallGold: "#C9A227",
  paywallText: "#F4EFDD",
};

export const font = {
  // Kept as an alias during the Field Guide migration -- existing screens
  // that haven't moved over yet still read `font.display`.
  display: Platform.select({ ios: "Georgia", android: "serif", default: "Georgia" }),

  // Field Guide type system (see mobile/App.tsx's useFonts call for the
  // loaded weights). DM Serif Display carries headlines, buttons and
  // labels -- it ships in one weight only, so heading and headingBold are
  // the same face (never pair headingBold with a fontWeight, which would
  // synthesize a fake bold). Cursive (Caveat) was too thin to read
  // outdoors at small sizes, so it's reserved for the tour narration
  // script only.
  heading: "DMSerifDisplay_400Regular",
  headingBold: "DMSerifDisplay_400Regular",
  script: "Caveat_600SemiBold",
  serif: "LibreBaskerville_700Bold",
  serifItalic: "LibreBaskerville_400Regular_Italic",
  sans: "WorkSans_400Regular",
  sansMedium: "WorkSans_500Medium",
  sansBold: "WorkSans_700Bold",
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
