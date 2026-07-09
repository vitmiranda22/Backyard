// Backyard — Main App
//
// Screen flow:
//   Login → [Home / Tours / Profile tabs] → Mode Picker → Active Tour → Tour Complete → Home
//   Tours (Discover) → Route Detail → Replay → Rate → Tours
//   Profile → Voice Picker / Paywall

import React, { useState, useEffect } from "react";
import { StatusBar, View, ActivityIndicator } from "react-native";
import * as Updates from "expo-updates";
import { restoreSession, signIn } from "./src/services/auth";
import { DEV_SKIP_LOGIN, DEV_EMAIL, DEV_PASSWORD } from "./src/config";
import { colors } from "./src/theme";
import { TourDetail, getSettings } from "./src/services/api";

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
import PaywallScreen from "./src/screens/PaywallScreen";
import VoicePickerScreen from "./src/screens/VoicePickerScreen";
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
  | "rate"
  | "paywall"
  | "voicePicker";

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

  // Premium entitlement + voice preference — fetched once after login,
  // refreshed whenever the user returns from the Paywall or Voice Picker.
  const [isPremium, setIsPremium] = useState(false);
  const [preferredVoice, setPreferredVoice] = useState("neutral");
  const [screenBeforePaywall, setScreenBeforePaywall] = useState<Screen>("main");

  async function refreshSettings() {
    try {
      const settings = await getSettings();
      setIsPremium(settings.is_premium);
      setPreferredVoice(settings.preferred_voice);
    } catch (e: any) {
      console.warn("Failed to load settings:", e.message);
    }
  }

  function requirePremium() {
    setScreenBeforePaywall(screen);
    setScreen("paywall");
  }

  useEffect(() => {
    // Without this, a published EAS Update only downloads on this launch and
    // doesn't take effect until the NEXT cold start — every update needs two
    // manual relaunches to show up. Fetch + reload eagerly instead so one
    // relaunch is enough.
    async function applyPendingUpdate() {
      if (__DEV__) return;
      try {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch (e) {
        console.warn("Update check failed:", e);
      }
    }
    applyPendingUpdate();
  }, []);

  useEffect(() => {
    async function checkSession() {
      // DEV ONLY: auto sign-in with a test account so we don't have to
      // log in every time while testing. Set DEV_SKIP_LOGIN to false in
      // src/config.ts to restore the normal login flow.
      if (DEV_SKIP_LOGIN) {
        try {
          await signIn(DEV_EMAIL, DEV_PASSWORD);
          setScreen("main");
          refreshSettings();
          return;
        } catch (e) {
          console.warn("Dev auto-login failed, falling back to login screen:", e);
        }
      }

      const hasSession = await restoreSession();
      setScreen(hasSession ? "main" : "login");
      if (hasSession) refreshSettings();
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
        <LoginScreen
          onLogin={() => {
            setScreen("main");
            refreshSettings();
          }}
        />
      )}

      {screen === "main" && (
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          <View style={{ flex: 1 }}>
            {activeTab === "home" && (
              <HomeScreen
                onStartTour={() => setScreen("mood")}
                onQuickStart={startTourWithMood}
                onSelectRoute={(id) => {
                  setSelectedRouteId(id);
                  setScreen("routeDetail");
                }}
                isPremium={isPremium}
                onRequirePremium={requirePremium}
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
              <ProfileScreen
                onSignedOut={() => setScreen("login")}
                isPremium={isPremium}
                onOpenVoicePicker={() => setScreen("voicePicker")}
                onOpenPaywall={requirePremium}
              />
            )}
          </View>
          <TabBar active={activeTab} onChange={setActiveTab} />
        </View>
      )}

      {screen === "mood" && (
        <MoodPickerScreen
          onSelect={startTourWithMood}
          onCancel={() => setScreen("main")}
          isPremium={isPremium}
          onRequirePremium={requirePremium}
        />
      )}

      {screen === "tour" && (
        <ActiveTourScreen
          mood={selectedMood}
          voice={preferredVoice}
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
          onExit={backToTours}
        />
      )}

      {screen === "rate" && replayTour && (
        <RouteRatingScreen tour={replayTour} onDone={backToTours} />
      )}

      {screen === "paywall" && (
        <PaywallScreen
          onClose={() => {
            setScreen(screenBeforePaywall);
            refreshSettings();
          }}
        />
      )}

      {screen === "voicePicker" && (
        <VoicePickerScreen
          isPremium={isPremium}
          onOpenPaywall={requirePremium}
          onBack={() => {
            setActiveTab("profile");
            setScreen("main");
            refreshSettings();
          }}
        />
      )}
    </>
  );
}
