# Launch checklist

One place to see what's actually done vs. still open before Backyard goes live. Updated as of this security/testing/admin-dashboard pass — re-check dates and quotas before relying on this if it's been a while.

## Store submission

- [x] Android production build (`.aab`) built and ready — sitting in EAS, not yet uploaded to Play Console
- [ ] Submit Android build to Play Console (your call on timing)
- [ ] iOS production build — blocked on the EAS free-tier monthly build quota, resets **Aug 1, 2026**
- [x] Store listing copy finalized (`docs/store_listing.md`): name, subtitle, full description, keywords, category, privacy/support URLs
- [ ] Screenshots — not yet captured; needs a real device/simulator with a build installed, can't be done from this environment
- [ ] Play Console identity verification (Google's own process, multi-day) — blocked, parked

## RevenueCat / payments

- [x] iOS entitlements live (Backyard Pro, monthly/annual App Store subscriptions)
- [ ] Android entitlements — blocked on Play Console verification above (`REVENUECAT_ANDROID_API_KEY` still blank)
- [x] Webhook (`/api/webhooks/revenuecat`) verified with a constant-time secret comparison
- [x] Revenue visible in the admin dashboard (`/admin`) via RevenueCat's Metrics API — currently $0, no real customers yet

## Legal / compliance

- [x] Privacy policy (`/privacy`) — real, app-specific, now discloses every third party that touches user data: OpenAI, Google Cloud (TTS + Street View), Supabase, Cloudflare R2, PostHog, Sentry, RevenueCat
- [x] Terms of Service (`/terms`) — covers AI-generated content disclaimers, published-route content rules, premium billing, acceptable use
- [x] Support/privacy contact addresses live (`support@backyard.app`, `privacy@backyard.app`)

## Security

Full audit completed and remediated this cycle — see git log for the complete trail. Summary:
- [x] RLS hardening: users can no longer self-grant premium or rewrite tour stats via a direct PostgREST call with their own JWT (the mobile app ships the anon key client-side, so this was a real, independently-reachable attack surface, not just defense-in-depth)
- [x] Private tours' ratings/comments/likes/shares no longer world-readable regardless of the `is_public` flag
- [x] Application-layer authorization added to comments/likes endpoints (ownership/visibility check, mirroring tour-detail's existing pattern)
- [x] Rate limiting added to `start-tour`, `post_comment`, `toggle_like`, `rate_tour` (previously uncapped)
- [x] Upload size/content-type validation on `ask-question`'s audio upload
- [x] `DEV_SKIP_LOGIN` gated behind `__DEV__` — can never ship live-enabled in a release build
- [x] Dependency hygiene: `npm audit fix` cleared all high/critical mobile vulnerabilities; unused `python-jose` + debug script removed

## Monitoring & ops

- [x] Admin dashboard live at `/admin` — users, tours, engagement, top places, revenue, storage, costs, cache-table sizes, all gated behind a constant-time-compared secret key
- [x] Sentry crash reporting wired in (backend + mobile)
- [x] PostHog product analytics wired in (mobile)
- [x] Daily cache-cleanup cron (`cleanup-cache.yml`) prunes expired `narration_cache`/`zone_data_cache`/`audio_files` rows and their R2 objects
- [x] Keep-alive cron (`keep-alive.yml`) mitigates Render free-tier cold starts — not eliminated, real fix is a paid tier

## Test coverage

- [x] Backend: 72 tests — every security fix above, the admin dashboard, cache cleanup, the RevenueCat webhook, the full tour lifecycle (save/end/publish), and `narrate-block` itself (rate limiting, premium gating, both cache layers, tour continuity, the IDOR guard, TTS failure fallback)
- [x] Mobile: 130 tests across all 14 screens plus the core service layer (`api.ts`, `auth.ts`, `location.ts`) — found and fixed 3 real bugs along the way (a timer leak in `snapToRoad`, a React/react-native-renderer version mismatch, and a stale-closure bug in `ActiveTourScreen` that dropped the tour ID on GPS-triggered auto-completion)

## Known gaps, not blocking but worth knowing about

- **Discover tab has no real content yet** — only test/dev tours from a single city (San Francisco). An empty-feeling Discover tab is a bad first impression for real users; worth seeding a handful of real, diverse tours across a few cities before actively promoting the app. Not a bug, a content task.
- **OpenAI and Google Cloud costs aren't tracked** in the admin dashboard's Costs section — both need separate, more-sensitive billing-scoped credentials (an OpenAI Admin key, a Google Cloud billing-viewer service account) that aren't set up yet. R2 storage cost is real and tracked; these two (the actual biggest variable costs) are explicitly marked "not tracked" rather than estimated.
- **Screen-level UI polish/QA on a real device** hasn't happened in this environment — everything here is automated test coverage + manual API-level verification, not a hands-on walkthrough on a phone.
