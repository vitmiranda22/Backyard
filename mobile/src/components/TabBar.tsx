// Bottom tab bar — Home / Tours / Profile
//
// Only shown on the three main screens. The active-tour flow (mood picker,
// active tour, tour complete) is a full-screen sequence without the tab bar.

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { colors } from "../theme";
import { tap } from "../services/haptics";

export type MainTab = "home" | "tours" | "profile";

const TABS: { id: MainTab; icon: string; labelKey: string }[] = [
  { id: "home", icon: "⌂", labelKey: "common.home" },
  { id: "tours", icon: "▤", labelKey: "tours.header" },
  { id: "profile", icon: "◔", labelKey: "profile.header" },
];

export default function TabBar({
  active,
  onChange,
}: {
  active: MainTab;
  onChange: (tab: MainTab) => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.bar}>
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        const label = t(tab.labelKey);
        return (
          <TouchableOpacity
            key={tab.id}
            style={styles.tab}
            onPress={() => {
              tap();
              onChange(tab.id);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={t("tabBar.tabA11y", { label })}
          >
            <Text style={[styles.icon, isActive && styles.iconActive]}>{tab.icon}</Text>
            <Text style={[styles.label, isActive && styles.labelActive]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
    paddingBottom: 22,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  icon: {
    fontSize: 20,
    color: colors.muted,
  },
  iconActive: {
    color: colors.accent,
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.muted,
  },
  labelActive: {
    color: colors.accent,
  },
});
