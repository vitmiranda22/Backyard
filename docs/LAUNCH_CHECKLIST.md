# Launch checklist

One place to see what's actually done vs. still open before Backyard goes live. Updated as of the Bosco mascot rollout + bug-fix pass (2026-07-23) — re-check dates and quotas before relying on this if it's been a while.

## Store submission

- [x] EAS Build upgraded to a paid plan (Starter) — no longer blocked on the free-tier monthly quota; iOS preview build (ad-hoc) and OTA updates both shipping normally
- [ ] Android production build (`.aab`) — the one previously sitting in EAS predates the location-permission fix and the Bosco/bug-fix work; needs a fresh `eas build --profile production --platform android` before it's usable
- [ ] Play Console developer account — registered (personal account "Vlai"), identity verification submitted and pending (Google's own process, a few days), Android-device-access check and phone verification still open (see below)
- [ ] **New Google Play policy** (Nov 2023+, applies to all new personal accounts): before production access is granted at all, the app must run a closed test with **12 testers opted in continuously for 14 days**. This is the real long pole, longer than identity verification — start recruiting testers as soon as the account is verified, don't wait until the build is ready.
- [ ] Submit Android build to Play Console (blocked on the above)
- [x] Store listing copy finalized (`docs/store_listing.md`): name, subtitle, full description, keywords, category, privacy/support URLs
- [ ] Screenshots — not yet captured; needs a real device with a build installed. You now have both an installable iOS build and (once rebuilt) an Android APK, so this is unblocked whenever you have a few minutes with the phone.
- [ ] Play Data Safety form (Android) / Privacy Nutrition Label (iOS) — manual store-console forms, must match the privacy policy's real third-party disclosures

## Auth & onboarding

- [x] Real Create Account screen (method picker → email details form), split out of the login screen
- [x] Signup collects full name, date of birth, and requires explicit Privacy Policy/Terms acceptance before submitting
- [x] Server-side age-gate: `is_user_underage()` fails closed on unknown DOB, forces mature "content off" narration to PG for anyone under 18 regardless of what the client requests
- [x] Existing accounts (created before migration `017_signup_dob_privacy.sql`) can now add a date of birth from `ProfileScreen` — `PATCH /user/settings` accepts and validates it server-side, unlocking the mature content toggle once set.
- [ ] Google/Apple sign-in — buttons are shipped and visible (disabled, "coming soon") but not functional. Needs: OAuth credentials set up in Supabase Auth + Google Cloud Console + Apple Developer Portal (your side), plus native modules that require a new EAS Build. Deliberately scoped out of the Bosco/bug-fix pass — real follow-up work, not a placeholder gap anymore.
- [x] Mascot ("Bosco", a tree character) shipped across 8 host-layer screens — Login, Signup, Safety popup, Onboarding, Tours/Discover empty states, Tour Complete, Badge Gallery, ErrorBoundary — each with its own generated pose, plus a bold "Backyard" wordmark treatment replacing the old plain-text label. Paywall's pose is the one screen still unbuilt.
- [ ] App icon / splash / adaptive-icon — real Bosco art is committed (`app.json` already points at it) but this is native-build-only, so it hasn't shipped to any real install yet. Will land automatically on the next production build (iOS or Android) for that platform. Android's adaptive-icon specifically still needs a transparent-background cutout of the art first — the current file has an opaque forest background that would look broken in the circular mask.

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
- [x] Pre-walk safety reminder: a bottom-sheet popup (crosswalks, looking both ways, traffic awareness, screen-down caution) shows every time a tour starts, dismissible only via an explicit "Got it" tap. Purely a UI overlay — doesn't gate or delay the actual start-tour/narration calls running underneath, so it also gives the first block's generation wait something useful to look at instead of a bare spinner.

## Monitoring & ops

- [x] Admin dashboard live at `/admin` (users, tours, engagement, revenue, storage, costs, cache sizes), gated behind a constant-time-compared secret
- [x] Sentry crash reporting + PostHog analytics wired in
- [x] Daily cache-cleanup cron, keep-alive cron for Render's free-tier cold starts

## Test coverage

- [x] Backend: 129 tests — all of the above plus the age-gate's date-boundary math, signup persistence paths, mode-aware zone-data prioritization, settings' date-of-birth validation, `pick_suggested_next()`, the content-report endpoints' authorization, and `fetch_openai_costs()`
- [x] Mobile: 171 tests across all screens (now including `SignupScreen` (DOB + the 13-year minimum), `ProfileScreen`'s DOB card and subscription-deletion warning, the suggested-waypoint marker, `ErrorBoundary`, reporting a tour/comment, forgot/reset password, the request-timeout path, and the pre-walk `SafetyModal`) plus the service layer

## Gaps found and fixed in this pass

- [x] **Discover was mostly dev/QA junk, not curated content.** Of 38 published tours, only 8 were the real curated city tours — the other 30 were internal test runs (titles like "Wrong script", "Wrong introduction", "Photo feature test", 0-block "Time Machine: Tour" entries, repeated SF Richmond District/Polk Gulch dev-loop runs). Deleted all 30 — none had ratings/likes/comments, so nothing of real value was lost. Deleting a `tours` row only cascades to its `tour_blocks` (the per-tour playback record); it does **not** touch `narration_cache`/`zone_data_cache` (geohash+mood+voice-keyed, shared across tours) or the underlying R2 audio/image files, so all of that stays live as reusable cache. Discover now shows exactly the 8 curated tours.
- [x] **iOS location permission string was missing entirely.** `app.json` had no `NSLocationWhenInUseUsageDescription` and `expo-location` wasn't listed in `plugins`, even though `src/services/location.ts` actively calls `requestForegroundPermissionsAsync`/`watchPositionAsync` — core to how the app works. Fixed (both the plugin entry and an explicit `infoPlist` string). **This is a native config change — it only takes effect on the next EAS Build, not an OTA update.** The Android `.aab` currently sitting in EAS (see Store submission above) predates this fix and needs a rebuild before it's uploaded to Play Console.
- [x] **No top-level error boundary.** Added `src/components/ErrorBoundary.tsx`, wrapping `App.tsx` — an uncaught render error now shows a "something went wrong, restart" screen and reports to Sentry instead of white-screening with no recovery. JS-only, already shipped via EAS Update.
- [x] **Account deletion didn't warn about active subscriptions.** Deleting the account cascades every DB row, but neither Apple nor Google let a third party cancel a platform subscription via API — a premium user who deleted their account would keep being billed. The deletion confirmation now tells premium users to cancel via the App Store/Play Store first (`profile.deleteAccountBodyPremium`, free users still see the plain version). JS-only, already shipped via EAS Update.
- [x] **No minimum age to create an account — a real COPPA gap.** Once signup reads and stores date of birth, the app has "actual knowledge" of a stated age; nothing stopped someone from entering a DOB implying they're 5 years old and getting a full account (name + email) created. Now enforced at three layers: `SignupScreen` blocks submission client-side with a friendly message; migration `018_min_signup_age.sql`'s `handle_new_user()` trigger is the real, unbypassable enforcement (raising inside the `AFTER INSERT` trigger rolls back the whole signup, including the `auth.users` row Supabase Auth just created); `terms.html`/`privacy.html` now state the 13-year minimum and add a Children's Privacy section. Migration already run.
- [x] **No content-moderation reporting existed.** The `content_reports` table (with RLS policies) has existed since `001_initial_schema.sql`, but nothing ever used it — no endpoint, no UI, despite Discover being a public feed with comments and literal "unfiltered" mature-content modes. Added `POST /tours/{tour_id}/report` and `POST /tours/{tour_id}/comments/{comment_id}/report` (idempotent per reporter+target, reason enum: inaccurate/offensive/spam/other, optional detail), plus a "Report" link on both the route detail header and each comment in the mobile app. Reports land in `content_reports` with `status: pending` — there's no admin review UI for them yet (worth a follow-up, but out of scope for closing the "no way to report at all" gap). JS-only mobile changes shipped via EAS Update; the backend change deploys via the normal Render auto-deploy on push.
- [x] **No client-side request timeout.** `mobile/src/services/api.ts`'s `authFetch`/`askQuestion` had no `AbortController`, so a hung backend request just spun forever with no feedback. Added a 45s timeout (generous enough to cover a real cache-miss narration's LLM+TTS generation time) with a friendly "that took too long" error on abort. JS-only, shipped via EAS Update.
- [x] **Forgot-password flow didn't exist.** Added `ForgotPasswordScreen` (email → "check your email" confirmation, deliberately doesn't reveal whether the address has an account) and `ResetPasswordScreen` (reachable only via the `backyard://reset-password` deep link App.tsx now parses, which exchanges the link's tokens for a temporary Supabase recovery session). **One-time Supabase dashboard step needed**: add `backyard://reset-password` to Auth → URL Configuration → Redirect URLs, or Supabase will reject the redirect and the email link will fail. Not code — has to be done in the Supabase dashboard.
- [x] **OpenAI costs weren't tracked in the admin dashboard.** Added a real `GET /v1/organization/costs` call (`costs.fetch_openai_costs()`, last 30 days), gated behind a new `OPENAI_ADMIN_API_KEY` env var — shows "not configured" until it's set. **Needs you to create that key**: platform.openai.com → Organization → API keys → "Create admin key" (an Admin key with `usage.read` scope, separate from the regular `OPENAI_API_KEY` used for narration) → set it in Render's environment variables. Google Cloud costs are still untracked and intentionally left that way — unlike OpenAI, there's no single credential that unlocks it; the Cloud Billing API only returns real cost data once BigQuery billing export is enabled on the GCP billing account, a console setup step beyond just an API key, so it's still listed under "Not tracked" in the dashboard rather than half-implemented.

## Known gaps, not blocking but worth knowing about

- **Screen-level UI polish/QA on a real device** hasn't happened in this environment — everything here is automated test coverage + manual API-level verification, not a hands-on walkthrough on a phone.
- **App Store "Privacy Nutrition Label" / Play Data Safety form** — a manual, one-time form in App Store Connect / Play Console (not code); now that the privacy policy discloses real third-party data sharing (OpenAI, Google Cloud, Supabase, Cloudflare R2, PostHog, Sentry, RevenueCat), that form needs to match. Can't be done from this environment.
