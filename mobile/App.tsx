// Backyard — Main App
//
// Screen flow:
//   Login → [Home / Tours / Profile tabs] → Mode Picker → Active Tour → Tour Complete → Home
//   Tours (Discover) → Route Detail → Replay → Rate → Tours
//   Profile → Voice Picker / Paywall

import React, { useState, useEffect } from "react";
import { StatusBar, View, ActivityIndicator, Linking } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Updates from "expo-updates";
import * as SecureStore from "expo-secure-store";
import { restoreSession, signIn, getCurrentUserId, establishRecoverySession } from "./src/services/auth";
import { DEV_SKIP_LOGIN, DEV_EMAIL, DEV_PASSWORD } from "./src/config";
import { colors } from "./src/theme";
import { TourDetail, EndTourResponse, getSettings } from "./src/services/api";
import { initSentry } from "./src/services/sentry";
import { initAnalytics, identifyUser, track, resetAnalytics } from "./src/services/analytics";
import { initPurchases } from "./src/services/purchases";
import "./src/i18n";
import { loadSavedLanguage } from "./src/i18n";

import LoginScreen from "./src/screens/LoginScreen";
import SignupScreen from "./src/screens/SignupScreen";
import ForgotPasswordScreen from "./src/screens/ForgotPasswordScreen";
import ResetPasswordScreen from "./src/screens/ResetPasswordScreen";
import OnboardingScreen from "./src/screens/OnboardingScreen";
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
import BadgeGalleryScreen from "./src/screens/BadgeGalleryScreen";
import TabBar, { MainTab } from "./src/components/TabBar";
import ToastHost from "./src/components/Toast";
import ErrorBoundary from "./src/components/ErrorBoundary";

const ONBOARDING_KEY = "onboarding_complete";

initSentry();
initAnalytics();

// Parses backyard://route/<tourId> deep links (from Share) into a tourId,
// or null if the URL doesn't match that shape.
function parseRouteDeepLink(url: string): string | null {
  const match = url.match(/^backyard:\/\/route\/([^/?#]+)/);
  return match ? match[1] : null;
}

// Parses backyard://reset-password#access_token=...&refresh_token=...&type=recovery
// deep links (from the password-reset email, see auth.ts's
// requestPasswordReset) into the token pair, or null if the URL doesn't
// match that shape or is missing either token.
function parseResetPasswordDeepLink(url: string): { accessToken: string; refreshToken: string } | null {
  if (!url.startsWith("backyard://reset-password")) return null;
  const hashIndex = url.indexOf("#");
  if (hashIndex === -1) return null;
  const params = new URLSearchParams(url.slice(hashIndex + 1));
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

type Screen =
  | "loading"
  | "login"
  | "signup"
  | "forgotPassword"
  | "resetPassword"
  | "onboarding"
  | "main"
  | "mood"
  | "tour"
  | "complete"
  | "routeDetail"
  | "replay"
  | "rate"
  | "paywall"
  | "voicePicker"
  | "badgeGallery";

export default function App() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [activeTab, setActiveTab] = useState<MainTab>("home");
  const [selectedMood, setSelectedMood] = useState("time_machine");
  const [tourId, setTourId] = useState("");
  const [blocksVisited, setBlocksVisited] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [tourPath, setTourPath] = useState<{ lat: number; lng: number }[]>([]);
  // Set only when ActiveTourScreen already called /end-tour itself (an
  // auto-completed tour, so it could play the outro right after the last
  // block) -- TourCompleteScreen reuses this instead of fetching its own,
  // so the outro's TTS is never generated twice for the same tour.
  const [prefetchedEndResult, setPrefetchedEndResult] = useState<EndTourResponse | null>(null);

  // Routes/replay state
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [replayTour, setReplayTour] = useState<TourDetail | null>(null);
  const [pendingRouteId, setPendingRouteId] = useState<string | null>(null);

  // Premium entitlement + voice preference — fetched once after login,
  // refreshed whenever the user returns from the Paywall or Voice Picker.
  const [isPremium, setIsPremium] = useState(false);
  const [preferredVoice, setPreferredVoice] = useState("neutral");
  const [contentSafety, setContentSafety] = useState(false);
  const [screenBeforePaywall, setScreenBeforePaywall] = useState<Screen>("main");

  async function refreshSettings() {
    try {
      const settings = await getSettings();
      setIsPremium(settings.is_premium);
      setPreferredVoice(settings.preferred_voice);
      setContentSafety(settings.content_safety);
    } catch (e: any) {
      console.warn("Failed to load settings:", e.message);
    }
  }

  // Links this device to a stable identity for analytics + purchases —
  // called once per session, right after we know the user is signed in.
  async function identifyCurrentUser() {
    try {
      const userId = await getCurrentUserId();
      if (!userId) return;
      identifyUser(userId);
      initPurchases(userId);
    } catch (e) {
      console.warn("Failed to identify user:", e);
    }
  }

  function requirePremium() {
    setScreenBeforePaywall(screen);
    setScreen("paywall");
  }

  async function goToMainOrOnboarding() {
    const seen = await SecureStore.getItemAsync(ONBOARDING_KEY).catch(() => null);
    setScreen(seen ? "main" : "onboarding");
  }

  function finishOnboarding() {
    SecureStore.setItemAsync(ONBOARDING_KEY, "true").catch(() => {});
    setScreen("main");
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
    // A shared link (backyard://route/<id>) opening the app cold or warm —
    // stashed until the session check below lands somewhere past login.
    // A password-reset link is handled immediately instead, since it needs
    // to jump straight to ResetPasswordScreen regardless of session state.
    async function handleIncomingUrl(url: string) {
      const routeId = parseRouteDeepLink(url);
      if (routeId) {
        setPendingRouteId(routeId);
        return;
      }
      const recovery = parseResetPasswordDeepLink(url);
      if (recovery) {
        try {
          await establishRecoverySession(recovery.accessToken, recovery.refreshToken);
          setScreen("resetPassword");
        } catch (e) {
          console.warn("Failed to establish recovery session:", e);
        }
      }
    }

    Linking.getInitialURL().then((url) => {
      if (url) handleIncomingUrl(url);
    });
    const sub = Linking.addEventListener("url", ({ url }) => {
      handleIncomingUrl(url);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (pendingRouteId && screen !== "loading" && screen !== "login") {
      setSelectedRouteId(pendingRouteId);
      setScreen("routeDetail");
      setPendingRouteId(null);
    }
  }, [pendingRouteId, screen]);

  useEffect(() => {
    loadSavedLanguage();
  }, []);

  useEffect(() => {
    async function checkSession() {
      // DEV ONLY: auto sign-in with a test account so we don't have to
      // log in every time while testing. Set DEV_SKIP_LOGIN to false in
      // src/config.ts to restore the normal login flow. Gated on __DEV__
      // (always false in a release/production build, regardless of
      // DEV_SKIP_LOGIN's value) so this can never accidentally ship live
      // and auto-authenticate real users as the shared dev account.
      if (__DEV__ && DEV_SKIP_LOGIN) {
        try {
          await signIn(DEV_EMAIL, DEV_PASSWORD);
          goToMainOrOnboarding();
          refreshSettings();
          identifyCurrentUser();
          return;
        } catch (e) {
          console.warn("Dev auto-login failed, falling back to login screen:", e);
        }
      }

      const hasSession = await restoreSession();
      if (hasSession) {
        goToMainOrOnboarding();
        refreshSettings();
        identifyCurrentUser();
      } else {
        setScreen("login");
      }
    }
    checkSession();
  }, []);

  function startTourWithMood(mood: string) {
    track("tour_started", { mood });
    setSelectedMood(mood);
    setScreen("tour");
  }

  function backToTours() {
    setActiveTab("tours");
    setScreen("main");
  }

  return (
    <ErrorBoundary>
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
      <ToastHost />

      {screen === "loading" && (
        <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      )}

      {screen === "login" && (
        <LoginScreen
          onLogin={() => {
            goToMainOrOnboarding();
            refreshSettings();
            identifyCurrentUser();
          }}
          onCreateAccount={() => setScreen("signup")}
          onForgotPassword={() => setScreen("forgotPassword")}
        />
      )}

      {screen === "signup" && (
        <SignupScreen
          onBack={() => setScreen("login")}
          onSignedUp={() => setScreen("login")}
        />
      )}

      {screen === "forgotPassword" && (
        <ForgotPasswordScreen onBack={() => setScreen("login")} />
      )}

      {screen === "resetPassword" && (
        <ResetPasswordScreen onDone={() => setScreen("login")} />
      )}

      {screen === "onboarding" && <OnboardingScreen onDone={finishOnboarding} />}

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
                onSignedOut={() => {
                  resetAnalytics();
                  setScreen("login");
                }}
                isPremium={isPremium}
                onOpenVoicePicker={() => setScreen("voicePicker")}
                onOpenPaywall={requirePremium}
                onOpenBadges={() => setScreen("badgeGallery")}
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
          contentSafety={contentSafety}
          isPremium={isPremium}
          onEndTour={(id, blocks, start, path, prefetchedResult) => {
            setTourId(id);
            setBlocksVisited(blocks);
            setStartTime(start);
            setTourPath(path.map((p) => ({ lat: p.latitude, lng: p.longitude })));
            setPrefetchedEndResult(prefetchedResult || null);
            setScreen("complete");
          }}
        />
      )}

      {screen === "complete" && (
        <TourCompleteScreen
          tourId={tourId}
          blocksVisited={blocksVisited}
          startTime={startTime}
          path={tourPath}
          prefetchedResult={prefetchedEndResult}
          onDone={() => {
            setPrefetchedEndResult(null);
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
          onPurchased={() => {
            // Unlock immediately client-side — the backend's is_premium flag
            // (kept in sync via a RevenueCat webhook) can lag purchase
            // confirmation by a few seconds, and refreshSettings() above
            // would otherwise briefly show the user as still free.
            setIsPremium(true);
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

      {screen === "badgeGallery" && (
        <BadgeGalleryScreen
          onBack={() => {
            setActiveTab("profile");
            setScreen("main");
          }}
        />
      )}
    </SafeAreaProvider>
    </ErrorBoundary>
  );
}
