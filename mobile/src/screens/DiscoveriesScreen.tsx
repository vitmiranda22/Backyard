// Discoveries — the caller's personal collection of narrated places+moods
// (see backend/migrations/034_discoveries.sql). Header/back-button layout
// mirrors ToursScreen.tsx's real pattern (a separate back-button row, then
// a full-width centered header Text below it) rather than a side-by-side
// row, since a side-by-side layout can't center the title against an
// asymmetric back button without extra spacer work.

import React, { useEffect, useMemo, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { getDiscoveries, Discovery } from "../services/api";
import EmptyState from "../components/EmptyState";
import { colors, font, radius, type, spacing } from "../theme";
import { tap } from "../services/haptics";
import { MOOD_IDS } from "../services/moods";

const MASCOT_IMAGE = require("../../assets/bosco-empty-state-square.jpg");

// No per-mood color mapping exists elsewhere in the theme yet -- scoped
// here rather than added to the shared theme until a second screen
// actually needs it too.
const MOOD_ACCENT: Record<string, { ink: string; bg: string }> = {
  time_machine: { ink: "#4A5C94", bg: "#E6EAF5" },
  hidden_city: { ink: "#3C4F35", bg: "#E7EDE2" },
  dark_side: { ink: "#8A3B3B", bg: "#F3E4E2" },
  behind_scenes: { ink: "#6B4A8A", bg: "#EEE5F3" },
  unfiltered: { ink: "#B4791F", bg: "#F6EBD9" },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// The backend only stores a teaser, not a display name -- deriving one
// client-side (first clause up to the first period, capped) avoids a
// second source of truth for something purely presentational.
function deriveName(teaser: string): string {
  const firstSentence = teaser.split(".")[0].trim();
  return firstSentence.length > 46 ? `${firstSentence.slice(0, 46)}…` : firstSentence;
}

interface DiscoveriesScreenProps {
  onBack: () => void;
}

export default function DiscoveriesScreen({ onBack }: DiscoveriesScreenProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [discoveries, setDiscoveries] = useState<Discovery[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [activeMood, setActiveMood] = useState<string | null>(null);

  function load() {
    setFailed(false);
    getDiscoveries()
      .then((res) => setDiscoveries(res.discoveries))
      .catch((e: any) => {
        console.warn("Failed to load discoveries:", e.message);
        setFailed(true);
      });
  }

  useEffect(load, []);

  const stats = useMemo(() => {
    if (!discoveries) return { collected: 0, neighborhoods: 0, moods: 0 };
    return {
      collected: discoveries.length,
      neighborhoods: new Set(discoveries.map((d) => d.neighborhood).filter(Boolean)).size,
      moods: new Set(discoveries.map((d) => d.mood)).size,
    };
  }, [discoveries]);

  const filtered = useMemo(() => {
    if (!discoveries) return [];
    return activeMood ? discoveries.filter((d) => d.mood === activeMood) : discoveries;
  }, [discoveries, activeMood]);

  return (
    <View style={styles.container}>
      <View style={{ paddingTop: Math.max(insets.top, 54) + 12, paddingHorizontal: 20 }}>
        <TouchableOpacity onPress={onBack} accessibilityRole="button" accessibilityLabel={t("common.back")}>
          <Text style={styles.backArrow}>‹ {t("common.back")}</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.header}>{t("discoveries.title")}</Text>

      {discoveries && discoveries.length > 0 && (
        <View style={styles.statRow}>
          <View style={styles.statTile}>
            <Text style={styles.statValue}>{stats.collected}</Text>
            <Text style={styles.statLabel}>{t("discoveries.statCollected")}</Text>
          </View>
          <View style={styles.statTile}>
            <Text style={styles.statValue}>{stats.neighborhoods}</Text>
            <Text style={styles.statLabel}>{t("discoveries.statNeighborhoods")}</Text>
          </View>
          <View style={styles.statTile}>
            <Text style={styles.statValue}>{stats.moods}</Text>
            <Text style={styles.statLabel}>{t("discoveries.statMoods")}</Text>
          </View>
        </View>
      )}

      {discoveries && discoveries.length > 0 && (
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterRow}
          contentContainerStyle={styles.filterRowContent}
          data={[null, ...MOOD_IDS]}
          keyExtractor={(m) => m ?? "all"}
          renderItem={({ item: mood }) => (
            <TouchableOpacity
              style={[styles.chip, activeMood === mood && styles.chipActive]}
              onPress={() => {
                tap();
                setActiveMood(mood);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: activeMood === mood }}
              testID={`filter-chip-${mood ?? "all"}`}
            >
              <Text style={[styles.chipText, activeMood === mood && styles.chipTextActive]}>
                {mood ? t(`moods.${mood}.label`) : t("discoveries.filterAll")}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}

      <FlatList
        data={filtered}
        keyExtractor={(d) => d.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          !discoveries && !failed ? (
            <EmptyState message={t("discoveries.loading")} />
          ) : failed ? (
            <EmptyState message={t("discoveries.failedToLoad")} isError onRetry={load} />
          ) : (
            <EmptyState
              image={MASCOT_IMAGE}
              imageAccessibilityLabel={t("login.mascotA11y")}
              message={t("discoveries.empty")}
            />
          )
        }
        renderItem={({ item }) => {
          const accent = MOOD_ACCENT[item.mood] ?? MOOD_ACCENT.unfiltered;
          return (
            <View style={styles.card} testID="discovery-card">
              <View style={styles.cardTop}>
                <View style={[styles.moodTag, { backgroundColor: accent.bg }]}>
                  <Text style={[styles.moodTagText, { color: accent.ink }]}>{t(`moods.${item.mood}.label`)}</Text>
                </View>
                <Text style={styles.date}>{formatDate(item.discovered_at)}</Text>
              </View>
              <Text style={styles.cardName}>{deriveName(item.teaser)}</Text>
              <Text style={styles.cardPlace}>
                {[item.street_name, item.neighborhood].filter(Boolean).join(" · ")}
              </Text>
              <Text style={styles.cardTeaser}>“{item.teaser}”</Text>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.parchmentBg,
  },
  backArrow: {
    fontFamily: font.headingBold,
    fontSize: 20,
    lineHeight: 26,
    color: colors.fieldMuted,
  },
  header: {
    fontFamily: font.headingBold,
    fontSize: 34,
    lineHeight: 47,
    color: colors.ink,
    textAlign: "center",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  statRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  statTile: {
    flex: 1,
    backgroundColor: colors.parchmentSurface,
    borderWidth: 1,
    borderColor: colors.fieldBorderSoft,
    borderRadius: radius.md,
    paddingVertical: 10,
    alignItems: "center",
  },
  statValue: {
    fontFamily: font.headingBold,
    fontSize: 22,
    color: colors.ink,
  },
  statLabel: {
    fontFamily: font.sans,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    color: colors.fieldMuted,
    marginTop: 2,
  },
  filterRow: {
    flexGrow: 0,
    marginBottom: 12,
  },
  filterRowContent: {
    paddingHorizontal: 20,
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    borderRadius: radius.pill,
    paddingHorizontal: 13,
    paddingVertical: 6,
  },
  chipActive: {
    backgroundColor: colors.fieldGreen,
    borderColor: colors.fieldGreen,
  },
  chipText: {
    fontFamily: font.sansBold,
    fontSize: 13,
    color: colors.fieldMuted,
  },
  chipTextActive: {
    color: colors.parchmentSurface,
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    flexGrow: 1,
  },
  card: {
    backgroundColor: colors.parchmentSurface,
    borderWidth: 1,
    borderColor: colors.fieldBorderSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: 12,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  moodTag: {
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  moodTagText: {
    fontFamily: font.sansBold,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  date: {
    fontFamily: font.sans,
    fontSize: type.caption,
    color: colors.fieldMuted,
  },
  cardName: {
    fontFamily: font.heading,
    fontSize: 19,
    color: colors.ink,
    marginTop: 8,
    marginBottom: 2,
  },
  cardPlace: {
    fontFamily: font.sans,
    fontSize: type.caption,
    color: colors.fieldMuted,
    marginBottom: 8,
  },
  cardTeaser: {
    fontFamily: font.serifItalic,
    fontSize: type.label,
    lineHeight: 20,
    color: colors.ink,
    opacity: 0.85,
  },
});
