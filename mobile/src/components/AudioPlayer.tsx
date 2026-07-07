// Audio player component — plays narration MP3s from R2 signed URLs
//
// Supports: play, pause, skip, progress bar, background playback

import React, { useState, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Audio } from "expo-av";

interface AudioPlayerProps {
  audioUrl: string | null;
  onFinished?: () => void;
  onSkip?: () => void;
  onError?: () => void;
}

export default function AudioPlayer({
  audioUrl,
  onFinished,
  onSkip,
  onError,
}: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const soundRef = useRef<Audio.Sound | null>(null);

  // Enable background audio
  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: true,
      playsInSilentModeIOS: true,
    });
  }, []);

  // Load and play audio when URL changes
  useEffect(() => {
    if (!audioUrl) return;

    let isCancelled = false;

    async function loadAudio() {
      // Unload previous sound
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      try {
        const { sound } = await Audio.Sound.createAsync(
          { uri: audioUrl! },
          { shouldPlay: true },
          (status) => {
            if (isCancelled) return;
            if (status.isLoaded) {
              setPositionMs(status.positionMillis || 0);
              setDurationMs(status.durationMillis || 0);
              setIsPlaying(status.isPlaying);

              // Narration finished
              if (status.didJustFinish && onFinished) {
                onFinished();
              }
            } else if (status.error) {
              console.error("Audio playback error:", status.error);
              if (onError) onError();
            }
          }
        );
        soundRef.current = sound;
      } catch (e) {
        console.error("Failed to load audio:", e);
        if (onError) onError();
      }
    }

    loadAudio();

    return () => {
      isCancelled = true;
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, [audioUrl]);

  async function togglePlayPause() {
    if (!soundRef.current) return;
    if (isPlaying) {
      await soundRef.current.pauseAsync();
    } else {
      await soundRef.current.playAsync();
    }
  }

  function handleSkip() {
    if (soundRef.current) {
      soundRef.current.stopAsync();
    }
    if (onSkip) onSkip();
  }

  function formatTime(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, "0")}`;
  }

  const progress = durationMs > 0 ? positionMs / durationMs : 0;

  if (!audioUrl) {
    return (
      <View style={styles.container}>
        <Text style={styles.fallbackText}>🔇 Audio unavailable — reading mode</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity onPress={togglePlayPause} style={styles.playBtn}>
          <Text style={styles.playBtnText}>{isPlaying ? "⏸" : "▶️"}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleSkip} style={styles.skipBtn}>
          <Text style={styles.skipBtnText}>⏭</Text>
        </TouchableOpacity>
      </View>

      {/* Progress bar */}
      <View style={styles.progressContainer}>
        <Text style={styles.timeText}>{formatTime(positionMs)}</Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.timeText}>{formatTime(durationMs)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    marginBottom: 8,
  },
  playBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#4A90D9",
    alignItems: "center",
    justifyContent: "center",
  },
  playBtnText: {
    fontSize: 20,
  },
  skipBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#666",
    alignItems: "center",
    justifyContent: "center",
  },
  skipBtnText: {
    fontSize: 16,
  },
  progressContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  timeText: {
    fontSize: 12,
    color: "#999",
    width: 40,
    textAlign: "center",
  },
  progressBar: {
    flex: 1,
    height: 4,
    backgroundColor: "#333",
    borderRadius: 2,
  },
  progressFill: {
    height: 4,
    backgroundColor: "#4A90D9",
    borderRadius: 2,
  },
  fallbackText: {
    textAlign: "center",
    color: "#999",
    fontSize: 14,
    padding: 12,
  },
});
