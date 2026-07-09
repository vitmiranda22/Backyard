// Local audio caching — once a block's narration audio has finished
// loading, cache it to disk so a signal drop right after doesn't
// interrupt whatever's already playing. This does NOT pre-cache future
// blocks: narration is generated live as you walk into new GPS zones, so
// there's no way to know what's coming next.
//
// Uses expo-file-system's classic API via the /legacy subpath — the
// modern class-based API (File/Directory/Paths) shipped in this SDK
// version doesn't cleanly expose a documented downloadFileAsync helper,
// while the legacy path is explicitly supported and well-documented.

import * as FileSystem from "expo-file-system/legacy";

const CACHE_DIR = `${FileSystem.cacheDirectory}narration-audio/`;

async function ensureCacheDir() {
  const info = await FileSystem.getInfoAsync(CACHE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
  }
}

export async function cacheAudio(url: string, blockId: string): Promise<string | null> {
  try {
    await ensureCacheDir();
    const localUri = `${CACHE_DIR}${blockId}.mp3`;
    const existing = await FileSystem.getInfoAsync(localUri);
    if (existing.exists) return localUri;

    const result = await FileSystem.downloadAsync(url, localUri);
    return result.status === 200 ? result.uri : null;
  } catch (e) {
    console.warn("Failed to cache audio locally:", e);
    return null;
  }
}
