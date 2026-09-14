import { destinationPoint, haversineDistanceMeters } from "../geo";

describe("destinationPoint", () => {
  it("returns the same point for zero distance", () => {
    const p = destinationPoint(37.7749, -122.4194, 90, 0);

    expect(p.lat).toBeCloseTo(37.7749, 6);
    expect(p.lng).toBeCloseTo(-122.4194, 6);
  });

  it("moves north (bearing 0) to a strictly higher latitude, same longitude", () => {
    const p = destinationPoint(37.7749, -122.4194, 0, 150);

    expect(p.lat).toBeGreaterThan(37.7749);
    expect(p.lng).toBeCloseTo(-122.4194, 3);
  });

  it("moves east (bearing 90) to a strictly higher longitude, same latitude", () => {
    const p = destinationPoint(37.7749, -122.4194, 90, 150);

    expect(p.lng).toBeGreaterThan(-122.4194);
    expect(p.lat).toBeCloseTo(37.7749, 3);
  });

  it("round-trips with haversineDistanceMeters to roughly the requested distance", () => {
    const origin = { lat: 37.7749, lng: -122.4194 };
    const p = destinationPoint(origin.lat, origin.lng, 45, 150);

    const measured = haversineDistanceMeters(origin.lat, origin.lng, p.lat, p.lng);

    expect(measured).toBeCloseTo(150, 0);
  });
});
