// Event detail sheet — slide-up modal shown when a Backyard Events pin is
// tapped on the map. Follows NarrationCard's Modal/slide-up pattern (same
// scrim + parchment sheet + handle) since this is text/metadata, not an
// image viewer (ZonePhoto's pattern).

import React from "react";
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView } from "react-native";
import { useTranslation } from "react-i18next";
import WaypointCompass from "./WaypointCompass";
import { NearbyEvent } from "../services/api";
import { bearingBetween, compassLabel, distanceMeters } from "../services/location";
import { colors, font, radius, type, spacing } from "../theme";

interface EventDetailSheetProps {
  event: NearbyEvent | null;
  visible: boolean;
  onClose: () => void;
  // The compass points from here toward the event's centroid — null (no
  // fix yet) just hides the compass rather than blocking the rest of the
  // sheet from showing.
  userLocation: { lat: number; lng: number } | null;
}

// "2h", "40m", "3d" — deliberately terse (matches WaypointCompass's own
// "42m · NE" density) rather than a full "2 hours" sentence.
function formatDuration(ms: number): string {
  const minutes = Math.round(Math.abs(ms) / 60000);
  if (minutes < 60) return `${Math.max(minutes, 1)}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export default function EventDetailSheet({ event, visible, onClose, userLocation }: EventDetailSheetProps) {
  const { t } = useTranslation();

  if (!event) return null;

  const now = Date.now();
  const start = new Date(event.start_time).getTime();
  const end = new Date(event.end_time).getTime();

  let phaseLabel: string;
  if (now < start) {
    phaseLabel = t("events.phaseStartsIn", { time: formatDuration(start - now) });
  } else if (now > end) {
    phaseLabel = t("events.phaseEndedAgo", { time: formatDuration(now - end) });
  } else {
    phaseLabel = t("events.phaseHappeningNow");
  }

  const distanceLabel =
    event.distance_m != null ? t("events.distanceAway", { distance: `${Math.round(event.distance_m)}m` }) : null;

  const bearingDeg = userLocation
    ? bearingBetween(userLocation.lat, userLocation.lng, event.center_lat, event.center_lng)
    : null;
  const compassDistance = userLocation
    ? distanceMeters(userLocation.lat, userLocation.lng, event.center_lat, event.center_lng)
    : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalScrim}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />

          <View style={styles.headerRow}>
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryBadgeText}>{t(`events.category.${event.category}`)}</Text>
            </View>
            <Text style={styles.phaseLabel}>{phaseLabel}</Text>
          </View>

          <Text style={styles.name}>{event.name}</Text>
          {distanceLabel && <Text style={styles.distance}>{distanceLabel}</Text>}

          <ScrollView style={styles.scroll}>
            <Text style={styles.description}>{event.description || t("events.noDescription")}</Text>
          </ScrollView>

          {bearingDeg !== null && compassDistance !== null && (
            <View style={styles.compassRow}>
              <WaypointCompass
                bearingDeg={bearingDeg}
                distanceLabel={`${Math.round(compassDistance)}m · ${compassLabel(bearingDeg)}`}
              />
            </View>
          )}

          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t("events.closeA11y")}
          >
            <Text style={styles.closeBtnText}>{t("events.close")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
    maxHeight: "75%",
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.fieldBorder,
    alignSelf: "center",
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  categoryBadge: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  categoryBadgeText: {
    fontFamily: font.sansBold,
    fontSize: type.caption,
    color: colors.accentText,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  phaseLabel: {
    fontFamily: font.cursiveBold,
    fontSize: 16,
    color: colors.fieldGreen,
  },
  name: {
    fontFamily: font.cursiveBold,
    fontSize: 26,
    lineHeight: 32,
    color: colors.ink,
    marginBottom: 4,
  },
  distance: {
    fontFamily: font.sansMedium,
    fontSize: type.label,
    color: colors.fieldMuted,
    marginBottom: spacing.sm,
  },
  scroll: {
    marginBottom: spacing.md,
  },
  description: {
    fontFamily: font.serifItalic,
    fontSize: 16,
    color: colors.ink,
    lineHeight: 25,
  },
  compassRow: {
    alignItems: "center",
    marginBottom: spacing.md,
  },
  closeBtn: {
    backgroundColor: colors.parchmentBg,
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    borderRadius: radius.md,
    padding: 14,
  },
  closeBtnText: {
    fontFamily: font.cursiveBold,
    textAlign: "center",
    fontSize: 20,
    lineHeight: 26,
    color: colors.ink,
  },
});
