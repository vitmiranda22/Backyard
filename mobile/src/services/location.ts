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
