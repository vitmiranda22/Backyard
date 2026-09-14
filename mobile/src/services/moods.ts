// Shared mood icon lookup -- the hand-drawn "Field Guide" line-art icons
// (see mobile/assets/icons/) that replaced the raw mood emoji everywhere
// a tour's mood is shown as a small marker (Home's Recent Stories, the
// Journal list, Route Detail, the Map's mood filter).

import { ImageSourcePropType } from "react-native";

export const MOOD_IDS = ["time_machine", "hidden_city", "dark_side", "behind_scenes", "unfiltered"] as const;

export const MOOD_ICONS: Record<string, ImageSourcePropType> = {
  time_machine: require("../../assets/icons/time_machine.png"),
  hidden_city: require("../../assets/icons/hidden_city.png"),
  dark_side: require("../../assets/icons/dark_side.png"),
  behind_scenes: require("../../assets/icons/behind_scenes.png"),
  unfiltered: require("../../assets/icons/unfiltered.png"),
};

// Fallback for a tour whose mood isn't in the map (shouldn't happen in
// practice, but formatMeta-style helpers elsewhere fell back to a plain
// map-pin emoji, so the icon fallback mirrors that).
export const FALLBACK_MOOD_ICON: ImageSourcePropType = require("../../assets/icons/fallback_route.png");
