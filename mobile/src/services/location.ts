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

// Start watching position — returns a subscription you can remove later
export async function watchPosition(
  callback: (lat: number, lng: number) => void,
  intervalMs: number = 5000
) {
  const subscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.High,
      distanceInterval: 10, // minimum 10m movement to trigger
      timeInterval: intervalMs,
    },
    (location) => {
      callback(location.coords.latitude, location.coords.longitude);
    }
  );
  return subscription;
}
