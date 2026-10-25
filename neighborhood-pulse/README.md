# Neighborhood Pulse

A full-screen satellite map of Chicago's 77 community areas, colored by whether each one
looks like it's **improving (green)**, **declining (red)**, or **neutral / unknown (light gray)**,
built to help spot real-estate opportunities.

**Status: Phase 2.** A weekly job collects real public data (permits, home values, crime,
vacant buildings, and new businesses), scores every area, and saves the results.
Until you finish the setup below, the map shows **sample data** with a yellow
"Sample data" label in the top-left corner.

---

## What's on the map

- **Color by:** switch between the overall signal, opportunity score, home-value growth,
  typical home value, permit growth, and crime trend.
- **🔥 Top 3 opportunities:** affordable areas with momentum and new construction. Filter by
  budget and by side of the city, and click a pick to zoom to it.
- **Click an area** to open a sidebar with tabs:
  - **Overview:** score, summary, what's driving the score, and opportunity score
  - **Prices:** typical home value, 1-month, 1-year and 5-year change, and a 5-year chart
  - **Activity:** building permits (new builds, renovations, demolitions, dollar value) and new business licenses
  - **Safety:** reported crime, violent crime, and vacant-building complaints
  - **News:** arrives in Phase 3
- **Hover** over an area to highlight its outline and see its name.

### How the score works (`shared/scoring.ts`)
Every number is compared to **the whole city**. If crime fell 10% everywhere, an area where
it fell 10% is just average. Only doing better or worse than Chicago overall moves the score.

| Ingredient | Weight | Good when… |
|---|---|---|
| Home values, 1 year | 30% | rising faster than the city |
| Building permits | 25% | rising faster than the city |
| New business licenses | 15% | rising faster than the city |
| Reported crime | 15% | falling faster than the city |
| Vacant-building complaints (311) | 15% | falling faster than the city |

**Confidence** depends on how many ingredients had enough data. Low confidence is always shown gray.

**Opportunity score** (Top Picks) = 40% momentum (the score above) + 35% affordability
(cheaper than other areas) + 25% pipeline (new-construction permits and growth in permit
dollars). Use it as a starting point for research, not a forecast.

### Where the data comes from (all free)
| Data | Source | Updates |
|---|---|---|
| Building permits | [Chicago Data Portal: Building Permits](https://data.cityofchicago.org/d/ydr8-5enu) | daily |
| Crime | [Chicago Data Portal: Crimes](https://data.cityofchicago.org/d/ijzp-q8t2) | daily (about 7 days behind) |
| Vacant-building complaints | [Chicago Data Portal: 311 Service Requests](https://data.cityofchicago.org/d/v6vf-nfxy) | daily |
| New businesses | [Chicago Data Portal: Business Licenses](https://data.cityofchicago.org/d/r5kz-chrr) | daily |
| Home values | [Zillow Home Value Index by neighborhood](https://www.zillow.com/research/data/) | monthly |

Zillow's neighborhoods don't match the 77 community areas exactly. When an area has no
Zillow neighborhood with the same name, we average the smaller Zillow neighborhoods
inside it, for example Wicker Park + Ukrainian Village → West Town. The Prices tab shows which
ones were used. A few areas may have no home-value data.

---

## Setup (about 15 minutes, one time)

### 1. Create the database (Supabase, free)
1. Go to **supabase.com**, sign up, and click **New project**. Name it `neighborhood-pulse`,
   create a database password (save it somewhere), and pick the US East region.
2. When the project is ready, open **SQL Editor** in the left menu, then **New query**.
3. Open the file `supabase/schema.sql` from this folder, copy all of it, paste it into the query box, and click **Run**.
   It should say "Success. No rows returned".
4. Go to **Project Settings → API Keys** and copy the **service_role** secret key.
   Then go to **Project Settings → Data API** (or the Connect button) and copy the **Project URL**,
   which looks like `https://abcd1234.supabase.co`.

### 2. Add the keys to Vercel
In Vercel, open your **neighborhood-pulse** project, go to **Settings → Environment Variables**, and add:

| Name | Value |
|---|---|
| `SUPABASE_URL` | the Project URL from step 1 |
| `SUPABASE_SERVICE_ROLE_KEY` | the service_role key from step 1 (**secret**) |
| `CRON_SECRET` | make up a long random password, e.g. `pulse-8f3k29dk3m2x` |
| `CHICAGO_APP_TOKEN` | *(optional)* from data.cityofchicago.org → Developer Settings |

Then go to **Deployments**, click **⋯** on the newest one, and choose **Redeploy** so it picks up the keys.

### 3. Test the data collection (saves nothing)
Open this in your browser, using your own site address and CRON_SECRET:
```
https://YOUR-SITE.vercel.app/api/collect?key=YOUR_CRON_SECRET&dry=1
```
It takes 1–3 minutes, then shows ✅/❌ for each data source and a preview of the scores.
If anything says `"ok": false`, copy the page and send it to Claude.

### 4. Run it for real
Open the same link **without** `&dry=1`. This collects the data and saves it.
Then reload your map. The yellow "Sample data" label is replaced by "updated <date>".

From then on, **Vercel runs it automatically every Monday morning** (see `crons` in `vercel.json`).
Each run is saved as a new snapshot, which builds up the history for Phase 4's trend charts.

---

## Run it on your computer

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
cd neighborhood-pulse
npm install        # one time
npm run dev        # the map, using sample data, at http://localhost:5173
npm run collect    # test all data sources from your computer (saves nothing)
```

---

## How the code is organized

```
neighborhood-pulse/
  api/                       ← server code (Vercel Functions)
    collect.ts               ← the weekly job: collect → score → save
    areas.ts                 ← what the map loads: the latest scores
    _lib/socrata.ts          ← Chicago Data Portal helper
    _lib/sources.ts          ← permits, crime, 311, business licenses
    _lib/zillow.ts           ← home values and the name-matching table
    _lib/geo.ts              ← "which community area is this point in?"
    _lib/db.ts               ← Supabase reads and writes
  shared/                    ← used by both the server and the website
    scoring.ts               ← the score, confidence, summary, and opportunity math
    communityAreas.ts        ← names and "sides" of the 77 areas
    types.ts, format.ts
  src/                       ← the website
    App.tsx                  ← loads everything and wires it together
    components/              ← MapView, Sidebar (tabs), TopPicks, Controls, Charts
    lib/colors.ts            ← the "Color by" modes
    data/sampleData.ts       ← fake data, used until real data exists
  supabase/schema.sql        ← database tables (run once in Supabase)
  public/data/               ← the 77 boundary shapes
```

---

## API keys & costs

**Rule:** keys go in **environment variables**, never in the code. Never put a secret in a variable whose name starts with `VITE_`, because those are visible in the browser.

| Phase | Service | Env var(s) | Where to get it | Rough cost / month |
|---|---|---|---|---|
| 1 | Esri World Imagery (satellite) | none | — | $0 |
| 2 | Supabase | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | supabase.com | $0 (free tier) |
| 2 | Weekly job password | `CRON_SECRET` | make one up | $0 |
| 2 | Chicago Data Portal | `CHICAGO_APP_TOKEN` (optional) | data.cityofchicago.org | $0 |
| 2 | Zillow research data | none | — | $0 |
| 2 | Vercel Hobby + Cron | none | vercel.com | $0 |
| 3 | GDELT news | none | — | $0 |
| 3 | Anthropic Claude API | `ANTHROPIC_API_KEY` | console.anthropic.com | ~$0.50–$15 depending on model |

Notes:
- Supabase free projects pause after about a week with no activity. The weekly job should keep yours awake; if it pauses, click **Restore** in Supabase.
- Esri's free satellite tiles are fine for personal use. For a commercial product, get a free ArcGIS Location Platform account or switch to Mapbox.
- Zillow's data is free with credit ("Data: Zillow", shown in the Prices tab).

---

## Roadmap
- [x] **Phase 1:** satellite map, community areas, sides filter, hover names, sidebar
- [x] **Phase 2:** database + weekly job: permits, home values, crime, vacant buildings,
      new businesses → score, confidence, summary, Top Picks, Color by
- [ ] **Phase 3:** news (GDELT) + Claude scoring and summaries; zoning changes, TIF / Invest
      South/West, and big-project proximity added to the pipeline score
- [ ] **Phase 4:** history charts and "trending up or down", mortgage (HMDA) and rent data, Census "People" tab
- [ ] **Phase 5:** suburbs (Cook and DuPage towns like Elmhurst), then other Illinois cities
