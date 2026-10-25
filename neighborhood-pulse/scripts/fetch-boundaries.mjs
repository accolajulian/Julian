// Downloads the latest Chicago community area boundaries from the
// Chicago Data Portal and saves a trimmed copy into public/data/.
// Run with: npm run fetch-boundaries
import { writeFile } from 'node:fs/promises'

const URL = 'https://data.cityofchicago.org/resource/igwz-8jzy.geojson?$limit=100'
const OUT = new globalThis.URL('../public/data/community-areas.geojson', import.meta.url)

const round = (c) => (typeof c[0] === 'number' ? [+c[0].toFixed(5), +c[1].toFixed(5)] : c.map(round))

const res = await fetch(URL)
if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`)
const geo = await res.json()

for (const f of geo.features) {
  const p = f.properties
  f.properties = {
    area_numbe: String(p.area_numbe ?? p.area_num_1 ?? p.area_number),
    community: p.community,
  }
  f.geometry.coordinates = round(f.geometry.coordinates)
}

await writeFile(OUT, JSON.stringify(geo))
console.log(`Saved ${geo.features.length} community areas to public/data/community-areas.geojson`)
