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
  { id: "century_club", emoji: "💯", label: "Century Club", requirement: "Walk 100km total", earned: (s) => s.total_distance_m >= 100_000 },
  { id: "world_traveler", emoji: "🌍", label: "World Traveler", requirement: "Visit 5 different cities", earned: (s) => s.cities_visited >= 5 },
  { id: "completionist", emoji: "🌟", label: "Completionist", requirement: "Try all 5 moods", earned: (s) => s.moods_tried.length >= 5 },
  { id: "night_owl", emoji: "🌙", label: "Night Owl", requirement: "Walk a tour after 8pm", earned: (s) => s.walked_at_night },
  { id: "early_bird", emoji: "🌅", label: "Early Bird", requirement: "Walk a tour before 8am", earned: (s) => s.walked_early },
  { id: "storyteller", emoji: "📖", label: "Storyteller", requirement: "Publish 3 routes", earned: (s) => s.routes_published >= 3 },
  { id: "crowd_favorite", emoji: "❤️", label: "Crowd Favorite", requirement: "Get 10 likes on your routes", earned: (s) => s.total_likes_received >= 10 },
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
