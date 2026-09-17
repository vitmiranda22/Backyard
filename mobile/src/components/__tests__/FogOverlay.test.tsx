import React from "react";
import { render } from "@testing-library/react-native";
import FogOverlay from "../FogOverlay";
import ngeohash from "ngeohash";
import { haversineDistanceMeters } from "../../utils/geo";

const REGION = { latitude: 37.7749, longitude: -122.4194, latitudeDelta: 0.01, longitudeDelta: 0.01 };
// A precision-7 geohash cell's real-world side length -- the fix this
// guards against (a 100m/200m-diameter hole radius) bled roughly 47m
// past this per cell, painting whole city blocks as "explored" from a
// single footstep. See FogOverlay.tsx's own comment on HOLE_RADIUS_M.
const GEOHASH_CELL_SIDE_M = 153;

describe("FogOverlay", () => {
  it("punches no holes when nothing has been explored", async () => {
    const { findByTestId } = await render(<FogOverlay exploredGeoHashes={new Set()} region={REGION} />);
    expect((await findByTestId("fog-overlay")).props.holes).toEqual([]);
  });

  it("punches a 24-point circle hole for a cell within the visible region", async () => {
    const hash = ngeohash.encode(REGION.latitude, REGION.longitude, 7);
    const { findByTestId } = await render(<FogOverlay exploredGeoHashes={new Set([hash])} region={REGION} />);

    const holes = (await findByTestId("fog-overlay")).props.holes;
    expect(holes).toHaveLength(1);
    expect(holes[0]).toHaveLength(24);
    // Every hole point should sit close to the cell's center, not off in
    // some unrelated part of the world.
    for (const point of holes[0]) {
      expect(Math.abs(point.latitude - REGION.latitude)).toBeLessThan(0.01);
      expect(Math.abs(point.longitude - REGION.longitude)).toBeLessThan(0.01);
    }
  });

  it("culls an explored cell far outside the current viewport", async () => {
    // Tokyo -- nowhere near REGION's San Francisco viewport.
    const farHash = ngeohash.encode(35.6762, 139.6503, 7);
    const { findByTestId } = await render(<FogOverlay exploredGeoHashes={new Set([farHash])} region={REGION} />);

    expect((await findByTestId("fog-overlay")).props.holes).toEqual([]);
  });

  it("keeps one hole per distinct nearby cell", async () => {
    const hashA = ngeohash.encode(37.7749, -122.4194, 7);
    const hashB = ngeohash.encode(37.7755, -122.4200, 7);
    const { findByTestId } = await render(<FogOverlay exploredGeoHashes={new Set([hashA, hashB])} region={REGION} />);

    expect((await findByTestId("fog-overlay")).props.holes).toHaveLength(2);
  });

  it("draws a hole radius close to half a geohash cell's real-world size, not blown out past it", async () => {
    // Regression test: a real report found explored cells revealing whole
    // city blocks on either side of a single walked street. Root cause was
    // HOLE_RADIUS_M (200m diameter) being nearly a full cell's DIAGONAL
    // instead of close to half its SIDE -- overshooting each cell's
    // straight edges by ~24m in every direction, and since a new cell is
    // marked explored roughly every 5m of walking, consecutive overlapping
    // circles painted a band far wider than anything actually walked.
    const hash = ngeohash.encode(REGION.latitude, REGION.longitude, 7);
    const center = ngeohash.decode(hash);
    const { findByTestId } = await render(<FogOverlay exploredGeoHashes={new Set([hash])} region={REGION} />);

    const hole = (await findByTestId("fog-overlay")).props.holes[0];
    for (const point of hole) {
      const distanceM = haversineDistanceMeters(center.latitude, center.longitude, point.latitude, point.longitude);
      // Comfortably more than half the cell's side (so adjacent explored
      // cells' circles still touch and read as one continuous trail), but
      // nowhere near the full ~216m diagonal the old radius approached.
      expect(distanceM).toBeGreaterThan(GEOHASH_CELL_SIDE_M / 2);
      expect(distanceM).toBeLessThan(GEOHASH_CELL_SIDE_M * 0.7);
    }
  });

  it("keeps two directly-adjacent explored cells' circles touching, not gapped", async () => {
    // The whole point of a radius bigger than half the cell side: two
    // neighboring explored cells (~153m apart center-to-center) must still
    // overlap enough to read as a continuous trail, not a dashed line.
    const centerHash = ngeohash.encode(REGION.latitude, REGION.longitude, 7);
    const center = ngeohash.decode(centerHash);
    // A real neighboring cell, one geohash step east.
    const neighborHash = ngeohash.neighbor(centerHash, [0, 1]);
    const neighbor = ngeohash.decode(neighborHash);
    const cellPitchM = haversineDistanceMeters(center.latitude, center.longitude, neighbor.latitude, neighbor.longitude);

    const { findByTestId } = await render(
      <FogOverlay exploredGeoHashes={new Set([centerHash, neighborHash])} region={REGION} />
    );
    const holes = (await findByTestId("fog-overlay")).props.holes;

    // Two circles of the same radius, centered `cellPitchM` apart, overlap
    // (or at least touch) exactly when 2 x radius >= cellPitchM.
    const closestPointDistance = Math.min(
      ...holes[0].map((p: { latitude: number; longitude: number }) =>
        haversineDistanceMeters(p.latitude, p.longitude, neighbor.latitude, neighbor.longitude)
      )
    );
    expect(closestPointDistance).toBeLessThan(cellPitchM);
  });
});
