// Terra Incognita fog-of-war overlay -- a single dark Polygon covering the
// visible map, with a hole punched out for every explored geohash cell
// (react-native-maps' Polygon.holes prop, supported on both providers).
// Adjacent explored cells' circles overlapping is what makes a walked
// street read as one continuous cleared trail instead of isolated dots.

import React, { useMemo } from "react";
import { Polygon } from "react-native-maps";
import ngeohash from "ngeohash";
import { destinationPoint } from "../utils/geo";

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

// Tunable: a bit smaller than a full ~153m geohash cell's diagonal, so
// neighboring explored cells' circles overlap into a continuous trail
// without clearing an unrealistically large area per step.
const HOLE_RADIUS_M = 100;
const HOLE_POINTS = 24;
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

export default function FogOverlay({ exploredGeoHashes, region }: FogOverlayProps) {
  const holes = useMemo(() => {
    const latPad = region.latitudeDelta * VIEWPORT_PAD_FACTOR;
    const lngPad = region.longitudeDelta * VIEWPORT_PAD_FACTOR;
    const minLat = region.latitude - latPad;
    const maxLat = region.latitude + latPad;
    const minLng = region.longitude - lngPad;
    const maxLng = region.longitude + lngPad;

    const result = [];
    for (const hash of exploredGeoHashes) {
      const { latitude, longitude } = ngeohash.decode(hash);
      if (latitude < minLat || latitude > maxLat || longitude < minLng || longitude > maxLng) continue;
      result.push(circlePolygon(latitude, longitude));
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
      fillColor="rgba(24, 19, 16, 0.94)"
      strokeColor="transparent"
    />
  );
}
