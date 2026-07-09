// Star rating — read-only display or interactive 1-5 input.

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { colors } from "../theme";
import { tap } from "../services/haptics";

interface StarRatingProps {
  value: number;
  onChange?: (value: number) => void;
  size?: number;
}

export default function StarRating({ value, onChange, size = 16 }: StarRatingProps) {
  const rounded = Math.round(value);
  const interactive = !!onChange;

  return (
    <View style={styles.row}>
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= rounded;
        if (!interactive) {
          return (
            <View key={star} accessibilityElementsHidden>
              <Text style={[styles.star, { fontSize: size, color: filled ? colors.accent : colors.border }]}>
                {filled ? "★" : "☆"}
              </Text>
            </View>
          );
        }
        return (
          <TouchableOpacity
            key={star}
            onPress={() => {
              tap();
              onChange!(star);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Rate ${star} out of 5 stars`}
          >
            <Text style={[styles.star, { fontSize: size, color: filled ? colors.accent : colors.border }]}>
              {filled ? "★" : "☆"}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 2,
  },
  star: {
    marginRight: 1,
  },
});
