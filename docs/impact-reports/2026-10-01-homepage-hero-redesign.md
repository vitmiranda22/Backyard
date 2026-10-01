# Impact report: Homepage hero redesign + section rhythm

**Date:** 2026-10-01
**Status:** Implemented and verified.

## What this is

After looking at a competitor's site (Narrando) side by side with Backyard's
own homepage, four concrete gaps stood out: no product screenshot visible
until far down the page, no visual separation between sections (one flat
scroll), and the App Store link already being correct turned out to be a
non-issue on closer inspection. This addresses the two real gaps.

## What this commit actually touches

- `marketing/site/index.html` — hero section restructured into a two-column
  grid (`hero-text` + `hero-visual`), the latter showing the real
  `01_home.png` marketing screenshot so the product is visible without
  scrolling.
- `marketing/site/css/style.css` — new `.hero-grid` layout (stacks on
  mobile, ≤760px), and alternating section backgrounds: `#moods` gets the
  lighter parchment-surface tone, `#features` becomes a dark field-green
  band with inverted (white) icons and light text, `#screenshots` returns
  to parchment-surface. No other pages touched.
- Nothing structural changed: same copy, same CTA destination (already
  correctly linked to the App Store, verified before assuming it needed
  fixing), same nav, same footer.

## Real risk this carries

- **Icon contrast on the dark section** was the one real risk, the feature
  icons are black line art on transparent backgrounds, which would have
  been invisible on the new dark green `#features` background. Caught
  before shipping by actually opening one of the icon files, fixed with a
  CSS `invert()` filter scoped to that section only.
- Low risk otherwise: no copy changes, no broken links, same assets
  reused (no new images need hosting).

## Verification checklist

- [x] Rendered full-page screenshot before and after for direct comparison
- [x] Confirmed the dark-section icon contrast fix actually works (verified visually, not assumed)
- [x] Confirmed the apparent font-rendering issue in an early screenshot was a headless-Chrome timing fluke (web font hadn't loaded yet), not a real regression, by re-rendering with extra load time
- [ ] Manual check on a real phone-width screen, the `@media (max-width: 760px)` stacking behavior is written but not yet visually confirmed at that breakpoint
