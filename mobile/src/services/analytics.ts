// Product analytics (PostHog) — scaffolded, inactive until POSTHOG_API_KEY
// is filled in (see src/config.ts). Every export here is a safe no-op when
// analytics isn't configured, so call sites never need to guard themselves.

import { PostHog } from "posthog-react-native";
import { POSTHOG_API_KEY, POSTHOG_HOST } from "../config";

let client: PostHog | null = null;

export function initAnalytics() {
  if (!POSTHOG_API_KEY || client) return;
  client = new PostHog(POSTHOG_API_KEY, {
    host: POSTHOG_HOST,
    // Custom screen switcher, not React Navigation — screens are tracked
    // manually via track("screen_viewed", ...) instead of autocapture.
    captureAppLifecycleEvents: true,
  });
}

export function identifyUser(userId: string, properties?: Record<string, any>) {
  client?.identify(userId, properties);
}

export function track(event: string, properties?: Record<string, any>) {
  client?.capture(event, properties);
}

export function resetAnalytics() {
  client?.reset();
}
