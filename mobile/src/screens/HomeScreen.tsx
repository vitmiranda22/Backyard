// Home screen — map centered on user + "Start Tour" button
//
// This is the first thing you see after login.

import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { requestLocationPermission, getCurrentLocation } from "../services/location";

interface HomeScreenProps {
  onStartTour: () => void;
}

export default function HomeScreen({ onStartTour }: HomeScreenProps) {
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [hasPermission, setHasPermission] = useState(false);

  useEffect(() => {
    async function init() {
      const granted = await requestLocationPermission();
      setHasPermission(granted);
      if (granted) {
        try {
          const loc = await getCurrentLocation();
          setLocation(loc);
        } catch (e) {
          console.error("Failed to get location:", e);
        }
      } else {
        Alert.alert(
          "Location Required",
          "Backyard needs your location to tell stories about where you are. Please enable it in Settings.",
        );
      }
    }
    init();
  }, []);

  return (
    <View style={styles.container}>
      {/* Map */}
      {location ? (
        <MapView
          style={styles.map}
          initialRegion={{
            latitude: location.lat,
            longitude: location.lng,
            latitudeDelta: 0.005,
            longitudeDelta: 0.005,
          }}
          showsUserLocation
          showsMyLocationButton
        />
      ) : (
        <View style={styles.mapPlaceholder}>
          <Text style={styles.placeholderText}>
            {hasPermission ? "Getting your location..." : "Location permission required"}
          </Text>
        </View>
      )}

      {/* Start Tour button */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.startBtn, !location && styles.startBtnDisabled]}
          onPress={onStartTour}
          disabled={!location}
        >
          <Text style={styles.startBtnText}>🎙️ Start Walking Tour</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0d0d1a",
  },
  map: {
    flex: 1,
  },
  mapPlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderText: {
    color: "#666",
    fontSize: 16,
  },
  bottomBar: {
    position: "absolute",
    bottom: 40,
    left: 20,
    right: 20,
  },
  startBtn: {
    backgroundColor: "#4A90D9",
    padding: 18,
    borderRadius: 14,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  startBtnDisabled: {
    backgroundColor: "#333",
  },
  startBtnText: {
    color: "#fff",
    textAlign: "center",
    fontSize: 20,
    fontWeight: "bold",
  },
});
