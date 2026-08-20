// Gamification badges — computed on the fly from /user/stats, no separate
// badge/streak schema. Adding a new badge is a one-line addition here.

import { ImageSourcePropType } from "react-native";
import { UserStats } from "./api";

// label/requirement text lives in i18n (badges.<id>.label / .requirement in
// src/i18n/locales/*.json), not here — this file only knows ids, icons, and
// earn logic, so callers must translate via t(`badges.${id}.label`).
export interface Badge {
  id: string;
  emoji: string;
  // Real wood-carved artwork, once it exists for this badge -- see
  // mobile/assets/badges/. Falls back to the emoji until then, so a badge
  // can ship with a placeholder and get its real icon later with no other
  // code changes.
  icon?: ImageSourcePropType;
}

export interface BadgeStatus extends Badge {
  earned: boolean;
}

const BADGE_DEFS: { id: string; emoji: string; icon?: ImageSourcePropType; earned: (s: UserStats) => boolean }[] = [
  { id: "first_steps", emoji: "👣", icon: require("../../assets/badges/first_steps.png"), earned: (s) => s.tours_completed >= 1 },
  { id: "on_a_roll", emoji: "🔥", icon: require("../../assets/badges/on_a_roll.png"), earned: (s) => s.longest_streak_days >= 3 },
  { id: "week_streak", emoji: "🔥🔥", icon: require("../../assets/badges/week_streak.png"), earned: (s) => s.longest_streak_days >= 7 },
  { id: "iron_streak", emoji: "🏆", icon: require("../../assets/badges/iron_streak.png"), earned: (s) => s.longest_streak_days >= 30 },
  { id: "marathoner", emoji: "🏅", icon: require("../../assets/badges/marathoner.png"), earned: (s) => s.total_distance_m >= 75_000 },
  { id: "century_club", emoji: "💯", icon: require("../../assets/badges/century_club.png"), earned: (s) => s.total_distance_m >= 200_000 },
  { id: "explorer", emoji: "🧭", icon: require("../../assets/badges/explorer.png"), earned: (s) => s.cities_visited >= 5 },
  { id: "world_traveler", emoji: "🌍", icon: require("../../assets/badges/world_traveler.png"), earned: (s) => s.cities_visited >= 10 },
  { id: "completionist", emoji: "🌟", icon: require("../../assets/badges/completionist.png"), earned: (s) => s.moods_tried.length >= 5 },
  // Not yet drawn -- stay on the emoji fallback until their artwork exists.
  { id: "night_owl", emoji: "🌙", earned: (s) => s.night_streak_days >= 7 },
  { id: "early_bird", emoji: "🌅", earned: (s) => s.early_streak_days >= 7 },
  { id: "storyteller", emoji: "📖", earned: (s) => s.routes_published >= 8 },
  { id: "crowd_favorite", emoji: "❤️", earned: (s) => s.total_likes_received >= 30 },
];

export function getEarnedBadges(stats: UserStats): Badge[] {
  return BADGE_DEFS.filter((b) => b.earned(stats)).map(({ id, emoji, icon }) => ({ id, emoji, icon }));
}

// Every badge, earned or not — powers the badge gallery screen (locked
// ones shown greyed out with what's needed to unlock them).
export function getAllBadges(stats: UserStats): BadgeStatus[] {
  return BADGE_DEFS.map(({ id, emoji, icon, earned }) => ({
    id,
    emoji,
    icon,
    earned: earned(stats),
  }));
}
