// Mood picker — choose your tour mood before starting

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

const MOODS = [
  { id: "informative", emoji: "📚", label: "Informative", desc: "Facts, history, architecture" },
  { id: "haunted", emoji: "👻", label: "Haunted", desc: "Ghost stories, dark history, mystery" },
  { id: "celebrity", emoji: "⭐", label: "Celebrity", desc: "Famous people, films, pop culture" },
  { id: "curiosities", emoji: "🔮", label: "Curiosities", desc: "Weird facts, hidden gems, oddities" },
];

interface MoodPickerProps {
  onSelect: (mood: string) => void;
}

export default function MoodPickerScreen({ onSelect }: MoodPickerProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pick your mood</Text>
      <Text style={styles.subtitle}>Same streets, completely different stories</Text>

      {MOODS.map((mood) => (
        <TouchableOpacity
          key={mood.id}
          style={styles.moodCard}
          onPress={() => onSelect(mood.id)}
        >
          <Text style={styles.emoji}>{mood.emoji}</Text>
          <View style={styles.moodInfo}>
            <Text style={styles.moodLabel}>{mood.label}</Text>
            <Text style={styles.moodDesc}>{mood.desc}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0d0d1a",
    padding: 20,
    justifyContent: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#fff",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
    marginBottom: 30,
  },
  moodCard: {
    flexDirection: "row",
    backgroundColor: "#1a1a2e",
    padding: 18,
    borderRadius: 14,
    marginBottom: 12,
    alignItems: "center",
  },
  emoji: {
    fontSize: 32,
    marginRight: 16,
  },
  moodInfo: {
    flex: 1,
  },
  moodLabel: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#fff",
  },
  moodDesc: {
    fontSize: 13,
    color: "#999",
    marginTop: 2,
  },
});
