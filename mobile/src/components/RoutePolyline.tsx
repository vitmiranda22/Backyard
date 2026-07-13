// Two-layer "ribbon road" route line (Pokemon GO-style) — a wider, deeper
// orange border stroke underneath a narrower, brighter orange core stroke
// gives the walked path visible depth on the map, instead of a flat
// semi-transparent line.

import React from "react";
import { Polyline } from "react-native-maps";
import { colors } from "../theme";

interface RoutePolylineProps {
  coordinates: { latitude: number; longitude: number }[];
}

export default function RoutePolyline({ coordinates }: RoutePolylineProps) {
  return (
    <>
      <Polyline
        coordinates={coordinates}
        strokeColor="#B8451F"
        strokeWidth={20}
        lineCap="round"
        lineJoin="round"
      />
      <Polyline
        coordinates={coordinates}
        strokeColor={colors.accent}
        strokeWidth={10}
        lineCap="round"
        lineJoin="round"
      />
    </>
  );
}
