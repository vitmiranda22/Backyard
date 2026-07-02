// Backyard — Main App
//
// Screen flow:
//   Login → Home (map) → Mode Picker → Active Tour → Tour Complete → Home
//   (Voice picker removed — defaults to "dramatic")

import React, { useState, useEffect } from "react";
import { StatusBar } from "react-native";
import { restoreSession } from "./src/services/auth";

import LoginScreen from "./src/screens/LoginScreen";
import HomeScreen from "./src/screens/HomeScreen";
import MoodPickerScreen from "./src/screens/MoodPickerScreen";
import ActiveTourScreen from "./src/screens/ActiveTourScreen";
import TourCompleteScreen from "./src/screens/TourCompleteScreen";

type Screen = "login" | "home" | "mood" | "tour" | "complete";

export default function App() {
  const [screen, setScreen] = useState<Screen>("login");
  const [selectedMood, setSelectedMood] = useState("time_machine");
  const [tourId, setTourId] = useState("");
  const [blocksVisited, setBlocksVisited] = useState(0);
  const [startTime, setStartTime] = useState(0);

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
            setScreen("tour");
          }}
        />
      )}

      {screen === "tour" && (
        <ActiveTourScreen
          mood={selectedMood}
          voice="dramatic"
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
