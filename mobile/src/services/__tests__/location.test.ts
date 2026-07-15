import { bearingBetween, distanceMeters, compassLabel, snapToRoad, reverseGeocode } from "../location";

describe("bearingBetween", () => {
  it("returns 0 (north) for due-north movement", () => {
    expect(bearingBetween(37.0, -122.0, 38.0, -122.0)).toBeCloseTo(0, 0);
  });

  it("returns ~90 (east) for due-east movement", () => {
    expect(bearingBetween(37.0, -122.0, 37.0, -121.0)).toBeCloseTo(90, 0);
  });

  it("returns ~180 (south) for due-south movement", () => {
    expect(bearingBetween(38.0, -122.0, 37.0, -122.0)).toBeCloseTo(180, 0);
  });

  it("stays within [0, 360) for a southwest bearing", () => {
    const bearing = bearingBetween(37.0, -122.0, 36.0, -123.0);
    expect(bearing).toBeGreaterThanOrEqual(0);
    expect(bearing).toBeLessThan(360);
    expect(bearing).toBeGreaterThan(180); // southwest is in the 180-270 range
  });
});

describe("distanceMeters", () => {
  it("returns 0 for identical points", () => {
    expect(distanceMeters(37.7749, -122.4194, 37.7749, -122.4194)).toBe(0);
  });

  it("returns a plausible distance for two known SF points ~1.4km apart", () => {
    // Ferry Building to Coit Tower, roughly 1.3-1.5km as the crow flies.
    const d = distanceMeters(37.7955, -122.3937, 37.8024, -122.4058);
    expect(d).toBeGreaterThan(1000);
    expect(d).toBeLessThan(1800);
  });
});

describe("compassLabel", () => {
  it.each([
    [0, "N"],
    [45, "NE"],
    [90, "E"],
    [135, "SE"],
    [180, "S"],
    [225, "SW"],
    [270, "W"],
    [315, "NW"],
    [360, "N"], // wraps back to N
  ])("labels %i degrees as %s", (deg, expected) => {
    expect(compassLabel(deg)).toBe(expected);
  });
});

describe("snapToRoad", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("returns the snapped coordinates on a successful OSRM response", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ code: "Ok", waypoints: [{ location: [-122.42, 37.78] }] }),
    }) as any;

    const result = await snapToRoad(37.7799, -122.4199);

    expect(result).toEqual({ lat: 37.78, lng: -122.42 });
  });

  it("falls back to the original point when OSRM returns a non-Ok code", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ code: "NoSegment", waypoints: [] }),
    }) as any;

    const result = await snapToRoad(37.7799, -122.4199);

    expect(result).toEqual({ lat: 37.7799, lng: -122.4199 });
  });

  it("falls back to the original point on a network error, never throws", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("network down")) as any;

    const result = await snapToRoad(37.7799, -122.4199);

    expect(result).toEqual({ lat: 37.7799, lng: -122.4199 });
  });
});

describe("reverseGeocode", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("extracts neighborhood and city from a Nominatim response", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ address: { neighbourhood: "Mission District", city: "San Francisco" } }),
    }) as any;

    const result = await reverseGeocode(37.7599, -122.4148);

    expect(result).toEqual({ neighborhood: "Mission District", city: "San Francisco" });
  });

  it("returns null on a network failure rather than throwing", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("timeout")) as any;

    const result = await reverseGeocode(37.7599, -122.4148);

    expect(result).toBeNull();
  });
});
