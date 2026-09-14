// Home screen — "Field Guide" journal cover. Replaces the old full-bleed
// map (that's now its own MapScreen, reached via the Map FAB below): a
// parchment landing page with the app's identity up top, a 3-icon FAB row
// for the main actions, and a preview of the walker's own recent stories.

import React, { useState, useEffect } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getTours, getUserStats, TourSummary, UserStats } from "../services/api";
import { getAllBadges, BadgeStatus } from "../services/badges";
import { MOOD_ICONS, FALLBACK_MOOD_ICON } from "../services/moods";
import { colors, font, radius, type, spacing } from "../theme";
import { tap } from "../services/haptics";

// Same mascot/pose already used for ToursScreen's own empty states -- Home's
// "Recent Stories" list is the same kind of content, so it gets the same
// on-brand illustrated empty state instead of a bare line of text.
const MASCOT_IMAGE = require("../../assets/bosco-empty-state-square.jpg");

// Home only teases a handful of badges (easiest-first, same order as the
// full gallery) -- the complete set lives one tap away in Badge Gallery.
const BADGE_PREVIEW_LIMIT = 5;

// Kept short so the stories list never crowds the FAB row below it --
// the full history lives one tap away in the Journal.
const RECENT_STORIES_LIMIT = 2;

function formatMeta(t: TFunction, tour: TourSummary) {
  // total_distance_m is only ever null before a tour is finalized -- a
  // finished tour that covered no real distance (ended seconds after it
  // started) legitimately saves 0, which `!tour.total_distance_m` used to
  // treat the same as "still in progress." Only null means unfinished.
  if (tour.total_distance_m == null) return t("tours.inProgress");
  const km = (tour.total_distance_m / 1000).toFixed(1);
  const min = tour.duration_sec ? Math.round(tour.duration_sec / 60) : null;
  return min ? `${km} km · ${min} min` : `${km} km`;
}

interface HomeScreenProps {
  onStartTour: () => void;
  onSelectRoute: (tourId: string) => void;
  onOpenMap: () => void;
  onOpenJournal: () => void;
  onOpenProfile: () => void;
  onOpenBadges: () => void;
}

export default function HomeScreen({
  onStartTour,
  onSelectRoute,
  onOpenMap,
  onOpenJournal,
  onOpenProfile,
  onOpenBadges,
}: HomeScreenProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [recentTours, setRecentTours] = useState<TourSummary[] | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [badges, setBadges] = useState<BadgeStatus[]>([]);

  useEffect(() => {
    getTours()
      .then((tours) => setRecentTours(tours.slice(0, RECENT_STORIES_LIMIT)))
      .catch((e: any) => console.warn("Failed to load recent tours:", e.message));

    getUserStats()
      .then((userStats) => {
        setStats(userStats);
        setBadges(getAllBadges(userStats).slice(0, BADGE_PREVIEW_LIMIT));
      })
      .catch((e: any) => console.warn("Failed to load stats:", e.message));
  }, []);

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Image
          source={require("../../assets/lOGOBACKYARD.png")}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel={t("home.logoA11y")}
        />
      </View>

      {stats && (
        <>
          <View style={styles.statsSection}>
            <Text style={[styles.statsSectionLabel, styles.centerText]}>{t("profile.yourStats")}</Text>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{stats.tours_completed}</Text>
                <Text style={styles.statLabel}>{t("profile.statTours")}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{(stats.total_distance_m / 1000).toFixed(1)}</Text>
                <Text style={styles.statLabel}>{t("profile.statKm")}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{stats.cities_visited}</Text>
                <Text style={styles.statLabel}>{t("profile.statCities")}</Text>
              </View>
            </View>
          </View>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.badgesSection}
            onPress={onOpenBadges}
            accessibilityRole="button"
            accessibilityLabel={t("profile.viewAllBadgesA11y")}
          >
            <Text style={[styles.sectionLabel, styles.centerText]}>{t("profile.badges")}</Text>
            <View style={styles.badgeRowCentered}>
              {badges.map((b) => {
                const icon = b.earned ? b.icon : b.greyIcon ?? b.icon;
                return (
                  <View key={b.id} style={styles.badgeChip}>
                    {icon ? (
                      <Image source={icon} style={styles.badgeIconImage} resizeMode="contain" />
                    ) : (
                      <Text style={[styles.badgeEmoji, !b.earned && styles.badgeEmojiLocked]}>{b.emoji}</Text>
                    )}
                  </View>
                );
              })}
            </View>
          </TouchableOpacity>

          <View style={styles.divider} />
        </>
      )}

      <View style={styles.storiesSection}>
        <Text style={[styles.sectionLabel, styles.centerText]}>{t("home.recentStories")}</Text>
        {recentTours && recentTours.length === 0 ? (
          <View style={styles.emptyFill}>
            <Image
              source={MASCOT_IMAGE}
              style={styles.emptyImage}
              accessibilityLabel={t("login.mascotA11y")}
            />
            <Text style={styles.emptyText}>{t("home.noRecentStories")}</Text>
          </View>
        ) : (
          recentTours?.map((tour) => (
            <TouchableOpacity
              key={tour.tour_id}
              style={styles.storyRow}
              onPress={() => onSelectRoute(tour.tour_id)}
              accessibilityRole="button"
            >
              <View style={styles.storyIconWrap}>
                <Image source={MOOD_ICONS[tour.mood] ?? FALLBACK_MOOD_ICON} style={styles.storyIcon} resizeMode="contain" />
              </View>
              <View style={styles.storyBody}>
                <Text style={styles.storyTitle} numberOfLines={1}>{tour.title}</Text>
                <Text style={styles.storyMeta}>{formatMeta(t, tour)}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          ))
        )}
      </View>

      <View style={styles.fabRow}>
        <View style={styles.fabWrap}>
          <TouchableOpacity
            style={styles.fabSecondary}
            onPress={() => {
              tap();
              onOpenMap();
            }}
            accessibilityRole="button"
            accessibilityLabel={t("home.map")}
          >
            <Image source={require("../../assets/icons/map.png")} style={styles.fabSecondaryIcon} resizeMode="contain" />
          </TouchableOpacity>
          <Text style={styles.fabLabel}>{t("home.map")}</Text>
        </View>

        <View style={styles.fabWrap}>
          <TouchableOpacity
            style={styles.fabPrimary}
            onPress={() => {
              tap();
              onStartTour();
            }}
            accessibilityRole="button"
            accessibilityLabel={t("home.explore")}
          >
            <Image source={require("../../assets/icons/explore.png")} style={styles.fabPrimaryIcon} resizeMode="contain" />
          </TouchableOpacity>
          <Text style={styles.fabLabelPrimary}>{t("home.explore")}</Text>
        </View>

        <View style={styles.fabWrap}>
          {/* Settings sits stacked directly above the Journal FAB, its own
              small button in normal flow -- not overlapping the icon. */}
          <TouchableOpacity
            style={styles.settingsAboveJournal}
            onPress={() => {
              tap();
              onOpenProfile();
            }}
            accessibilityRole="button"
            accessibilityLabel={t("home.settingsA11y")}
          >
            <Image source={require("../../assets/icons/settings.png")} style={styles.settingsAboveJournalIcon} resizeMode="contain" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.fabSecondary}
            onPress={() => {
              tap();
              onOpenJournal();
            }}
            accessibilityRole="button"
            accessibilityLabel={t("home.journal")}
          >
            <Image source={require("../../assets/icons/journal.png")} style={styles.fabSecondaryIcon} resizeMode="contain" />
          </TouchableOpacity>
          <Text style={styles.fabLabel}>{t("home.journal")}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent",
    paddingHorizontal: spacing.lg,
  },
  // Settings now lives on the Journal screen instead -- this header is
  // just the centered logo.
  header: {
    alignItems: "center",
    marginBottom: 4,
  },
  // Real content aspect ratio is ~2.28:1 (the source file is a square
  // canvas with a lot of transparent padding around the actual wood-sign
  // art) -- sized off height, not width, so it actually reads as big.
  logo: {
    width: 274,
    height: 120,
  },
  centerText: {
    textAlign: "center",
  },
  statsSection: {
    marginTop: spacing.md,
  },
  // "Your Stats" gets its own heading style (rather than reusing the
  // shared sectionLabel Badges/Recent Stories still use) so this one
  // section could be sized up on its own without dragging the others
  // along with it.
  statsSectionLabel: {
    fontFamily: font.cursiveBold,
    fontSize: 25,
    lineHeight: 35,
    color: colors.fieldMuted,
    marginBottom: spacing.sm,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "center",
    // Tightened from spacing.xl (32) -- the numbers/labels below grew 20%,
    // so the gap came down a notch to keep all three columns centered
    // and comfortably on-screen instead of stretching wider than before.
    // Reduced again (24 -> 23) alongside the 5% pull-back below.
    gap: 23,
  },
  statItem: {
    alignItems: "center",
  },
  statValue: {
    fontFamily: font.cursiveBold,
    fontSize: 36,
    lineHeight: 49,
    color: colors.ink,
  },
  statLabel: {
    fontFamily: font.cursive,
    fontSize: 17,
    lineHeight: 24,
    color: colors.fieldMuted,
    marginTop: 2,
  },
  badgesSection: {
    alignItems: "center",
  },
  badgeRowCentered: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: spacing.sm,
  },
  badgeChip: {
    width: 50,
    height: 50,
    borderRadius: 28,
    backgroundColor: colors.parchmentSurface,
    borderWidth: 1.5,
    borderColor: colors.fieldBorder,
    justifyContent: "center",
    alignItems: "center",
  },
  badgeEmoji: {
    fontSize: type.label,
  },
  badgeEmojiLocked: {
    opacity: 0.35,
  },
  // A thin ruled line between sections -- the "lines in a journal" feel,
  // instead of pure whitespace, marking the page as one composed sheet.
  divider: {
    height: 1,
    backgroundColor: colors.fieldBorderSoft,
    marginVertical: spacing.md,
  },
  badgeIconImage: {
    width: 31,
    height: 31,
  },
  fabRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "flex-end",
    gap: 28,
    marginTop: spacing.lg,
  },
  fabWrap: {
    alignItems: "center",
    gap: 6,
  },
  settingsAboveJournal: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.parchmentSurface,
    borderWidth: 1.5,
    borderColor: colors.fieldBorder,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  settingsAboveJournalIcon: {
    width: 15,
    height: 15,
    tintColor: colors.ink,
  },
  fabPrimary: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.ink,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabPrimaryIcon: {
    width: 34,
    height: 34,
    tintColor: colors.parchmentSurface,
  },
  fabSecondary: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.parchmentSurface,
    borderWidth: 1.5,
    borderColor: colors.fieldBorder,
    justifyContent: "center",
    alignItems: "center",
  },
  fabSecondaryIcon: {
    width: 23,
    height: 23,
    tintColor: colors.ink,
  },
  fabLabel: {
    fontFamily: font.cursiveBold,
    fontSize: 17,
    lineHeight: 23,
    color: colors.fieldMuted,
  },
  fabLabelPrimary: {
    fontFamily: font.cursiveBold,
    fontSize: 20,
    lineHeight: 26,
    color: colors.ink,
  },
  // Claims whatever vertical space is left between Badges and the FAB row
  // pinned at the bottom -- without this, a short (or empty) story list
  // left a big dead gap instead of the FAB row sitting flush at the bottom.
  storiesSection: {
    flex: 1,
  },
  sectionLabel: {
    fontFamily: font.cursiveBold,
    fontSize: 22,
    lineHeight: 31,
    color: colors.fieldMuted,
    marginBottom: spacing.sm,
  },
  emptyFill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: spacing.xl,
  },
  emptyImage: {
    width: 130,
    height: 130,
    borderRadius: 65,
    marginBottom: spacing.md,
  },
  emptyText: {
    fontFamily: font.serifItalic,
    fontSize: 17,
    color: colors.fieldMuted,
    textAlign: "center",
  },
  storyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.fieldBorderSoft,
  },
  storyIconWrap: {
    width: 39,
    height: 39,
    borderRadius: 22,
    backgroundColor: colors.parchmentSurface,
    borderWidth: 1,
    borderColor: colors.fieldBorderSoft,
    justifyContent: "center",
    alignItems: "center",
  },
  storyIcon: {
    width: 22,
    height: 22,
    tintColor: colors.ink,
  },
  storyBody: {
    flex: 1,
  },
  storyTitle: {
    fontFamily: font.cursiveBold,
    fontSize: 21,
    lineHeight: 28,
    color: colors.ink,
  },
  storyMeta: {
    fontFamily: font.cursive,
    fontSize: 15,
    lineHeight: 21,
    color: colors.fieldMuted,
  },
  chevron: {
    color: colors.fieldMuted,
    fontSize: 22,
  },
});
