// Zone tracker hook — detects when the user enters a new ~150m zone
//
// Uses geohash to divide the world into zones. When the geohash changes,
// it means the user has moved to a new zone and should hear a new narration.

import { useState, useRef, useCallback } from "react";
import ngeohash from "ngeohash";
import { GEOHASH_PRECISION } from "../config";

export function useZoneTracker() {
  const [currentZone, setCurrentZone] = useState<string | null>(null);
  const visitedZones = useRef<Set<string>>(new Set());

  // Check if the user has entered a new zone. Pure read — does NOT mark the
  // zone visited. A zone is only "used up" once narration actually gets
  // triggered for it (see commitZone), otherwise a zone glimpsed while a
  // previous narration was still loading/debouncing would be silently
  // skipped forever.
  const checkZone = useCallback(
    (lat: number, lng: number): { isNewZone: boolean; geoHash: string } => {
      const geoHash = ngeohash.encode(lat, lng, GEOHASH_PRECISION);

      if (geoHash === currentZone) {
        // Same zone — no trigger
        return { isNewZone: false, geoHash };
      }

      if (visitedZones.current.has(geoHash)) {
        // Already visited this zone in this session — no auto-trigger
        // (but manual trigger still works)
        return { isNewZone: false, geoHash };
      }

      return { isNewZone: true, geoHash };
    },
    [currentZone]
  );

  // Commit a zone as visited. Call this ONLY once narration is actually
  // about to be triggered for it (i.e. after loading/debounce guards pass) —
  // not just because checkZone saw it.
  const commitZone = useCallback((geoHash: string) => {
    visitedZones.current.add(geoHash);
    setCurrentZone(geoHash);
  }, []);

  // Reset for a new tour session
  const reset = useCallback(() => {
    visitedZones.current.clear();
    setCurrentZone(null);
  }, []);

  return {
    checkZone,
    commitZone,
    reset,
  };
}
