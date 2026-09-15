# Backyard — Press Kit / Canonical Copy

This file is the single source of truth for all public-facing positioning copy.
The marketing site (`marketing/site/`), the press page, the backend's
`/privacy`, `/terms`, `/support` meta tags, and any outreach (Product Hunt,
Reddit, directory listings, cold emails) should all quote from here verbatim
rather than re-wording independently. Repeated, identical phrasing across
independent sources is what actually gets a product's facts picked up and
reinforced by both search crawlers and LLM-based answer engines.

Supersedes `docs/store_listing.md` (an older draft) for live positioning copy.
That file is kept as historical record only.

**Standing brand constraint:** never name the mascot "Bosco" in public-facing
copy. Refer to it as "your guide" or "a talking tree guide."

**No fabricated content:** never invent ratings, review counts, or
testimonials anywhere this copy is used. Omit those fields entirely until
real data exists.

## Naming

- **App name:** Backyard
- **App Store listing name:** Backyard Explorer (the same app; "Explorer" is
  the App Store Connect record name, not a separate product — don't mix the
  two up in copy that names the app directly, e.g. write "Backyard" for the
  app itself and "Backyard Explorer" only when specifically naming the App
  Store listing or the premium tier)
- **Premium tier name:** Backyard Explorer

## One-line boilerplate (~25 words)

> Backyard turns any walk into a story, narrating real, fact-checked history
> about the exact block you're standing on as you walk.

## Short boilerplate (~50-75 words)

> Backyard turns any walk into a story. Wherever you are, a talking tree
> guide narrates real, fact-checked history and hidden stories about the
> exact block you're standing on, triggered automatically as you walk. No
> planning, no searching, just walk and listen. Pick from five moods to hear
> the same streets told five different ways, from lighthearted local color
> to true crime and dark history.

## Long boilerplate (~150-200 words)

> Backyard turns any walk into a story.
>
> Wherever you are, a talking tree guide narrates real, fact-checked history
> and hidden stories about the exact block you're standing on, triggered
> automatically as you walk. No planning, no searching, just walk and listen.
>
> Same streets, completely different stories: pick from five moods before
> you start. Time Machine shows what a spot looked like decades ago. Hidden
> City surfaces secrets hiding in plain sight. Dark Side leans into unsolved
> mysteries and dark history. Behind the Scenes covers film locations and
> celebrity history. Unfiltered is raw, funny, and opinionated, like walking
> with a local friend.
>
> Every walk is saved to a journal: distance, duration, and the story behind
> every stop, so it can be relived anytime. Explorers can browse routes
> other people have shared, and share their own.
>
> An Exploration Log tracks tours completed, distance walked, cities
> visited, and badges earned for streaks and distance milestones.
>
> Backyard Explorer, the premium tier, unlocks the Dark Side, Behind the
> Scenes, and Unfiltered moods, Dramatic and Warm narration voices, a higher
> daily story limit, and the ability to ask questions anywhere on a walk.

## Promotional tagline (exact, 139 characters)

> Fact-checked stories about any street, anywhere in the world. Walk,
> listen, and discover routes shared by a growing community of explorers.

## Five moods

| Mood | One-line description |
|---|---|
| Time Machine | Get transported to what this spot looked like decades ago |
| Hidden City | Secrets hiding in plain sight that everyone walks past |
| Dark Side | Unsolved mysteries and dark history |
| Behind the Scenes | Film locations and celebrity secrets |
| Unfiltered | Raw, funny, and opinionated, like walking with a local friend |

## Key features

- **Automatic narration** — no need to keep the app open and staring at a
  screen; stories trigger as you approach each new spot, with real audio
  and a photo of what you're looking at.
- **A journal of every walk** — distance, duration, and the story behind
  every stop, saved and revisitable anytime.
- **Discover routes from other explorers** — browse and walk routes other
  people have published, or share your own.
- **An Exploration Log** — tours completed, distance walked, cities
  visited, and badges for streaks and distance milestones.
- **Backyard Explorer (premium)** — Dark Side, Behind the Scenes, and
  Unfiltered moods; Dramatic and Warm narration voices; a higher daily
  story limit; ask questions anywhere on a walk.

## Quick facts

| Field | Value |
|---|---|
| Category | Travel / Navigation |
| Platform | iOS (App Store link: **TODO** — add once the app is approved and has a public listing URL) |
| Pricing | Free, with an optional Backyard Explorer subscription (Monthly / Annual, via RevenueCat) |
| Bundle ID | `com.vitorsm9004.backyard` |
| Version | 1.0.1 (Build 15) |
| Copyright | © 2026 Vlai |

## Keywords (exact, 100 characters, App Store field)

> walking tour,audio guide,city guide,local history,travel app,self guided tour,city walks,hidden gems

## Contact

- Support: `support@backyard.app`
- Privacy: `privacy@backyard.app`
- Press: `support@backyard.app` (no separate press inbox yet)

## Asset manifest

All copied into `marketing/site/assets/` for the marketing site's own use:

| Asset | Original source | Copied to |
|---|---|---|
| Logo/wordmark | `mobile/assets/lOGOBACKYARD.png` | `marketing/site/assets/logo.png` |
| Mood icons | `mobile/assets/icons/{time_machine,hidden_city,dark_side,behind_scenes,unfiltered}.png` | `marketing/site/assets/icons/` |
| Journal icon | `mobile/assets/icons/journal.png` | `marketing/site/assets/icons/journal.png` |
| Premium icons | `mobile/assets/icons/{higher_limit,premium_voices,ask_question_paywall}.png` | `marketing/site/assets/icons/` |
| Screenshots (7, captioned, 1242×2688) | `Backyard Submission/App Store Screenshots/01_home.png` … `07_mood_picker.png` | `marketing/site/assets/screenshots/` |

Brand tokens (from `mobile/src/theme.ts`):

| Token | Value |
|---|---|
| `ink` | `#241D12` |
| `parchmentBg` | `#F4EFE1` |
| `parchmentSurface` | `#FBF7EA` |
| `fieldGreen` | `#3C4F35` |
| `fieldMuted` | `#96805F` |
| `fieldBorder` | `#E2D9C2` |
| accent (rust) | `#8C3D22` |

Fonts (exact weights loaded in `mobile/App.tsx`, all Google Fonts):
Caveat 500/600/700, Libre Baskerville 400/700/400-italic, Work Sans
400/500/600/700.
