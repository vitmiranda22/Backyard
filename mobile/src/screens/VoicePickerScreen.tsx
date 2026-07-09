// Voice picker — choose which voice reads your narrations.
// Dramatic and Warm are premium; tapping either while on the free tier
// opens the paywall instead of selecting it.

import React, { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { Audio } from "expo-av";
import { getSettings, updateSettings, getVoiceSample } from "../services/api";
import { colors, font, radius } from "../theme";
import { showToast } from "../services/toast";
import { tap } from "../services/haptics";

const VOICES = [
  { id: "neutral", emoji: "🎙️", label: "Neutral", desc: "Clear and balanced narration", premium: false },
  { id: "dramatic", emoji: "🎭", label: "Dramatic", desc: "Bold, cinematic delivery", premium: true },
  { id: "warm", emoji: "☕", label: "Warm", desc: "Friendly, conversational tone", premium: true },
];

interface VoicePickerScreenProps {
  isPremium: boolean;
  onOpenPaywall: () => void;
  onBack: () => void;
}

export default function VoicePickerScreen({ isPremium, onOpenPaywall, onBack }: VoicePickerScreenProps) {
  const [current, setCurrent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    getSettings()
      .then((s) => setCurrent(s.preferred_voice))
      .catch((e) => {
        console.warn("Failed to load voice setting:", e.message);
        showToast("Couldn't load your voice setting.");
      })
      .finally(() => setLoading(false));

    return () => {
      soundRef.current?.unloadAsync();
    };
  }, []);

  async function handlePreview(voiceId: string) {
    tap();
    if (soundRef.current) {
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }
    setPreviewing(voiceId);
    try {
      const sample = await getVoiceSample(voiceId);
      const { sound } = await Audio.Sound.createAsync({ uri: sample.audio_url }, { shouldPlay: true });
      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setPreviewing(null);
        }
      });
    } catch (e: any) {
      console.warn("Failed to preview voice:", e.message);
      showToast("Couldn't play a preview right now.");
      setPreviewing(null);
    }
  }

  async function handleSelect(voiceId: string, premium: boolean) {
    tap();
    if (premium && !isPremium) {
      onOpenPaywall();
      return;
    }
    setCurrent(voiceId);
    setSaving(true);
    try {
      await updateSettings({ preferred_voice: voiceId });
    } catch (e: any) {
      console.warn("Failed to update voice:", e.message);
      showToast("Couldn't save your voice choice.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backBtn} onPress={onBack} accessibilityRole="button" accessibilityLabel="Back">
        <Text style={styles.backText}>‹ Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Narration voice</Text>
      <Text style={styles.subtitle}>Pick who tells your story</Text>

      {VOICES.map((voice) => {
        const locked = voice.premium && !isPremium;
        const selected = current === voice.id;
        return (
          <TouchableOpacity
            key={voice.id}
            style={[styles.card, selected && styles.cardSelected]}
            onPress={() => handleSelect(voice.id, voice.premium)}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel={`${voice.label} voice${locked ? ", premium" : ""}${selected ? ", selected" : ""}`}
          >
            <Text style={styles.emoji}>{voice.emoji}</Text>
            <View style={styles.info}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>{voice.label}</Text>
                {voice.premium && (
                  <View style={styles.premiumBadge}>
                    <Text style={styles.premiumBadgeText}>{locked ? "PRO" : "PRO ✓"}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.desc}>{voice.desc}</Text>
            </View>
            <TouchableOpacity
              style={styles.previewBtn}
              onPress={() => handlePreview(voice.id)}
              disabled={previewing === voice.id}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel={`Preview ${voice.label} voice`}
            >
              <Text style={styles.previewBtnText}>{previewing === voice.id ? "…" : "▶"}</Text>
            </TouchableOpacity>
            {selected && <Text style={styles.check}>✓</Text>}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: 20,
    paddingTop: 60,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.bg,
  },
  backBtn: {
    position: "absolute",
    top: 56,
    left: 20,
    zIndex: 1,
  },
  backText: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: "600",
  },
  title: {
    fontFamily: font.display,
    fontSize: 24,
    color: colors.text,
    textAlign: "center",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
    marginBottom: 24,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    borderRadius: radius.md,
    marginBottom: 10,
  },
  cardSelected: {
    borderColor: colors.accent,
  },
  emoji: {
    fontSize: 26,
    marginRight: 14,
  },
  info: {
    flex: 1,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  desc: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  premiumBadge: {
    backgroundColor: colors.pro,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  premiumBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.proText,
  },
  check: {
    fontSize: 18,
    color: colors.accent,
    fontWeight: "700",
    marginLeft: 8,
  },
  previewBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  previewBtnText: {
    fontSize: 12,
    color: colors.text,
  },
});
