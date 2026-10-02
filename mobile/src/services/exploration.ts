// Terra Incognita -- fog-of-war map discovery
//
// Used by ActiveTourScreen's own GPS tracking during an active tour --
// fog only ever clears from actually walking a tour, never from just
// having MapScreen open (see its own comment). Same "is this a new
// geohash cell" shape as useZoneTracker, but reporting discovery to the
// backend instead of triggering narration.

import ngeohash from "ngeohash";
import { GEOHASH_PRECISION } from "../config";
import { reportExploredCell } from "./api";

// Marks (lat, lng)'s cell explored if `knownHashes` hasn't seen it yet --
// updates `knownHashes` synchronously so the caller's UI (the fog overlay)
// can react immediately, then reports it to the backend in the background.
// Fire-and-forget, quiet-fail: a dropped report just means that cell gets
// reported again next time it's crossed, same resilience as the map's
// other best-effort calls.
export function reportIfNewCell(lat: number, lng: number, knownHashes: Set<string>): string | null {
  const geoHash = ngeohash.encode(lat, lng, GEOHASH_PRECISION);
  if (knownHashes.has(geoHash)) return null;

  knownHashes.add(geoHash);
  reportExploredCell(lat, lng).catch((e) => console.warn("Failed to report explored cell:", e.message));
  return geoHash;
}
