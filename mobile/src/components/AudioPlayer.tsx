// Audio player component — plays narration MP3s from R2 signed URLs
//
// Supports: play, pause, skip, progress bar, background playback

import React, { useState, useEffect, useRef } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import { Audio } from "expo-av";
import { useTranslation } from "react-i18next";
import { colors, font, type, spacing } from "../theme";

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
  const { t } = useTranslation();
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
        // This effect may already have been cleaned up (a newer audioUrl
        // came in, or the component unmounted) while createAsync's network
        // fetch was still in flight -- shouldPlay:true means that sound
        // already started playing itself, so it must be unloaded here
        // rather than left to silently keep playing over whatever the
        // newer effect loads into soundRef.
        if (isCancelled) {
          sound.unloadAsync();
          return;
        }
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
        <Text style={styles.fallbackText}>{t("audioPlayer.unavailableFallback")}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity onPress={togglePlayPause} style={styles.playBtn}>
          <Image
            source={isPlaying ? require("../../assets/icons/pause.png") : require("../../assets/icons/play.png")}
            style={styles.playBtnIcon}
            resizeMode="contain"
          />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleSkip}
          style={styles.skipBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Image source={require("../../assets/icons/skip.png")} style={styles.skipBtnIcon} resizeMode="contain" />
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
    paddingVertical: spacing.sm,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    marginBottom: spacing.sm,
  },
  playBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  playBtnIcon: {
    width: 22,
    height: 22,
    tintColor: colors.parchmentSurface,
  },
  skipBtn: {
    width: 43,
    height: 43,
    borderRadius: 22,
    backgroundColor: colors.parchmentBg,
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  skipBtnIcon: {
    width: 20,
    height: 20,
    tintColor: colors.ink,
  },
  progressContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  timeText: {
    fontFamily: font.cursive,
    fontSize: type.caption,
    color: colors.fieldMuted,
    width: 40,
    textAlign: "center",
  },
  progressBar: {
    flex: 1,
    height: 4,
    backgroundColor: colors.fieldBorder,
    borderRadius: 2,
  },
  progressFill: {
    height: 4,
    backgroundColor: colors.fieldGreen,
    borderRadius: 2,
  },
  fallbackText: {
    fontFamily: font.serifItalic,
    textAlign: "center",
    color: colors.fieldMuted,
    fontSize: type.label,
    padding: 12,
  },
});
