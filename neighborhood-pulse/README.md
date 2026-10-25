# Neighborhood Pulse

A full-screen satellite map of Chicago's 77 community areas, colored by whether
each one looks like it's **improving (green)**, **declining (red)**, or
**neutral / unknown (light gray)**. It's built to help spot real-estate opportunities.

> **Status: Phase 1.** The map, side filter, hover names, and sidebar all work,
> but the scores, headlines, and permit numbers are **fake sample data**.

---

## Run it on your computer

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
cd neighborhood-pulse
npm install        # downloads the libraries (one time)
npm run dev        # starts a local server
```

Open the URL it prints (usually http://localhost:5173).

### What to test in Phase 1
1. You see a satellite map of Chicago with colored zones and thin white outlines.
2. Hover over a zone: it brightens and a small label shows its name.
3. Click a zone: a sidebar opens on the left with its name, side, score, summary,
   headlines, permit trend, and last-updated date. Click ✕ or an empty area to close it.
4. Use the **Side** dropdown: only that side's areas stay visible and the map zooms to them.
5. Toggle **Street labels** on and off.
6. Try it on your phone or in a narrow browser window.

---

## How the code is organized

```
neighborhood-pulse/
  public/data/community-areas.geojson  ← the 77 boundary shapes (from the Chicago Data Portal)
  scripts/fetch-boundaries.mjs         ← re-downloads those shapes: npm run fetch-boundaries
  src/
    App.tsx                  ← loads the shapes, attaches scores and colors, wires everything up
    components/MapView.tsx   ← the satellite map, colored zones, hover and click
    components/Sidebar.tsx   ← the left panel with details
    components/Controls.tsx  ← title, side filter, labels toggle, legend
    data/communityAreas.ts   ← official names and which "side" each area belongs to
    data/sampleScores.ts     ← FAKE data for Phase 1 (replaced in Phase 2/3)
    lib/colors.ts            ← converts a score into green / red / gray plus color strength
```

**Color rules** (`src/lib/colors.ts`): a score of +15 or higher is green and −15 or lower is red.
Anything in between is gray, and **low confidence is always gray**. The further the score
is from 0, the stronger the color.

---

## Deploy to Vercel

This app lives in the `neighborhood-pulse/` folder of the repo, so tell Vercel to build only that folder:

1. Go to vercel.com → **Add New → Project** → import the GitHub repo.
2. Set **Root Directory** to `neighborhood-pulse`. Vercel then detects Vite automatically.
3. Click **Deploy**. Phase 1 needs no environment variables.

---

## API keys: what you need, where to get them, and what they cost

**Rule:** keys go in **environment variables**, never in the code.
- **On your computer:** copy `.env.example` to `.env.local` and fill it in. `.env.local` is git-ignored.
- **On Vercel:** go to Project → **Settings → Environment Variables**.
- Any variable starting with `VITE_` is **visible in the browser**. Only use that prefix
  for values that are safe to make public.

| Phase | Service | Env var(s) | Where to get it | Rough cost / month |
|---|---|---|---|---|
| 1 | **Esri World Imagery** (satellite) via MapLibre | none | No signup needed | **$0** |
| 2 | **Supabase** (database) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (secret, server only), `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (public) | supabase.com → New project → Project Settings → API | **$0** free tier (500 MB). Pro is $25 if you outgrow it |
| 2 | **Chicago Data Portal** (permits) | `CHICAGO_APP_TOKEN` (optional) | data.cityofchicago.org → sign up → Developer Settings → Create App Token | **$0** |
| 2 | **Cron secret** (stops strangers from triggering your job) | `CRON_SECRET` | Make up a long random string | **$0** |
| 2 | **Vercel** hosting + Cron | none | vercel.com | **$0** on Hobby (cron jobs allowed once per day; we need weekly). Pro is $20 if you need longer function run times or commercial use |
| 3 | **GDELT** (news) | none | Free public API | **$0** |
| 3 | **Anthropic Claude API** (scoring) | `ANTHROPIC_API_KEY` (secret, server only) | console.anthropic.com → API Keys (add a payment method) | About **$15** with Claude Opus 5.5 for 77 areas × 4 runs. About **$0.50** with Claude Haiku 5.5. You choose in Phase 3 |
| 3 | NewsAPI (optional) | `NEWSAPI_KEY` | newsapi.org | Free plan only works on localhost, and paid plans are expensive, so **GDELT is recommended** |

**Phase 1 total: $0. Expected ongoing cost: about $0–$15/month**, depending on which Claude model you pick.

Notes:
- **Satellite imagery:** Esri's free tiles are fine for personal use and testing. If you turn
  this into a commercial product, create a free ArcGIS Location Platform account, which includes
  a generous free tile allowance, or switch to Mapbox satellite (free up to 50k map loads/month).
  Either switch only changes the tile URL in `MapView.tsx`.
- **Supabase free projects pause after about a week of inactivity.** The weekly job should keep yours awake;
  if it pauses, click "Restore" in the Supabase dashboard.
- Prices are approximate. Check each provider's pricing page before relying on these numbers.

---

## Roadmap
- [x] **Phase 1:** map, satellite view, community areas, sides filter, hover names, sidebar (sample data)
- [ ] **Phase 2:** Supabase database + weekly Vercel Cron job using permit data only
- [ ] **Phase 3:** news (GDELT) + Claude scoring (score −100…+100, confidence, summary)
- [ ] **Phase 4:** score history per neighborhood and trend direction
- [ ] **Phase 5:** suburbs (Cook and DuPage towns like Elmhurst), then other Illinois cities
