// Point-in-polygon lookup: which community area is this latitude/longitude in?
// Used when a dataset doesn't already say which community area a record belongs to.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type Ring = number[][]
interface Area {
  areaNumber: number
  polygons: Ring[][] // [polygon][ring][point]
  bbox: [number, number, number, number]
}

let cache: Area[] | null = null

function load(): Area[] {
  if (cache) return cache
  const file = join(process.cwd(), 'public', 'data', 'community-areas.geojson')
  const geo = JSON.parse(readFileSync(file, 'utf8'))
  cache = geo.features.map((f: { properties: { area_numbe: string }; geometry: { type: string; coordinates: unknown } }) => {
    const polygons = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates) as Ring[][]
    const bbox: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity]
    for (const poly of polygons)
      for (const [x, y] of poly[0]) {
        bbox[0] = Math.min(bbox[0], x)
        bbox[1] = Math.min(bbox[1], y)
        bbox[2] = Math.max(bbox[2], x)
        bbox[3] = Math.max(bbox[3], y)
      }
    return { areaNumber: Number(f.properties.area_numbe), polygons, bbox }
  })
  return cache!
}

function inRing(x: number, y: number, ring: Ring): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export function areaForPoint(lon: number, lat: number): number | null {
  if (!isFinite(lon) || !isFinite(lat)) return null
  for (const a of load()) {
    if (lon < a.bbox[0] || lon > a.bbox[2] || lat < a.bbox[1] || lat > a.bbox[3]) continue
    for (const poly of a.polygons) {
      if (inRing(lon, lat, poly[0]) && !poly.slice(1).some((hole) => inRing(lon, lat, hole))) return a.areaNumber
    }
  }
  return null
}
