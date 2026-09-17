// Narration card — the bottom card showing the current narration
//
// Shows: a floating "popup" photo peeking above the card, a peek-drawer
// transcript (a few lines + tap to read the full story), and audio
// controls. Has loading and error states.

import React, { useState } from "react";
import { View, Text, Image, StyleSheet, ActivityIndicator, Modal, TouchableOpacity, ScrollView, Linking } from "react-native";
import { useTranslation } from "react-i18next";
import AudioPlayer from "./AudioPlayer";
import ZonePhoto from "./ZonePhoto";
import EmptyState from "./EmptyState";
import { colors, font, radius, type, spacing } from "../theme";

const LOCATION_ICON = require("../../assets/icons/location.png");

export interface NarrationHighlight {
  text: string;
  url: string;
}

interface NarrationCardProps {
  isLoading: boolean;
  error: string | null;
  streetName: string | null;
  narrationText: string | null;
  // A short transition line generated in the background AFTER narrationText
  // was already shown (see narrate.py's _generate_connector_in_background),
  // picked up by ActiveTourScreen's poll and passed in here once ready.
  // Rendered underlined ahead of narrationText so it visibly reads as new.
  transitionPrefix?: string | null;
  // Same background-generated pattern as transitionPrefix, but only ever
  // set for the tour's final block -- a beat that resolves the whole walk,
  // rendered underlined AFTER narrationText instead of before it.
  closingSuffix?: string | null;
  audioUrl: string | null;
  imageUrl?: string | null;
  // Premium-only, real-Wikipedia-article links matched against this exact
  // narration's wording (see backend/app/services/zone_data.py's
  // find_wikipedia_highlights) — empty/undefined for free users, so this
  // renders as plain text with no extra logic needed on this end for tier
  // gating.
  highlights?: NarrationHighlight[] | null;
  onAudioFinished?: () => void;
  onSkip?: () => void;
  onAudioError?: () => void;
  onRetry?: () => void;
}

// Splits narration text around each highlight's exact substring (already
// matched server-side, same casing as it appears in the text) into plain
// and tappable spans. Highlights are pre-sorted by position, so a single
// left-to-right pass with a running cursor is enough — each match only
// ever looks for the FIRST occurrence at or after the cursor, matching
// the backend's own re.search behavior.
function renderWithHighlights(text: string, highlights: NarrationHighlight[] | null | undefined) {
  if (!highlights || highlights.length === 0) {
    return text;
  }

  const nodes: React.ReactNode[] = [];
  let cursor = 0;

  highlights.forEach((h, i) => {
    const idx = text.indexOf(h.text, cursor);
    if (idx === -1) return; // shouldn't happen (server matched this exact text), but never crash over it
    if (idx > cursor) {
      nodes.push(text.slice(cursor, idx));
    }
    nodes.push(
      <Text
        key={`hl-${i}`}
        style={narrationLinkStyle}
        onPress={() => Linking.openURL(h.url)}
        accessibilityRole="link"
      >
        {h.text}
      </Text>
    );
    cursor = idx + h.text.length;
  });

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }
  return nodes;
}

const narrationLinkStyle = {
  color: colors.fieldGreen,
  textDecorationLine: "underline" as const,
};

const transitionPrefixStyle = {
  textDecorationLine: "underline" as const,
};

// Renders the background-generated transition line (if any) as an
// underlined leading span, with a trailing space so it reads as one
// sentence flowing into narrationText right after it.
function renderTransitionPrefix(transitionPrefix: string | null | undefined) {
  if (!transitionPrefix) return null;
  return <Text style={transitionPrefixStyle}>{transitionPrefix} </Text>;
}

// Same idea as renderTransitionPrefix, mirrored for the trailing side --
// a leading space so it reads as narrationText flowing into this beat.
function renderClosingSuffix(closingSuffix: string | null | undefined) {
  if (!closingSuffix) return null;
  return <Text style={transitionPrefixStyle}> {closingSuffix}</Text>;
}

export default function NarrationCard({
  isLoading,
  error,
  streetName,
  narrationText,
  transitionPrefix,
  closingSuffix,
  audioUrl,
  imageUrl,
  highlights,
  onAudioFinished,
  onSkip,
  onAudioError,
  onRetry,
}: NarrationCardProps) {
  const { t } = useTranslation();
  const [fullTextOpen, setFullTextOpen] = useState(false);

  if (isLoading) {
    return (
      <View style={styles.card}>
        <View style={styles.content}>
          <ActivityIndicator size="small" color={colors.ink} />
          <Text style={styles.loadingText}>{t("narrationCard.finding")}</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.card}>
        <View style={styles.content}>
          <EmptyState message={error} isError onRetry={onRetry} fill={false} />
        </View>
      </View>
    );
  }

  if (!narrationText) {
    return (
      <View style={styles.card}>
        <View style={styles.content}>
          <Text style={styles.emptyText}>
            {t("narrationCard.walkAround")}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <View style={styles.card}>
        <View style={styles.content}>
          {/* Street name — a location label, not the content itself, so it
              reads as secondary (small-caps eyebrow) rather than competing
              with the actual story below it for the same glance. */}
          <View style={styles.streetNameRow}>
            <Image source={LOCATION_ICON} style={styles.streetNameIcon} resizeMode="contain" />
            <Text style={styles.streetName}>{streetName}</Text>
          </View>

          {/* The narration text IS the product -- this is what someone
              opened the app to hear, so it carries the primary reading
              weight on this card, not the label above it. Peek drawer: a
              few lines, tap to read the full story in the modal below. */}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setFullTextOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t("narrationCard.readFullStoryA11y")}
          >
            <Text style={styles.narrationText} numberOfLines={5} ellipsizeMode="tail">
              {renderTransitionPrefix(transitionPrefix)}
              {narrationText}
              {renderClosingSuffix(closingSuffix)}
            </Text>
            <Text style={styles.expandHint}>{t("narrationCard.swipeUpHint")}</Text>
          </TouchableOpacity>

          {/* Audio controls */}
          <AudioPlayer
            audioUrl={audioUrl}
            onFinished={onAudioFinished}
            onSkip={onSkip}
            onError={onAudioError}
          />
        </View>
      </View>

      {/* Photo floats as a popup peeking above the card, instead of sitting
          flush inside it — tap to expand full-screen (see ZonePhoto). */}
      {imageUrl && (
        <View style={styles.photoPopup}>
          <ZonePhoto uri={imageUrl} thumbnailStyle={styles.photoImage} />
        </View>
      )}

      <Modal
        visible={fullTextOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setFullTextOpen(false)}
      >
        <View style={styles.modalScrim}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalStreetNameRow}>
              <Image source={LOCATION_ICON} style={styles.modalStreetNameIcon} resizeMode="contain" />
              <Text style={styles.modalStreetName}>{streetName}</Text>
            </View>
            <ScrollView style={styles.modalScroll}>
              <Text style={styles.modalText}>
                {renderTransitionPrefix(transitionPrefix)}
                {renderWithHighlights(narrationText, highlights)}
                {renderClosingSuffix(closingSuffix)}
              </Text>
            </ScrollView>
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setFullTextOpen(false)}
              accessibilityRole="button"
              accessibilityLabel={t("narrationCard.closeFullStoryA11y")}
            >
              <Text style={styles.modalCloseBtnText}>{t("narrationCard.close")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    // No clipping here — the popup photo needs to poke above the card.
  },
  card: {
    backgroundColor: colors.parchmentSurface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    borderBottomWidth: 0,
    overflow: "hidden",
    maxHeight: 460,
  },
  photoPopup: {
    position: "absolute",
    top: -34,
    right: 18,
    transform: [{ rotate: "-4deg" }],
    borderRadius: radius.md,
    backgroundColor: colors.parchmentSurface,
    padding: spacing.xs,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  photoImage: {
    width: 118,
    height: 88,
    borderRadius: radius.sm,
    backgroundColor: colors.parchmentBg,
  },
  content: {
    padding: spacing.md,
    paddingTop: 26,
  },
  streetNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 10,
  },
  streetNameIcon: {
    width: 14,
    height: 14,
    tintColor: colors.fieldMuted,
  },
  streetName: {
    fontFamily: font.cursiveBold,
    fontSize: 15,
    lineHeight: 21,
    letterSpacing: 0.2,
    color: colors.fieldMuted,
    maxWidth: "85%",
  },
  narrationText: {
    fontFamily: font.serifItalic,
    fontSize: type.body,
    color: colors.ink,
    lineHeight: 26,
  },
  expandHint: {
    fontFamily: font.cursiveBold,
    fontSize: 15,
    lineHeight: 21,
    color: colors.fieldGreen,
    textAlign: "center",
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  loadingText: {
    fontFamily: font.cursiveBold,
    color: colors.fieldMuted,
    textAlign: "center",
    marginTop: spacing.sm,
    fontSize: 17,
    lineHeight: 23,
  },
  emptyText: {
    fontFamily: font.serifItalic,
    color: colors.fieldMuted,
    textAlign: "center",
    fontSize: type.label,
    padding: 20,
  },
  modalScrim: {
    flex: 1,
    backgroundColor: "rgba(36, 29, 18, 0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: colors.parchmentSurface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: 20,
    maxHeight: "70%",
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.fieldBorder,
    alignSelf: "center",
    marginBottom: 14,
  },
  modalStreetNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 12,
  },
  modalStreetNameIcon: {
    width: 20,
    height: 20,
    tintColor: colors.ink,
  },
  modalStreetName: {
    fontFamily: font.cursiveBold,
    fontSize: 22,
    lineHeight: 29,
    color: colors.ink,
  },
  modalScroll: {
    marginBottom: spacing.md,
  },
  modalText: {
    fontFamily: font.serifItalic,
    fontSize: 16,
    color: colors.ink,
    lineHeight: 25,
  },
  modalCloseBtn: {
    backgroundColor: colors.parchmentBg,
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    borderRadius: radius.md,
    padding: 14,
  },
  modalCloseBtnText: {
    fontFamily: font.cursiveBold,
    textAlign: "center",
    fontSize: 20,
    lineHeight: 26,
    color: colors.ink,
  },
});
