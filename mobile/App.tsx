// Backyard — Main App
//
// Screen flow:
//   Login → Home (map) → Mood Picker → Voice Picker → Active Tour → Tour Complete → Home

import React, { useState, useEffect } from "react";
import { StatusBar } from "react-native";
import { restoreSession } from "./src/services/auth";

import LoginScreen from "./src/screens/LoginScreen";
import HomeScreen from "./src/screens/HomeScreen";
import MoodPickerScreen from "./src/screens/MoodPickerScreen";
import VoicePickerScreen from "./src/screens/VoicePickerScreen";
import ActiveTourScreen from "./src/screens/ActiveTourScreen";
import TourCompleteScreen from "./src/screens/TourCompleteScreen";

// Simple screen state — no navigation library needed for MVP
type Screen =
  | "login"
  | "home"
  | "mood"
  | "voice"
  | "tour"
  | "complete";

export default function App() {
  const [screen, setScreen] = useState<Screen>("login");
  const [selectedMood, setSelectedMood] = useState("informative");
  const [selectedVoice, setSelectedVoice] = useState("neutral");
  const [tourId, setTourId] = useState("");
  const [blocksVisited, setBlocksVisited] = useState(0);
  const [startTime, setStartTime] = useState(0);

  // Try to restore session on app launch
  useEffect(() => {
    async function checkSession() {
      const hasSession = await restoreSession();
      if (hasSession) {
        setScreen("home");
      }
    }
    checkSession();
  }, []);

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#0d0d1a" />

      {screen === "login" && (
        <LoginScreen onLogin={() => setScreen("home")} />
      )}

      {screen === "home" && (
        <HomeScreen onStartTour={() => setScreen("mood")} />
      )}

      {screen === "mood" && (
        <MoodPickerScreen
          onSelect={(mood) => {
            setSelectedMood(mood);
            setScreen("voice");
          }}
        />
      )}

      {screen === "voice" && (
        <VoicePickerScreen
          onSelect={(voice) => {
            setSelectedVoice(voice);
            setScreen("tour");
          }}
        />
      )}

      {screen === "tour" && (
        <ActiveTourScreen
          mood={selectedMood}
          voice={selectedVoice}
          contentSafety={false}
          onEndTour={(id, blocks, start) => {
            setTourId(id);
            setBlocksVisited(blocks);
            setStartTime(start);
            setScreen("complete");
          }}
        />
      )}

      {screen === "complete" && (
        <TourCompleteScreen
          tourId={tourId}
          blocksVisited={blocksVisited}
          startTime={startTime}
          onDone={() => setScreen("home")}
        />
      )}
    </>
  );
}
