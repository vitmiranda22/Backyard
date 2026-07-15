// App Store / Play Store review prompt — asks after the walker has
// clearly gotten real use out of the app (their Nth own tour saved on
// this device), not on day one and not after every single tour.
//
// iOS hard-throttles SKStoreReviewController itself (~3 prompts per 365
// days per app, enforced by the OS regardless of how often we call it).
// Android's in-app review API has no equivalent enforced cap, so the
// same self-imposed limits here keep both platforms at the same
// restrained cadence rather than Android asking far more often than iOS.

import * as SecureStore from "expo-secure-store";
import * as StoreReview from "expo-store-review";

const SAVED_TOUR_COUNT_KEY = "saved_tour_count";
const LAST_PROMPT_AT_KEY = "review_prompt_last_at";
const PROMPT_COUNT_KEY = "review_prompt_count";

const MIN_SAVED_TOURS_BEFORE_FIRST_ASK = 3;
const MIN_DAYS_BETWEEN_ASKS = 90;
const MAX_PROMPTS_EVER = 3;

// Call once per successfully-saved own tour (see TourCompleteScreen's
// handleSave) — silently counts toward the milestone and, once earned,
// silently checks whether it's actually a good moment to ask. Never
// throws, never blocks the caller; a failure here should never be
// visible to the walker.
export async function maybePromptForReview() {
  try {
    const countStr = await SecureStore.getItemAsync(SAVED_TOUR_COUNT_KEY);
    const tourCount = (countStr ? parseInt(countStr, 10) : 0) + 1;
    await SecureStore.setItemAsync(SAVED_TOUR_COUNT_KEY, String(tourCount));

    if (tourCount < MIN_SAVED_TOURS_BEFORE_FIRST_ASK) return;

    const promptCountStr = await SecureStore.getItemAsync(PROMPT_COUNT_KEY);
    const promptCount = promptCountStr ? parseInt(promptCountStr, 10) : 0;
    if (promptCount >= MAX_PROMPTS_EVER) return;

    const lastPromptStr = await SecureStore.getItemAsync(LAST_PROMPT_AT_KEY);
    if (lastPromptStr) {
      const daysSinceLastAsk = (Date.now() - parseInt(lastPromptStr, 10)) / (1000 * 60 * 60 * 24);
      if (daysSinceLastAsk < MIN_DAYS_BETWEEN_ASKS) return;
    }

    const available = await StoreReview.isAvailableAsync();
    if (!available) return;

    await StoreReview.requestReview();
    await SecureStore.setItemAsync(LAST_PROMPT_AT_KEY, String(Date.now()));
    await SecureStore.setItemAsync(PROMPT_COUNT_KEY, String(promptCount + 1));
  } catch (e) {
    console.warn("Review prompt check failed (harmless):", e);
  }
}
