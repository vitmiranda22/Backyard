// "Go deeper": a full-screen, multi-chapter story about one rich place,
// opened from the walking card. Chapters are generated on demand; the next
// one is fetched while the current one plays so there's no silent gap
// between them (so at most one chapter is ever generated unheard).

import React, { useEffect, useRef, useState } from "react";
import { Modal, View, Text, Image, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import AudioPlayer from "./AudioPlayer";
import { getDeepDiveOutline, getDeepDiveChapter, DeepDiveOutline, DeepDiveChapter, ApiError } from "../services/api";
import { colors, font, type, spacing, radius } from "../theme";

interface DeepDiveSheetProps {
  visible: boolean;
  // Where the current block was narrated: the backend reads that block's cached data.
  origin: { lat: number; lng: number } | null;
  mood: string;
  voice: string;
  contentSafety: boolean;
  imageUrl?: string | null;
  onClose: () => void;
}

function formatMinutes(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  return `${Math.floor(totalSec / 60)}:${(totalSec % 60).toString().padStart(2, "0")}`;
}

export default function DeepDiveSheet({ visible, origin, mood, voice, contentSafety, imageUrl, onClose }: DeepDiveSheetProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [outline, setOutline] = useState<DeepDiveOutline | null>(null);
  const [chapters, setChapters] = useState<Record<number, DeepDiveChapter>>({});
  const [current, setCurrent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Indexes already requested, so the prefetch and a tap never fetch the same chapter twice.
  const requestedRef = useRef<Set<number>>(new Set());
  // Bumped on every open, so a late response from a closed story is dropped.
  const sessionRef = useRef(0);

  useEffect(() => {
    if (!visible || !origin) return;
    const session = ++sessionRef.current;
    setOutline(null);
    setChapters({});
    setCurrent(0);
    setError(null);
    requestedRef.current = new Set();
    getDeepDiveOutline(origin.lat, origin.lng, mood)
      .then((o) => {
        if (sessionRef.current !== session) return;
        setOutline(o);
        fetchChapter(o, 0, session);
      })
      .catch((e) => sessionRef.current === session && setError(errorMessage(e)));
    return () => {
      sessionRef.current++;
    };
  }, [visible]);

  function errorMessage(e: unknown): string {
    if (e instanceof ApiError && e.code === "daily_limit_exceeded") return t("activeTour.narrationDailyLimitError");
    if (e instanceof ApiError && e.code === "deep_dive_unavailable") return t("deepDive.unavailable");
    return t("deepDive.error");
  }

  function fetchChapter(o: DeepDiveOutline, index: number, session = sessionRef.current) {
    if (!origin || index >= o.chapters.length || requestedRef.current.has(index)) return;
    requestedRef.current.add(index);
    getDeepDiveChapter(origin.lat, origin.lng, mood, voice, contentSafety, o, index)
      .then((c) => {
        if (sessionRef.current !== session) return;
        setChapters((prev) => ({ ...prev, [index]: c }));
      })
      .catch((e) => {
        requestedRef.current.delete(index); // allow a retry by tapping the row
        if (sessionRef.current === session) setError(errorMessage(e));
      });
  }

  // Prefetch the next chapter as soon as the current one is ready to play.
  useEffect(() => {
    if (outline && chapters[current]) fetchChapter(outline, current + 1);
  }, [outline, chapters, current]);

  function selectChapter(index: number) {
    if (!outline) return;
    setError(null);
    setCurrent(index);
    fetchChapter(outline, index);
  }

  const playing = chapters[current];
  const totalMin = outline ? Math.round((outline.chapters.length * 135) / 60) : 0;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.hero}>
          {imageUrl ? <Image source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
          <TouchableOpacity
            style={[styles.backBtn, { top: Math.max(insets.top, 20) + 10 }]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t("deepDive.back")}
          >
            <Text style={styles.backText}>‹  {t("deepDive.back")}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Text style={styles.eyebrow}>
            {t("deepDive.eyebrow")} · {t(`moods.${mood}.label`)}
          </Text>
          {outline ? (
            <>
              <Text style={styles.title}>{outline.title}</Text>
              <Text style={styles.meta}>
                {t("deepDive.meta", { place: outline.place, count: outline.chapters.length, minutes: totalMin })}
              </Text>
            </>
          ) : !error ? (
            <View style={styles.planning}>
              <ActivityIndicator color={colors.ink} />
              <Text style={styles.meta}>{t("deepDive.planning")}</Text>
            </View>
          ) : null}

          {error && <Text style={styles.error}>{error}</Text>}

          {outline && (
            <View style={styles.nowPlaying}>
              <Text style={styles.nowLabel}>{t("deepDive.nowPlaying", { number: current + 1 })}</Text>
              {playing ? (
                <>
                  <Text style={styles.chapterText}>{playing.text}</Text>
                  <AudioPlayer
                    audioUrl={playing.audio_url}
                    onFinished={() => {
                      if (current + 1 < outline.chapters.length) selectChapter(current + 1);
                    }}
                    onSkip={() => {
                      if (current + 1 < outline.chapters.length) selectChapter(current + 1);
                    }}
                  />
                </>
              ) : (
                !error && (
                  <View style={styles.planning}>
                    <ActivityIndicator color={colors.ink} />
                    <Text style={styles.meta}>{t("deepDive.preparing")}</Text>
                  </View>
                )
              )}
            </View>
          )}

          {outline?.chapters.map((title, i) => {
            const isCurrent = i === current;
            const ready = chapters[i];
            return (
              <TouchableOpacity
                key={i}
                style={[styles.row, i < outline.chapters.length - 1 && styles.rowDivider]}
                onPress={() => selectChapter(i)}
                accessibilityRole="button"
                accessibilityState={{ selected: isCurrent }}
              >
                <View style={[styles.num, isCurrent ? styles.numActive : styles.numIdle]}>
                  <Text style={[styles.numText, isCurrent && styles.numTextActive]}>{i + 1}</Text>
                </View>
                <Text style={[styles.rowTitle, isCurrent && styles.rowTitleActive]}>{title}</Text>
                <Text style={[styles.rowMeta, isCurrent && styles.rowMetaActive]}>
                  {isCurrent ? t("deepDive.playing") : ready?.audio_duration_ms ? formatMinutes(ready.audio_duration_ms) : ""}
                </Text>
              </TouchableOpacity>
            );
          })}

          <Text style={styles.footer}>{t("deepDive.leaveAnytime")}</Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.parchmentBg },
  hero: { height: 200, backgroundColor: colors.fieldBorder },
  backBtn: {
    position: "absolute",
    left: spacing.md,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    backgroundColor: colors.parchmentSurface,
    justifyContent: "center",
  },
  backText: { fontFamily: font.sansBold, fontSize: type.label, color: colors.ink },
  body: { paddingHorizontal: 20, paddingTop: 18, gap: spacing.xs },
  eyebrow: {
    fontFamily: font.sansBold,
    fontSize: type.caption,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.fieldMuted,
  },
  title: { fontFamily: font.heading, fontSize: 28, lineHeight: 32, color: colors.ink },
  meta: { fontFamily: font.sans, fontSize: type.label, color: colors.fieldMuted },
  planning: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md },
  error: { fontFamily: font.sans, fontSize: type.label, color: colors.ink, paddingVertical: spacing.sm },
  nowPlaying: {
    marginTop: 14,
    marginBottom: spacing.sm,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    backgroundColor: colors.parchmentSurface,
    gap: 10,
  },
  nowLabel: { fontFamily: font.sansBold, fontSize: 13, color: colors.fieldGreen },
  chapterText: { fontFamily: font.script, fontSize: 21, lineHeight: 28, color: colors.ink },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 4 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.fieldBorder },
  num: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  numActive: { backgroundColor: colors.fieldGreen },
  numIdle: { borderWidth: 1.5, borderColor: colors.fieldMuted },
  numText: { fontFamily: font.sansBold, fontSize: 13, color: colors.fieldMuted },
  numTextActive: { color: colors.parchmentSurface },
  rowTitle: { flex: 1, fontFamily: font.sans, fontSize: 15, color: colors.ink },
  rowTitleActive: { fontFamily: font.sansBold },
  rowMeta: { fontFamily: font.sans, fontSize: 13, color: colors.fieldMuted },
  rowMetaActive: { color: colors.fieldGreen },
  footer: {
    marginTop: spacing.lg,
    textAlign: "center",
    fontFamily: font.sans,
    fontSize: type.caption,
    color: colors.fieldMuted,
  },
});
