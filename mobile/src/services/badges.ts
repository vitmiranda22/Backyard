// Gamification badges — computed on the fly from /user/stats, no separate
// badge/streak schema. Adding a new badge is a one-line addition here.

import { UserStats } from "./api";

export interface Badge {
  id: string;
  emoji: string;
  label: string;
}

const BADGE_DEFS: { id: string; emoji: string; label: string; earned: (s: UserStats) => boolean }[] = [
  { id: "first_steps", emoji: "👣", label: "First Steps", earned: (s) => s.tours_completed >= 1 },
  { id: "regular_walker", emoji: "🚶", label: "Regular Walker", earned: (s) => s.tours_completed >= 5 },
  { id: "marathoner", emoji: "🏅", label: "Marathoner", earned: (s) => s.total_distance_m >= 42_000 },
  { id: "explorer", emoji: "🧭", label: "Explorer", earned: (s) => s.cities_visited >= 3 },
];

export function getEarnedBadges(stats: UserStats): Badge[] {
  return BADGE_DEFS.filter((b) => b.earned(stats)).map(({ id, emoji, label }) => ({ id, emoji, label }));
}
