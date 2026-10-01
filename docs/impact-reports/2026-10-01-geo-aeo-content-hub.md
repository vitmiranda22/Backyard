# Impact report: GEO/AEO content hub pages

**Date:** 2026-10-01
**Status:** Implemented and verified.

## What this is

Following the GEO/AEO plan (Generative Engine Optimization / Answer Engine
Optimization — making Backyard the thing ChatGPT, Perplexity, and Google AI
Overviews actually cite), this adds genuinely useful, standalone content
pages to the marketing site, not more product-pitch pages. The site's
technical foundation (llms.txt, JSON-LD, FAQPage schema, compare.html) was
already built earlier this session and is not being redone here.

## What this commit actually touches

- Two new static HTML pages under `marketing/site/`, matching the existing
  page conventions exactly (same `<head>` meta/OG/Twitter block pattern,
  same `css/style.css`, same header/footer nav partial used by every other
  page on the site).
- `marketing/site/sitemap.xml` — two new `<url>` entries.
- `marketing/site/llms.txt` — two new lines under `## Pages`, so the
  AI-facing summary file stays in sync with what's actually on the site.
- No backend changes, no mobile app changes, no existing page is modified
  beyond adding nav links if needed.

## The two pages

1. **`times-square-vj-day-kiss-history.html`** — the real history behind
   the V-J Day kiss photo location, directly tied to the already-produced
   "Corner Takes" Reel (post 1). Uses `Article` schema. This is a genuine
   answer to a real, searched question ("where was the V-J Day kiss
   photo taken"), with a natural, honest mention of Backyard at the end,
   not an ad with history bolted on.
2. **`what-is-a-self-guided-walking-tour.html`** — a broader explainer
   page targeting "what is a self-guided walking tour" / "how do
   self-guided tour apps work" queries, genuinely explaining the format
   (not just Backyard's version of it) before describing where Backyard
   fits. Uses `Article` schema + a short `FAQPage` block for 3-4 real
   sub-questions.

## Real risk this carries

- **Content quality is the actual risk, not code risk.** A thin,
  keyword-stuffed page would actively hurt GEO goals (these systems
  penalize content that reads as manipulative). Both pages are written as
  real, standalone answers first, product mention second.
- **No existing traffic or rankings to break** — these are net-new pages,
  nothing currently depends on these URLs not existing.
- Historical facts in the Times Square page are the same ones already
  verified earlier this session (Eisenstaedt's photo, Times Square,
  August 14 1945) when building the Reel content, not new unverified
  claims.

## Verification checklist

- [x] Both pages render correctly, same visual style as the rest of the site (verified via screenshot)
- [x] JSON-LD validates (3 blocks total across both pages, all parse as valid JSON)
- [x] HTML parses cleanly (Python's html.parser, no malformed tags)
- [x] sitemap.xml and llms.txt both updated and consistent with the live pages
- [x] Footer nav on all 8 site pages now includes a "Guides" link; the two guide pages cross-link each other and link back to compare.html and the App Store
- [x] Historical facts fact-checked against real sources: George Mendonsa/Greta Zimmer Friedman identification, her actual profession (dental assistant, commonly misattributed as a nurse due to the white uniform), and the Morosco Theatre's 1982 demolition for the Marriott Marquis, all confirmed via web search before publishing
