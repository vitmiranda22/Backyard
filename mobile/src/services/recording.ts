// Voice question recording — hold-to-record using expo-av's Audio.Recording
// (the same package AudioPlayer.tsx already uses for playback, so this adds
// no new native dependency).

import { Audio } from "expo-av";

let recording: Audio.Recording | null = null;

export async function startRecording(): Promise<boolean> {
  try {
    const permission = await Audio.requestPermissionsAsync();
    if (!permission.granted) return false;

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const { recording: rec } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY
    );
    recording = rec;
    return true;
  } catch (e) {
    console.warn("Failed to start recording:", e);
    return false;
  }
}

// Returns the local file URI of the recording, or null if too short/failed
// to produce anything usable.
export async function stopRecording(): Promise<string | null> {
  if (!recording) return null;
  const rec = recording;
  recording = null;

  try {
    const statusBeforeStop = await rec.getStatusAsync();
    await rec.stopAndUnloadAsync();
    // Restore the playback-friendly audio mode narration relies on —
    // recording mode alone doesn't keep background/silent-mode playback.
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: true,
      playsInSilentModeIOS: true,
    });

    // A tap-and-release under ~500ms is almost certainly an accidental
    // touch, not an actual question — don't upload it.
    if ((statusBeforeStop.durationMillis || 0) < 500) {
      return null;
    }
    return rec.getURI();
  } catch (e) {
    console.warn("Failed to stop recording:", e);
    return null;
  }
}

export function cancelRecording() {
  if (recording) {
    const rec = recording;
    recording = null;
    rec.stopAndUnloadAsync().catch(() => {});
  }
}
