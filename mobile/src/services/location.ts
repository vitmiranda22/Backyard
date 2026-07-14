// Location service — GPS permission and tracking
//
// Handles requesting location permission and watching the user's position.

import * as Location from "expo-location";

export async function requestLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === "granted";
}

export async function getCurrentLocation() {
  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });
  return {
    lat: location.coords.latitude,
    lng: location.coords.longitude,
  };
}

// Lightweight reverse geocode for UI labels (e.g. the Home screen greeting).
// Calls Nominatim directly from the client — no backend round trip needed
// just to show "You're standing on ___". Returns null on any failure.
export async function reverseGeocode(lat: number, lng: number) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=16`,
      { headers: { "User-Agent": "BackyardApp/1.0 (tour guide app; contact@backyard.app)" } }
    );
    const data = await res.json();
    const addr = data.address || {};
    const neighborhood =
      addr.neighbourhood || addr.suburb || addr.quarter || addr.city_district || "";
    const city = addr.city || addr.town || addr.village || addr.municipality || "";
    return { neighborhood, city };
  } catch {
    return null;
  }
}

// Snaps a single GPS point onto the nearest real street, for the live
// trailing-path line only (see ActiveTourScreen's watchPosition callback)
// -- NOT used for the actual tracked location/zone-crossing logic, which
// stays on raw GPS. Calls OSRM's free public map-matching server directly
// from the client, same "no backend round trip" pattern as
// reverseGeocode above. Returns the original point unchanged on any
// failure (timeout, network error, no nearby road) — this is a purely
// visual enhancement, never something that should block or delay the
// live map from updating.
export async function snapToRoad(lat: number, lng: number): Promise<{ lat: number; lng: number }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`https://router.project-osrm.org/nearest/v1/foot/${lng},${lat}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await res.json();
    const loc = data?.waypoints?.[0]?.location;
    if (data?.code === "Ok" && Array.isArray(loc) && loc.length === 2) {
      return { lat: loc[1], lng: loc[0] };
    }
    return { lat, lng };
  } catch {
    return { lat, lng };
  }
}

// Start watching device compass heading — powers the waypoint compass.
// Returns a subscription you can remove later, same shape as watchPosition.
export async function watchHeading(callback: (headingDeg: number) => void) {
  const subscription = await Location.watchHeadingAsync((heading) => {
    // trueHeading is -1 when unavailable (e.g. no GPS fix yet) — fall back
    // to magnetic heading rather than feeding a bogus -1 into bearing math.
    const deg = heading.trueHeading >= 0 ? heading.trueHeading : heading.magHeading;
    callback(deg);
  });
  return subscription;
}

// Initial bearing (degrees, 0-360, 0 = north) from one coordinate to
// another — standard great-circle forward azimuth formula.
export function bearingBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const COMPASS_DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
export function compassLabel(bearingDeg: number): string {
  return COMPASS_DIRS[Math.round(bearingDeg / 45) % 8];
}

// Start watching position — returns a subscription you can remove later
export async function watchPosition(
  callback: (lat: number, lng: number) => void,
  intervalMs: number = 5000
) {
  const subscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.High,
      // 10m was too coarse for the walked-path polyline — at a normal
      // walking pace it skipped enough points to cut corners and miss
      // curves in the actual street/sidewalk. 5m gives a noticeably
      // more faithful trace without a meaningful battery/data cost.
      distanceInterval: 5,
      timeInterval: intervalMs,
    },
    (location) => {
      callback(location.coords.latitude, location.coords.longitude);
    }
  );
  return subscription;
}
