// Voice picker — choose your narrator's voice

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

const VOICES = [
  { id: "neutral", emoji: "🎙️", label: "Neutral", desc: "Calm, measured, documentary style" },
  { id: "dramatic", emoji: "🎭", label: "Dramatic", desc: "Deep, suspenseful, storyteller" },
  { id: "warm", emoji: "☀️", label: "Warm", desc: "Friendly, enthusiastic, conversational" },
];

interface VoicePickerProps {
  onSelect: (voice: string) => void;
}

export default function VoicePickerScreen({ onSelect }: VoicePickerProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pick your voice</Text>
      <Text style={styles.subtitle}>Your narrator for this tour</Text>

      {VOICES.map((voice) => (
        <TouchableOpacity
          key={voice.id}
          style={styles.voiceCard}
          onPress={() => onSelect(voice.id)}
        >
          <Text style={styles.emoji}>{voice.emoji}</Text>
          <View style={styles.voiceInfo}>
            <Text style={styles.voiceLabel}>{voice.label}</Text>
            <Text style={styles.voiceDesc}>{voice.desc}</Text>
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
  voiceCard: {
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
  voiceInfo: {
    flex: 1,
  },
  voiceLabel: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#fff",
  },
  voiceDesc: {
    fontSize: 13,
    color: "#999",
    marginTop: 2,
  },
});
