# Launch checklist

One place to see what's actually done vs. still open before Backyard goes live. Updated as of the auth redesign / age-gate pass — re-check dates and quotas before relying on this if it's been a while.

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
- [x] 7 of the 9 real test tours are published to Discover (Lisbon, Buenos Aires, Marrakech, Reykjavik, Hanoi, Accra, Wellington) — real content across 7 cities instead of SF-only test data. Kyoto and Québec City were deliberately left private: Kyoto still contains the actual language-leak/hallucination bugs found during that test (fixed in `prompts.py` since, but not regenerated for this specific tour), and Québec is incomplete (1 of 3 blocks, hit the daily quota mid-generation).

## Monitoring & ops

- [x] Admin dashboard live at `/admin` (users, tours, engagement, revenue, storage, costs, cache sizes), gated behind a constant-time-compared secret
- [x] Sentry crash reporting + PostHog analytics wired in
- [x] Daily cache-cleanup cron, keep-alive cron for Render's free-tier cold starts

## Test coverage

- [x] Backend: 101 tests — all of the above plus the age-gate's date-boundary math, signup persistence paths, mode-aware zone-data prioritization, and settings' date-of-birth validation
- [x] Mobile: 143 tests across all screens (now including `SignupScreen` and `ProfileScreen`'s DOB card) plus the service layer

## Known gaps, not blocking but worth knowing about

- **OpenAI and Google Cloud costs still aren't tracked** in the admin dashboard's Costs section — both need separate, more-sensitive billing-scoped credentials that aren't set up. R2 storage cost is real and tracked.
- **Screen-level UI polish/QA on a real device** hasn't happened in this environment — everything here is automated test coverage + manual API-level verification, not a hands-on walkthrough on a phone.
- **Forgot-password flow doesn't exist** — not part of the recent auth redesign scope, worth adding alongside the ProfileScreen DOB field above.
