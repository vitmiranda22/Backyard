# Launch checklist

One place to see what's actually done vs. still open before Backyard goes live. Updated as of the "suggest nearby waypoint" green-arrow pass — re-check dates and quotas before relying on this if it's been a while.

## Store submission

- [x] Android production build (`.aab`) built and ready — sitting in EAS, not yet uploaded to Play Console
- [ ] Submit Android build to Play Console (your call on timing)
- [ ] iOS production build — blocked on the EAS free-tier monthly build quota, resets **Aug 1, 2026**
- [x] Store listing copy finalized (`docs/store_listing.md`): name, subtitle, full description, keywords, category, privacy/support URLs
- [ ] Screenshots — not yet captured; needs a real device/simulator with a build installed, can't be done from this environment
- [ ] Play Console identity verification (Google's own process, multi-day) — blocked, parked

## Auth & onboarding

- [x] Real Create Account screen (method picker → email details form), split out of the login screen
- [x] Signup collects full name, date of birth, and requires explicit Privacy Policy/Terms acceptance before submitting
- [x] Server-side age-gate: `is_user_underage()` fails closed on unknown DOB, forces mature "content off" narration to PG for anyone under 18 regardless of what the client requests
- [x] Existing accounts (created before migration `017_signup_dob_privacy.sql`) can now add a date of birth from `ProfileScreen` — `PATCH /user/settings` accepts and validates it server-side, unlocking the mature content toggle once set.
- [ ] Google/Apple sign-in — buttons are shipped and visible (disabled, "coming soon") but not functional. Needs: OAuth credentials set up in Supabase Auth + Google Cloud Console + Apple Developer Portal (your side), plus native modules that require a new EAS Build (blocked on the iOS quota above for that platform).
- [ ] Real mascot logo — login/signup currently show the "Backyard" text wordmark only; a marked placeholder was shown in the design mockups but no real asset exists yet to drop in.

## RevenueCat / payments

- [x] iOS entitlements live (Backyard Pro, monthly/annual App Store subscriptions)
- [ ] Android entitlements — blocked on Play Console verification above (`REVENUECAT_ANDROID_API_KEY` still blank)
- [x] Webhook (`/api/webhooks/revenuecat`) verified with a constant-time secret comparison
- [x] Revenue visible in the admin dashboard (`/admin`) via RevenueCat's Metrics API — currently $0, no real customers yet

## Legal / compliance

- [x] Privacy policy (`/privacy`) — discloses every third party that touches user data (OpenAI, Google Cloud, Supabase, Cloudflare R2, PostHog, Sentry, RevenueCat), plus the newly-collected full name/date of birth and why
- [x] Terms of Service (`/terms`) — AI-generated content disclaimers, published-route rules, premium billing, acceptable use, and the 18+ clause on the mature content setting
- [x] Support/privacy contact addresses live (`support@backyard.app`, `privacy@backyard.app`)

## Security

Full audit completed and remediated — see git log for the complete trail. Summary:
- [x] RLS hardening, private-tour visibility fix, comments/likes authorization, rate limiting on start-tour/comments/likes/ratings, upload validation on ask-question, `DEV_SKIP_LOGIN` gated behind `__DEV__`, dependency hygiene (`npm audit fix`, unused `python-jose` removed)
- [x] Age-gate is defense-in-depth server-side (narrate-block + start-tour), not just a client-side toggle — a modified/stale client can't bypass it

## Content quality

- [x] Zone-data source prioritization rebalanced across all 34 sources (tiered by narrative value, mode-aware promotion for dark_side/hidden_city/unfiltered/time_machine) — found and fixed via a live multi-city test
- [x] Fixed a real narration bug found in that same test: the model would occasionally answer in the source data's language instead of English, and would recycle the prompt's own illustrative example as if it were a real fact when zone data was thin — both now explicitly guarded against in `prompts.py`
- [x] Every tour now gets a real spoken intro (free modes get an unnamed welcome line, premium modes keep their named persona) and a spoken outro when the app auto-completes a tour at the block cap — manual early endings don't get an outro, since there's nothing to compensate for
- [x] 8 of the 9 real test tours are published to Discover (Lisbon, Buenos Aires, Marrakech, Reykjavik, Hanoi, Accra, Wellington, Québec City) — real content across 8 cities instead of SF-only test data. Kyoto is deliberately still private: it contains the actual language-leak/hallucination bugs found during that test (fixed in `prompts.py` since, but not regenerated for this specific tour).
- [x] Suggested-next-waypoint green arrow: mines the current block's own already-fetched Wikipedia/OSM data for a nearby real point of interest and shows it as a map marker — no new fetch cost, live-verified against real Wikipedia geosearch data.

## Monitoring & ops

- [x] Admin dashboard live at `/admin` (users, tours, engagement, revenue, storage, costs, cache sizes), gated behind a constant-time-compared secret
- [x] Sentry crash reporting + PostHog analytics wired in
- [x] Daily cache-cleanup cron, keep-alive cron for Render's free-tier cold starts

## Test coverage

- [x] Backend: 115 tests — all of the above plus the age-gate's date-boundary math, signup persistence paths, mode-aware zone-data prioritization, settings' date-of-birth validation, and `pick_suggested_next()`
- [x] Mobile: 150 tests across all screens (now including `SignupScreen`, `ProfileScreen`'s DOB card and subscription-deletion warning, the suggested-waypoint marker, and `ErrorBoundary`) plus the service layer

## Gaps found and fixed in this pass

- [x] **Discover was mostly dev/QA junk, not curated content.** Of 38 published tours, only 8 were the real curated city tours — the other 30 were internal test runs (titles like "Wrong script", "Wrong introduction", "Photo feature test", 0-block "Time Machine: Tour" entries, repeated SF Richmond District/Polk Gulch dev-loop runs). Deleted all 30 — none had ratings/likes/comments, so nothing of real value was lost. Deleting a `tours` row only cascades to its `tour_blocks` (the per-tour playback record); it does **not** touch `narration_cache`/`zone_data_cache` (geohash+mood+voice-keyed, shared across tours) or the underlying R2 audio/image files, so all of that stays live as reusable cache. Discover now shows exactly the 8 curated tours.
- [x] **iOS location permission string was missing entirely.** `app.json` had no `NSLocationWhenInUseUsageDescription` and `expo-location` wasn't listed in `plugins`, even though `src/services/location.ts` actively calls `requestForegroundPermissionsAsync`/`watchPositionAsync` — core to how the app works. Fixed (both the plugin entry and an explicit `infoPlist` string). **This is a native config change — it only takes effect on the next EAS Build, not an OTA update.** The Android `.aab` currently sitting in EAS (see Store submission above) predates this fix and needs a rebuild before it's uploaded to Play Console.
- [x] **No top-level error boundary.** Added `src/components/ErrorBoundary.tsx`, wrapping `App.tsx` — an uncaught render error now shows a "something went wrong, restart" screen and reports to Sentry instead of white-screening with no recovery. JS-only, already shipped via EAS Update.
- [x] **Account deletion didn't warn about active subscriptions.** Deleting the account cascades every DB row, but neither Apple nor Google let a third party cancel a platform subscription via API — a premium user who deleted their account would keep being billed. The deletion confirmation now tells premium users to cancel via the App Store/Play Store first (`profile.deleteAccountBodyPremium`, free users still see the plain version). JS-only, already shipped via EAS Update.

## Known gaps, not blocking but worth knowing about

- **OpenAI and Google Cloud costs still aren't tracked** in the admin dashboard's Costs section — both need separate, more-sensitive billing-scoped credentials that aren't set up. R2 storage cost is real and tracked.
- **Screen-level UI polish/QA on a real device** hasn't happened in this environment — everything here is automated test coverage + manual API-level verification, not a hands-on walkthrough on a phone.
- **Forgot-password flow doesn't exist** — not part of the recent auth redesign scope, worth adding alongside the ProfileScreen DOB field above.
- **No client-side request timeout** in `mobile/src/services/api.ts` — `fetch()` calls have no `AbortController`/timeout, so a slow or hung backend request (e.g. a rare cold start slipping past the keep-alive cron) just spins with no "still working…" affordance or retry. Low severity given the keep-alive cron exists, but worth a timeout + friendlier error someday.
- **App Store "Privacy Nutrition Label" / Play Data Safety form** — a manual, one-time form in App Store Connect / Play Console (not code); now that the privacy policy discloses real third-party data sharing (OpenAI, Google Cloud, Supabase, Cloudflare R2, PostHog, Sentry, RevenueCat), that form needs to match. Can't be done from this environment.
