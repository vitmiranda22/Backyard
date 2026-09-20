// Backyard — Main App
//
// Screen flow: no persistent tab bar -- Home is the one landing screen,
// and Map/Journal/Profile are all reached from it (Map + Journal via
// Home's own FAB row, Profile via its gear icon) and return there.
//   Login → Home → Mood Picker → Active Tour → Tour Complete → Home
//   Home → Journal (Discover) → Route Detail → Replay → Rate → Journal
//   Home → Profile → Paywall

import React, { useState, useEffect, useRef } from "react";
import { StatusBar, View, ActivityIndicator, Linking } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Updates from "expo-updates";
import * as SecureStore from "expo-secure-store";
import * as SplashScreen from "expo-splash-screen";
import { useFonts, Caveat_600SemiBold } from "@expo-google-fonts/caveat";
import { DMSerifDisplay_400Regular } from "@expo-google-fonts/dm-serif-display";
import {
  LibreBaskerville_400Regular,
  LibreBaskerville_700Bold,
  LibreBaskerville_400Regular_Italic,
} from "@expo-google-fonts/libre-baskerville";
import { WorkSans_400Regular, WorkSans_500Medium, WorkSans_600SemiBold, WorkSans_700Bold } from "@expo-google-fonts/work-sans";
import { restoreSession, signIn, getCurrentUserId, establishRecoverySession } from "./src/services/auth";
import { DEV_SKIP_LOGIN, DEV_EMAIL, DEV_PASSWORD } from "./src/config";
import { colors } from "./src/theme";
import { TourDetail, EndTourResponse, getSettings, getNarrationQuota } from "./src/services/api";
import { initSentry } from "./src/services/sentry";
import { initAnalytics, identifyUser, track, resetAnalytics } from "./src/services/analytics";
import { initPurchases } from "./src/services/purchases";
import "./src/i18n";
import { loadSavedLanguage } from "./src/i18n";
import { useTranslation } from "react-i18next";
import { showToast } from "./src/services/toast";

import LoginScreen from "./src/screens/LoginScreen";
import SignupScreen from "./src/screens/SignupScreen";
import ForgotPasswordScreen from "./src/screens/ForgotPasswordScreen";
import ResetPasswordScreen from "./src/screens/ResetPasswordScreen";
import OnboardingScreen from "./src/screens/OnboardingScreen";
import HomeScreen from "./src/screens/HomeScreen";
import MapScreen from "./src/screens/MapScreen";
import MuseumTourScreen from "./src/screens/MuseumTourScreen";
import ToursScreen from "./src/screens/ToursScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import MoodPickerScreen from "./src/screens/MoodPickerScreen";
import ActiveTourScreen from "./src/screens/ActiveTourScreen";
import TourCompleteScreen from "./src/screens/TourCompleteScreen";
import RouteDetailScreen from "./src/screens/RouteDetailScreen";
import ReplayScreen from "./src/screens/ReplayScreen";
import RouteRatingScreen from "./src/screens/RouteRatingScreen";
import PaywallScreen from "./src/screens/PaywallScreen";
import BadgeGalleryScreen from "./src/screens/BadgeGalleryScreen";
import ToastHost from "./src/components/Toast";
import ErrorBoundary from "./src/components/ErrorBoundary";
import ParchmentBackground from "./src/components/ParchmentBackground";

const ONBOARDING_KEY = "onboarding_complete";

initSentry();
initAnalytics();

// Held open until useFonts() below resolves -- without this the native
// splash screen hides itself automatically the moment the first frame
// renders, which would show a flash of the system fallback font before
// Caveat/Libre Baskerville/Work Sans finish loading.
SplashScreen.preventAutoHideAsync().catch(() => {});

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
  | "journal"
  | "map"
  | "profile"
  | "mood"
  | "tour"
  | "complete"
  | "routeDetail"
  | "replay"
  | "rate"
  | "paywall"
  | "badgeGallery"
  | "museumTour";

export default function App() {
  const { t } = useTranslation();
  const [fontsLoaded] = useFonts({
    Caveat_600SemiBold,
    DMSerifDisplay_400Regular,
    LibreBaskerville_400Regular,
    LibreBaskerville_700Bold,
    LibreBaskerville_400Regular_Italic,
    WorkSans_400Regular,
    WorkSans_500Medium,
    WorkSans_600SemiBold,
    WorkSans_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded]);

  const [screen, setScreen] = useState<Screen>("loading");
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
  const [selectedMuseumTourId, setSelectedMuseumTourId] = useState<string | null>(null);

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

  const quotaCheckInFlightRef = useRef(false);

  // Gates both starting a new tour and replaying a saved one -- a spent
  // daily quota now shows as an upfront warning instead of only surfacing
  // mid-flow once ActiveTourScreen's first narrate-block call 429s.
  // Replay itself never calls narrate-block (it plays back already-
  // recorded audio, zero OpenAI/TTS calls), so gating it here is a
  // deliberate product choice, not a technical necessity.
  async function canStartNewNarration(): Promise<boolean> {
    // Neither the Explore FAB nor Start Replay disable themselves while
    // this check is in flight, so a fast double-tap would otherwise fire
    // two concurrent quota checks (and, if quota's spent, two stacked
    // toasts) -- the second tap while one's already running just no-ops.
    if (quotaCheckInFlightRef.current) return false;
    quotaCheckInFlightRef.current = true;
    try {
      const { remaining } = await getNarrationQuota();
      if (remaining <= 0) {
        showToast(t("activeTour.narrationDailyLimitError"));
        return false;
      }
      return true;
    } catch (e) {
      // A failed quota check shouldn't itself block the walker -- fail
      // open, same as the backend's own rate-limit check does on a DB hiccup.
      console.warn("Narration quota check failed, allowing anyway:", e);
      return true;
    } finally {
      quotaCheckInFlightRef.current = false;
    }
  }

  async function goToMainOrOnboarding() {
    const seen = await SecureStore.getItemAsync(ONBOARDING_KEY).catch(() => null);
    setScreen(seen ? "main" : "onboarding");
  }

  // Shared by both LoginScreen (onLogin) and SignupScreen (onSignedUp) --
  // a session is a session regardless of how it was established (password,
  // Apple, Google, or a freshly-confirmed email signup), so whoever just
  // got one should land in the app the same way, not bounce through a
  // second manual login.
  function handleAuthenticated() {
    goToMainOrOnboarding();
    refreshSettings();
    identifyCurrentUser();
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
    setScreen("journal");
  }

  if (!fontsLoaded) {
    return null;
  }

  return (
    <ErrorBoundary>
    <SafeAreaProvider>
    <ParchmentBackground>
      <StatusBar barStyle="dark-content" backgroundColor={colors.parchmentBg} />
      <ToastHost />

      {screen === "loading" && (
        <View style={{ flex: 1, backgroundColor: "transparent", justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={colors.ink} />
        </View>
      )}

      {screen === "login" && (
        <LoginScreen
          onLogin={handleAuthenticated}
          onCreateAccount={() => setScreen("signup")}
          onForgotPassword={() => setScreen("forgotPassword")}
        />
      )}

      {screen === "signup" && (
        <SignupScreen
          onBack={() => setScreen("login")}
          onSignedUp={handleAuthenticated}
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
        <HomeScreen
          onStartTour={async () => {
            if (await canStartNewNarration()) setScreen("mood");
          }}
          onSelectRoute={(id) => {
            setSelectedRouteId(id);
            setScreen("routeDetail");
          }}
          onOpenMap={() => setScreen("map")}
          onOpenJournal={() => setScreen("journal")}
          onOpenProfile={() => setScreen("profile")}
          onOpenBadges={() => setScreen("badgeGallery")}
        />
      )}

      {screen === "journal" && (
        <ToursScreen
          onSelectRoute={(id) => {
            setSelectedRouteId(id);
            setScreen("routeDetail");
          }}
          onBack={() => setScreen("main")}
        />
      )}

      {screen === "map" && (
        <MapScreen
          onSelectRoute={(id) => {
            setSelectedRouteId(id);
            setScreen("routeDetail");
          }}
          onSelectMuseumTour={(id) => {
            setSelectedMuseumTourId(id);
            setScreen("museumTour");
          }}
          onBack={() => setScreen("main")}
        />
      )}

      {screen === "profile" && (
        <ProfileScreen
          onBack={() => setScreen("main")}
          onSignedOut={() => {
            resetAnalytics();
            setScreen("login");
          }}
          isPremium={isPremium}
          onOpenPaywall={requirePremium}
        />
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
            setScreen("main");
          }}
        />
      )}

      {screen === "routeDetail" && selectedRouteId && (
        <RouteDetailScreen
          tourId={selectedRouteId}
          onStartReplay={async (tour) => {
            if (await canStartNewNarration()) {
              setReplayTour(tour);
              setScreen("replay");
            }
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

      {screen === "museumTour" && selectedMuseumTourId && (
        <MuseumTourScreen
          tourId={selectedMuseumTourId}
          onExit={() => setScreen("map")}
        />
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

      {screen === "badgeGallery" && (
        <BadgeGalleryScreen onBack={() => setScreen("main")} />
      )}
    </ParchmentBackground>
    </SafeAreaProvider>
    </ErrorBoundary>
  );
}
