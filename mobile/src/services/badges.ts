// Gamification badges — computed on the fly from /user/stats, no separate
// badge/streak schema. Adding a new badge is a one-line addition here.

import { UserStats } from "./api";

// label/requirement text lives in i18n (badges.<id>.label / .requirement in
// src/i18n/locales/*.json), not here — this file only knows ids, emoji, and
// earn logic, so callers must translate via t(`badges.${id}.label`).
export interface Badge {
  id: string;
  emoji: string;
}

export interface BadgeStatus extends Badge {
  earned: boolean;
}

const BADGE_DEFS: { id: string; emoji: string; earned: (s: UserStats) => boolean }[] = [
  { id: "first_steps", emoji: "👣", earned: (s) => s.tours_completed >= 1 },
  { id: "regular_walker", emoji: "🚶", earned: (s) => s.tours_completed >= 5 },
  { id: "marathoner", emoji: "🏅", earned: (s) => s.total_distance_m >= 42_000 },
  { id: "explorer", emoji: "🧭", earned: (s) => s.cities_visited >= 3 },
  { id: "century_club", emoji: "💯", earned: (s) => s.total_distance_m >= 100_000 },
  { id: "world_traveler", emoji: "🌍", earned: (s) => s.cities_visited >= 5 },
  { id: "completionist", emoji: "🌟", earned: (s) => s.moods_tried.length >= 5 },
  { id: "night_owl", emoji: "🌙", earned: (s) => s.walked_at_night },
  { id: "early_bird", emoji: "🌅", earned: (s) => s.walked_early },
  { id: "storyteller", emoji: "📖", earned: (s) => s.routes_published >= 3 },
  { id: "crowd_favorite", emoji: "❤️", earned: (s) => s.total_likes_received >= 10 },
];

export function getEarnedBadges(stats: UserStats): Badge[] {
  return BADGE_DEFS.filter((b) => b.earned(stats)).map(({ id, emoji }) => ({ id, emoji }));
}

// Every badge, earned or not — powers the badge gallery screen (locked
// ones shown greyed out with what's needed to unlock them).
export function getAllBadges(stats: UserStats): BadgeStatus[] {
  return BADGE_DEFS.map(({ id, emoji, earned }) => ({
    id,
    emoji,
    earned: earned(stats),
  }));
}
