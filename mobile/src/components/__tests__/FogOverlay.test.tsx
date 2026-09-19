import React from "react";
import { render } from "@testing-library/react-native";
import FogOverlay from "../FogOverlay";
import ngeohash from "ngeohash";
import { haversineDistanceMeters } from "../../utils/geo";

const REGION = { latitude: 37.7749, longitude: -122.4194, latitudeDelta: 0.01, longitudeDelta: 0.01 };
const HOLE_RADIUS_M = 15; // must match FogOverlay.tsx

// Builds a ring/grid of real geohash-7 cells around `centerHash` using
// row/col offsets -- ngeohash.neighbor supports multi-step offsets
// directly ([dRow, dCol]), confirmed live, so this always produces real
// adjacent cells rather than approximated coordinates.
function at(centerHash: string, dRow: number, dCol: number): string {
  return ngeohash.neighbor(centerHash, [dRow, dCol]);
}

type Point = { latitude: number; longitude: number };

function minDistanceToAnyHolePoint(holes: Point[][], lat: number, lng: number): number {
  let min = Infinity;
  for (const hole of holes) {
    for (const p of hole) {
      const d = haversineDistanceMeters(lat, lng, p.latitude, p.longitude);
      if (d < min) min = d;
    }
  }
  return min;
}

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
    for (const point of holes[0]) {
      expect(Math.abs(point.latitude - REGION.latitude)).toBeLessThan(0.01);
      expect(Math.abs(point.longitude - REGION.longitude)).toBeLessThan(0.01);
    }
  });

  it("culls an explored cell far outside the current viewport", async () => {
    const farHash = ngeohash.encode(35.6762, 139.6503, 7); // Tokyo
    const { findByTestId } = await render(<FogOverlay exploredGeoHashes={new Set([farHash])} region={REGION} />);
    expect((await findByTestId("fog-overlay")).props.holes).toEqual([]);
  });

  it("keeps one circle per distinct, non-adjacent explored cell (no connectors between them)", async () => {
    const hashA = ngeohash.encode(37.7749, -122.4194, 7);
    // Two geohash steps east -- confirmed not a direct neighbor of hashA,
    // so no connector circles should be drawn between them.
    const hashB = at(hashA, 0, 2);
    expect(ngeohash.neighbors(hashA)).not.toContain(hashB);

    const { findByTestId } = await render(<FogOverlay exploredGeoHashes={new Set([hashA, hashB])} region={REGION} />);
    expect((await findByTestId("fog-overlay")).props.holes).toHaveLength(2);
  });

  it("keeps the reveal radius small (~15m), not blown out past a real sidewalk's width", async () => {
    // Continuity along a walked street now comes from connector circles,
    // not from this radius -- it only needs to cover roughly a sidewalk,
    // not bleed into the whole block on either side.
    const hash = ngeohash.encode(REGION.latitude, REGION.longitude, 7);
    const center = ngeohash.decode(hash);
    const { findByTestId } = await render(<FogOverlay exploredGeoHashes={new Set([hash])} region={REGION} />);

    const hole = (await findByTestId("fog-overlay")).props.holes[0];
    for (const point of hole) {
      const distanceM = haversineDistanceMeters(center.latitude, center.longitude, point.latitude, point.longitude);
      expect(distanceM).toBeGreaterThan(HOLE_RADIUS_M - 1);
      expect(distanceM).toBeLessThan(HOLE_RADIUS_M + 1);
    }
  });

  it("bridges two geohash-adjacent explored cells with connector circles so the midpoint between them is still covered", async () => {
    const centerHash = ngeohash.encode(REGION.latitude, REGION.longitude, 7);
    const center = ngeohash.decode(centerHash);
    const neighborHash = ngeohash.neighbor(centerHash, [0, 1]); // real neighbor, one step east
    const neighbor = ngeohash.decode(neighborHash);
    const cellPitchM = haversineDistanceMeters(center.latitude, center.longitude, neighbor.latitude, neighbor.longitude);
    expect(cellPitchM).toBeGreaterThan(HOLE_RADIUS_M * 2); // confirms the two cells' own circles alone would NOT touch

    const { findByTestId } = await render(
      <FogOverlay exploredGeoHashes={new Set([centerHash, neighborHash])} region={REGION} />
    );
    const holes = (await findByTestId("fog-overlay")).props.holes;

    // More than 2 holes now exist -- the connector added circles between them.
    expect(holes.length).toBeGreaterThan(2);

    // The straight-line midpoint between the two cells must be within
    // HOLE_RADIUS_M of *some* hole point -- proof there's no visible gap
    // in the middle of the trail.
    const midLat = (center.latitude + neighbor.latitude) / 2;
    const midLng = (center.longitude + neighbor.longitude) / 2;
    expect(minDistanceToAnyHolePoint(holes, midLat, midLng)).toBeLessThan(HOLE_RADIUS_M);
  });

  it("auto-fills a single unexplored cell once it's fully surrounded (a closed loop) by explored cells", async () => {
    const centerHash = ngeohash.encode(REGION.latitude, REGION.longitude, 7);
    const ring = ngeohash.neighbors(centerHash); // all 8 real surrounding cells
    const { findByTestId } = await render(<FogOverlay exploredGeoHashes={new Set(ring)} region={REGION} />);
    const holes = (await findByTestId("fog-overlay")).props.holes;

    const [minLat, minLng, maxLat, maxLng] = ngeohash.decode_bbox(centerHash);
    const centerOfCell = { latitude: (minLat + maxLat) / 2, longitude: (minLng + maxLng) / 2 };
    // The fill is a 4-point square matching the cell's own bounding box,
    // not a small circle -- look for a hole whose center is the cell center.
    const hasSquareFill = holes.some((hole: Point[]) => {
      if (hole.length !== 4) return false;
      const avgLat = hole.reduce((s, p) => s + p.latitude, 0) / 4;
      const avgLng = hole.reduce((s, p) => s + p.longitude, 0) / 4;
      return (
        Math.abs(avgLat - centerOfCell.latitude) < 0.0001 &&
        Math.abs(avgLng - centerOfCell.longitude) < 0.0001
      );
    });
    expect(hasSquareFill).toBe(true);
  });

  it("does NOT fill the interior when the ring around it has a gap (not actually a closed loop)", async () => {
    const centerHash = ngeohash.encode(REGION.latitude, REGION.longitude, 7);
    const ring = ngeohash.neighbors(centerHash).slice(0, 7); // 7 of 8 -- one gap
    const { findByTestId } = await render(<FogOverlay exploredGeoHashes={new Set(ring)} region={REGION} />);
    const holes = (await findByTestId("fog-overlay")).props.holes;

    const squareFills = holes.filter((hole: Point[]) => hole.length === 4);
    expect(squareFills).toHaveLength(0);
  });

  it("does NOT fill an enclosed pocket bigger than one block (caps runaway fills from a big loop)", async () => {
    const centerHash = ngeohash.encode(REGION.latitude, REGION.longitude, 7);
    // A 3x3 unexplored inner block (9 cells > the 4-cell cap), surrounded
    // by a fully-explored outer ring one step further out.
    const explored = new Set<string>();
    for (let dRow = -2; dRow <= 2; dRow++) {
      for (let dCol = -2; dCol <= 2; dCol++) {
        if (Math.abs(dRow) <= 1 && Math.abs(dCol) <= 1) continue; // leave the inner 3x3 unexplored
        explored.add(at(centerHash, dRow, dCol));
      }
    }

    const { findByTestId } = await render(<FogOverlay exploredGeoHashes={explored} region={REGION} />);
    const holes = (await findByTestId("fog-overlay")).props.holes;
    expect(holes.filter((hole: Point[]) => hole.length === 4)).toHaveLength(0);
  });

  it("skips the enclosed-fill check entirely when zoomed out past the performance guard", async () => {
    const centerHash = ngeohash.encode(REGION.latitude, REGION.longitude, 7);
    const ring = ngeohash.neighbors(centerHash);
    const zoomedOutRegion = { ...REGION, latitudeDelta: 0.2, longitudeDelta: 0.2 };

    const { findByTestId } = await render(<FogOverlay exploredGeoHashes={new Set(ring)} region={zoomedOutRegion} />);
    const holes = (await findByTestId("fog-overlay")).props.holes;
    expect(holes.filter((hole: Point[]) => hole.length === 4)).toHaveLength(0);
  });
});
