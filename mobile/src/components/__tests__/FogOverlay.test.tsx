import React from "react";
import { render } from "@testing-library/react-native";
import FogOverlay from "../FogOverlay";
import ngeohash from "ngeohash";

const REGION = { latitude: 37.7749, longitude: -122.4194, latitudeDelta: 0.01, longitudeDelta: 0.01 };

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
});
