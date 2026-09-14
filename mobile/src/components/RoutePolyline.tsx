// Two-layer "ribbon road" route line (Pokemon GO-style) — a wider, deeper
// orange border stroke underneath a narrower, brighter orange core stroke
// gives the walked path visible depth on the map, instead of a flat
// semi-transparent line.

import React from "react";
import { Polyline } from "react-native-maps";
import { colors } from "../theme";

interface RoutePolylineProps {
  coordinates: { latitude: number; longitude: number }[];
  // Polyline strokeWidth is always in fixed screen pixels, regardless of
  // zoom -- 20/10 reads fine on ActiveTourScreen's tight, close-up zoom
  // (a ~150-300m-wide screen), but RouteDetailScreen zooms out to fit an
  // entire multi-km route, where that same pixel width covers many times
  // more real-world distance and renders as a huge, street-swallowing
  // blob. Callers showing a zoomed-out overview should pass thinner
  // widths; this default preserves ActiveTourScreen's original look.
  strokeWidth?: number;
  innerStrokeWidth?: number;
}

export default function RoutePolyline({
  coordinates,
  strokeWidth = 20,
  innerStrokeWidth = 10,
}: RoutePolylineProps) {
  return (
    <>
      <Polyline
        testID="route-polyline"
        coordinates={coordinates}
        strokeColor="#B8451F"
        strokeWidth={strokeWidth}
        lineCap="round"
        lineJoin="round"
      />
      <Polyline
        coordinates={coordinates}
        strokeColor={colors.fieldGreen}
        strokeWidth={innerStrokeWidth}
        lineCap="round"
        lineJoin="round"
      />
    </>
  );
}
