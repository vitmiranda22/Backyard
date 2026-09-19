// Terra Incognita fog-of-war overlay -- a single dark Polygon covering the
// visible map, with a hole punched out for every explored geohash cell
// (react-native-maps' Polygon.holes prop, supported on both providers).
//
// Three kinds of holes, all derived purely from `exploredGeoHashes` (the
// backend-persisted record of real exploration) -- nothing here is a new
// tracking mechanism, and nothing here writes back to exploredGeoHashes:
//   1. A small circle at each explored cell's center.
//   2. Connector circles bridging every pair of geohash-adjacent explored
//      cells, so a walked street reads as one continuous cleared trail
//      instead of isolated dots ~153m apart (a precision-7 cell's real-
//      world pitch) with fog showing through the gaps.
//   3. A full-cell fill for any unexplored cell that's completely
//      enclosed by explored ones (e.g., you've walked all the way around
///     a block) -- visual only, capped to a small pocket so a big loop
//      (a park, several real blocks) doesn't auto-clear more than it's
//      fair to assume was actually walked.

import React, { useMemo } from "react";
import { Polygon } from "react-native-maps";
import ngeohash from "ngeohash";
import { destinationPoint, haversineDistanceMeters } from "../utils/geo";

export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

interface FogOverlayProps {
  exploredGeoHashes: Set<string>;
  region: MapRegion;
}

// Deliberately small -- continuity along a walked street now comes from
// the connector circles below, not from this radius alone, so this only
// needs to cover roughly the width of a real sidewalk/street rather than
// bleeding into the whole block on either side (see the previous 85m
// value's own history: even that was tuned down once already this pass,
// and still revealed a full block from one lap around it).
const HOLE_RADIUS_M = 15;
const HOLE_POINTS = 24;
// Circles along a connector must land no farther apart than 2x
// HOLE_RADIUS_M (30m) or a gap would show between them -- 25m keeps real
// margin under that so lat/lng rounding or a slightly curved path never
// produces a visible seam in the trail.
const CONNECTOR_SPACING_M = 25;
// Roughly one real city block's worth of interior. An enclosed unexplored
// pocket up to this many geohash-7 cells auto-fills once fully surrounded
// by explored cells; anything bigger (a park, several real blocks) stays
// fogged, since being surrounded isn't evidence you actually walked
// through the middle of it.
const MAX_ENCLOSED_FILL_CELLS = 4;
// Enclosed-cell detection enumerates every geohash-7 cell in the visible
// region (via ngeohash.bboxes) -- cheap at a normal walking zoom level,
// but a fully zoomed-out view could ask for tens of thousands of cells
// for no visual benefit (individual block interiors aren't distinguishable
// at that zoom anyway). Skip the computation entirely past this zoom.
const MAX_REGION_DELTA_FOR_ENCLOSED_FILL = 0.05; // ~5.5km at the equator
// How far beyond the visible region to still cull-in explored cells / draw
// fog, so a small pan doesn't flash an unfogged edge before the next
// onRegionChangeComplete fires.
const VIEWPORT_PAD_FACTOR = 1.5;

function circlePolygon(centerLat: number, centerLng: number) {
  const points = [];
  for (let i = 0; i < HOLE_POINTS; i++) {
    const bearing = (360 / HOLE_POINTS) * i;
    const { lat, lng } = destinationPoint(centerLat, centerLng, bearing, HOLE_RADIUS_M);
    points.push({ latitude: lat, longitude: lng });
  }
  return points;
}

// Small circles bridging two explored cells' centers, spaced close enough
// together to overlap -- turns two isolated ~15m dots ~153m apart into
// one continuous revealed trail, without needing to track every raw GPS
// point the walker actually passed through.
function connectorCircles(latA: number, lngA: number, latB: number, lngB: number) {
  const distM = haversineDistanceMeters(latA, lngA, latB, lngB);
  const steps = Math.max(1, Math.ceil(distM / CONNECTOR_SPACING_M));
  const circles = [];
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    circles.push(circlePolygon(latA + (latB - latA) * t, lngA + (lngB - lngA) * t));
  }
  return circles;
}

// A full-cell square hole -- used for the closed-loop interior fill, since
// the whole enclosed cell should visually clear, not just a 15m dot at
// its center.
function cellSquarePolygon(hash: string) {
  const [minLat, minLng, maxLat, maxLng] = ngeohash.decode_bbox(hash);
  return [
    { latitude: minLat, longitude: minLng },
    { latitude: minLat, longitude: maxLng },
    { latitude: maxLat, longitude: maxLng },
    { latitude: maxLat, longitude: minLng },
  ];
}

// Finds unexplored cells fully enclosed by explored ones within
// `gridHashes` (every geohash-7 cell in the checked region). Approach: a
// flood fill starting from every unexplored cell that touches the edge of
// the checked grid -- anything that flood fill never reaches can't be
// "enclosed," since it's contiguous with the fog outside the grid.
// Whatever's left is grouped into connected pockets and only kept if the
// pocket is small enough to plausibly be "one block," not a park or
// several real blocks.
function findEnclosedCells(gridHashes: string[], exploredGeoHashes: Set<string>): string[] {
  const gridSet = new Set(gridHashes);
  const unexploredSet = new Set(gridHashes.filter((h) => !exploredGeoHashes.has(h)));
  const reachableFromOutside = new Set<string>();

  const queue: string[] = [];
  for (const hash of unexploredSet) {
    const touchesEdge = ngeohash.neighbors(hash).some((n: string) => !gridSet.has(n));
    if (touchesEdge) {
      reachableFromOutside.add(hash);
      queue.push(hash);
    }
  }
  while (queue.length) {
    const current = queue.shift()!;
    for (const n of ngeohash.neighbors(current)) {
      if (unexploredSet.has(n) && !reachableFromOutside.has(n)) {
        reachableFromOutside.add(n);
        queue.push(n);
      }
    }
  }

  const enclosedSet = new Set([...unexploredSet].filter((h) => !reachableFromOutside.has(h)));

  const visited = new Set<string>();
  const result: string[] = [];
  for (const hash of enclosedSet) {
    if (visited.has(hash)) continue;
    const pocket: string[] = [];
    const stack = [hash];
    visited.add(hash);
    while (stack.length) {
      const cur = stack.pop()!;
      pocket.push(cur);
      for (const n of ngeohash.neighbors(cur)) {
        if (enclosedSet.has(n) && !visited.has(n)) {
          visited.add(n);
          stack.push(n);
        }
      }
    }
    if (pocket.length <= MAX_ENCLOSED_FILL_CELLS) {
      result.push(...pocket);
    }
  }
  return result;
}

export default function FogOverlay({ exploredGeoHashes, region }: FogOverlayProps) {
  const holes = useMemo(() => {
    const latPad = region.latitudeDelta * VIEWPORT_PAD_FACTOR;
    const lngPad = region.longitudeDelta * VIEWPORT_PAD_FACTOR;
    const minLat = region.latitude - latPad;
    const maxLat = region.latitude + latPad;
    const minLng = region.longitude - lngPad;
    const maxLng = region.longitude + lngPad;

    const result: { latitude: number; longitude: number }[][] = [];
    const connectedPairs = new Set<string>();

    for (const hash of exploredGeoHashes) {
      const { latitude, longitude } = ngeohash.decode(hash);
      if (latitude < minLat || latitude > maxLat || longitude < minLng || longitude > maxLng) continue;

      result.push(circlePolygon(latitude, longitude));

      for (const neighborHash of ngeohash.neighbors(hash)) {
        if (!exploredGeoHashes.has(neighborHash)) continue;
        const pairKey = hash < neighborHash ? `${hash}:${neighborHash}` : `${neighborHash}:${hash}`;
        if (connectedPairs.has(pairKey)) continue;
        connectedPairs.add(pairKey);

        const neighborCenter = ngeohash.decode(neighborHash);
        for (const circle of connectorCircles(latitude, longitude, neighborCenter.latitude, neighborCenter.longitude)) {
          result.push(circle);
        }
      }
    }

    if (region.latitudeDelta < MAX_REGION_DELTA_FOR_ENCLOSED_FILL && region.longitudeDelta < MAX_REGION_DELTA_FOR_ENCLOSED_FILL) {
      const visMinLat = region.latitude - region.latitudeDelta / 2;
      const visMaxLat = region.latitude + region.latitudeDelta / 2;
      const visMinLng = region.longitude - region.longitudeDelta / 2;
      const visMaxLng = region.longitude + region.longitudeDelta / 2;
      const gridHashes = ngeohash.bboxes(visMinLat, visMinLng, visMaxLat, visMaxLng, 7);
      for (const hash of findEnclosedCells(gridHashes, exploredGeoHashes)) {
        result.push(cellSquarePolygon(hash));
      }
    }

    return result;
  }, [exploredGeoHashes, region.latitude, region.longitude, region.latitudeDelta, region.longitudeDelta]);

  const outerPad = 3;
  const outer = [
    { latitude: region.latitude - region.latitudeDelta * outerPad, longitude: region.longitude - region.longitudeDelta * outerPad },
    { latitude: region.latitude - region.latitudeDelta * outerPad, longitude: region.longitude + region.longitudeDelta * outerPad },
    { latitude: region.latitude + region.latitudeDelta * outerPad, longitude: region.longitude + region.longitudeDelta * outerPad },
    { latitude: region.latitude + region.latitudeDelta * outerPad, longitude: region.longitude - region.longitudeDelta * outerPad },
  ];

  return (
    <Polygon
      testID="fog-overlay"
      coordinates={outer}
      holes={holes}
      fillColor="rgba(24, 19, 16, 0.99)"
      strokeColor="transparent"
    />
  );
}
