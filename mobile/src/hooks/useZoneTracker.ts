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

  // Check if the user has entered a new zone
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
        setCurrentZone(geoHash);
        return { isNewZone: false, geoHash };
      }

      // New zone! Mark as visited and trigger narration
      visitedZones.current.add(geoHash);
      setCurrentZone(geoHash);
      return { isNewZone: true, geoHash };
    },
    [currentZone]
  );

  // Reset for a new tour session
  const reset = useCallback(() => {
    visitedZones.current.clear();
    setCurrentZone(null);
  }, []);

  return {
    currentZone,
    checkZone,
    reset,
    visitedCount: visitedZones.current.size,
  };
}
