// Gamification badges — computed on the fly from /user/stats, no separate
// badge/streak schema. Adding a new badge is a one-line addition here.

import { UserStats } from "./api";

export interface Badge {
  id: string;
  emoji: string;
  label: string;
}

export interface BadgeStatus extends Badge {
  earned: boolean;
  requirement: string;
}

const BADGE_DEFS: { id: string; emoji: string; label: string; requirement: string; earned: (s: UserStats) => boolean }[] = [
  { id: "first_steps", emoji: "👣", label: "First Steps", requirement: "Complete 1 tour", earned: (s) => s.tours_completed >= 1 },
  { id: "regular_walker", emoji: "🚶", label: "Regular Walker", requirement: "Complete 5 tours", earned: (s) => s.tours_completed >= 5 },
  { id: "marathoner", emoji: "🏅", label: "Marathoner", requirement: "Walk 42km total", earned: (s) => s.total_distance_m >= 42_000 },
  { id: "explorer", emoji: "🧭", label: "Explorer", requirement: "Visit 3 different cities", earned: (s) => s.cities_visited >= 3 },
];

export function getEarnedBadges(stats: UserStats): Badge[] {
  return BADGE_DEFS.filter((b) => b.earned(stats)).map(({ id, emoji, label }) => ({ id, emoji, label }));
}

// Every badge, earned or not — powers the badge gallery screen (locked
// ones shown greyed out with what's needed to unlock them).
export function getAllBadges(stats: UserStats): BadgeStatus[] {
  return BADGE_DEFS.map(({ id, emoji, label, requirement, earned }) => ({
    id,
    emoji,
    label,
    requirement,
    earned: earned(stats),
  }));
}
