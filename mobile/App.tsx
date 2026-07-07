// Backyard — Main App
//
// Screen flow:
//   Login → [Home / Tours / Profile tabs] → Mode Picker → Active Tour → Tour Complete → Home
//   Tours (Discover) → Route Detail → Replay → Rate → Tours
//   (Voice picker removed — defaults to "dramatic")

import React, { useState, useEffect } from "react";
import { StatusBar, View, ActivityIndicator } from "react-native";
import { restoreSession, signIn } from "./src/services/auth";
import { DEV_SKIP_LOGIN, DEV_EMAIL, DEV_PASSWORD } from "./src/config";
import { colors } from "./src/theme";
import { TourDetail } from "./src/services/api";

import LoginScreen from "./src/screens/LoginScreen";
import HomeScreen from "./src/screens/HomeScreen";
import ToursScreen from "./src/screens/ToursScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import MoodPickerScreen from "./src/screens/MoodPickerScreen";
import ActiveTourScreen from "./src/screens/ActiveTourScreen";
import TourCompleteScreen from "./src/screens/TourCompleteScreen";
import RouteDetailScreen from "./src/screens/RouteDetailScreen";
import ReplayScreen from "./src/screens/ReplayScreen";
import RouteRatingScreen from "./src/screens/RouteRatingScreen";
import TabBar, { MainTab } from "./src/components/TabBar";

type Screen =
  | "loading"
  | "login"
  | "main"
  | "mood"
  | "tour"
  | "complete"
  | "routeDetail"
  | "replay"
  | "rate";

export default function App() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [activeTab, setActiveTab] = useState<MainTab>("home");
  const [selectedMood, setSelectedMood] = useState("time_machine");
  const [tourId, setTourId] = useState("");
  const [blocksVisited, setBlocksVisited] = useState(0);
  const [startTime, setStartTime] = useState(0);

  // Routes/replay state
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [replayTour, setReplayTour] = useState<TourDetail | null>(null);

  useEffect(() => {
    async function checkSession() {
      // DEV ONLY: auto sign-in with a test account so we don't have to
      // log in every time while testing. Set DEV_SKIP_LOGIN to false in
      // src/config.ts to restore the normal login flow.
      if (DEV_SKIP_LOGIN) {
        try {
          await signIn(DEV_EMAIL, DEV_PASSWORD);
          setScreen("main");
          return;
        } catch (e) {
          console.warn("Dev auto-login failed, falling back to login screen:", e);
        }
      }

      const hasSession = await restoreSession();
      setScreen(hasSession ? "main" : "login");
    }
    checkSession();
  }, []);

  function startTourWithMood(mood: string) {
    setSelectedMood(mood);
    setScreen("tour");
  }

  function backToTours() {
    setActiveTab("tours");
    setScreen("main");
  }

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />

      {screen === "loading" && (
        <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      )}

      {screen === "login" && (
        <LoginScreen onLogin={() => setScreen("main")} />
      )}

      {screen === "main" && (
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          <View style={{ flex: 1 }}>
            {activeTab === "home" && (
              <HomeScreen
                onStartTour={() => setScreen("mood")}
                onQuickStart={startTourWithMood}
              />
            )}
            {activeTab === "tours" && (
              <ToursScreen
                onSelectRoute={(id) => {
                  setSelectedRouteId(id);
                  setScreen("routeDetail");
                }}
              />
            )}
            {activeTab === "profile" && (
              <ProfileScreen onSignedOut={() => setScreen("login")} />
            )}
          </View>
          <TabBar active={activeTab} onChange={setActiveTab} />
        </View>
      )}

      {screen === "mood" && (
        <MoodPickerScreen
          onSelect={startTourWithMood}
          onCancel={() => setScreen("main")}
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
          onDone={() => {
            setActiveTab("home");
            setScreen("main");
          }}
        />
      )}

      {screen === "routeDetail" && selectedRouteId && (
        <RouteDetailScreen
          tourId={selectedRouteId}
          onStartReplay={(tour) => {
            setReplayTour(tour);
            setScreen("replay");
          }}
          onBack={backToTours}
        />
      )}

      {screen === "replay" && replayTour && (
        <ReplayScreen
          tour={replayTour}
          onReplayComplete={() => setScreen("rate")}
        />
      )}

      {screen === "rate" && replayTour && (
        <RouteRatingScreen tour={replayTour} onDone={backToTours} />
      )}
    </>
  );
}
