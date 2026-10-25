// Monthly "typical home value" (Zillow Home Value Index, ZHVI) for Chicago neighborhoods.
// Free research data: https://www.zillow.com/research/data/  (please keep the "Data: Zillow" credit)
//
// Zillow's neighborhood names don't line up 1:1 with the city's 77 community areas, so we
//   1. use an exact name match when there is one (e.g. "Logan Square"), otherwise
//   2. average the smaller Zillow neighborhoods that sit inside the community area
//      (e.g. "Wicker Park" + "Ukrainian Village" → West Town).
import { COMMUNITY_AREAS } from '../../shared/communityAreas.js'
import { pctChange } from '../../shared/format.js'
import type { MonthlyPoint, PriceMetrics } from '../../shared/types.js'

export const ZILLOW_URL =
  'https://files.zillowstatic.com/research/public_csvs/zhvi/Neighborhood_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv'

/** Zillow neighborhood name → community area number (only names that differ from the official ones). */
export const ALIASES: Record<string, number> = {
  andersonville: 77, 'edgewater beach': 77, 'edgewater glen': 77,
  'west rogers park': 2, 'peterson park': 13, 'budlong woods': 4, ravenswood: 4, bowmanville: 4, 'ravenswood gardens': 4,
  'buena park': 3, 'sheridan park': 3, 'margate park': 3,
  sauganash: 12, edgebrook: 12, 'old edgebrook': 12, 'gladstone park': 11, mayfair: 14, 'north mayfair': 14, 'ravenswood manor': 14,
  'old irving park': 16, 'independence park': 16, 'schorsch village': 17, 'belmont heights': 17, 'kelvyn park': 20,
  'ohare': 76, 'o hare': 76,
  lakeview: 6, 'lakeview east': 6, wrigleyville: 6, boystown: 6, 'west lakeview': 6, 'roscoe village': 5,
  bucktown: 22, 'palmer square': 22, 'old town': 8, 'river north': 8, streeterville: 8, 'gold coast': 8, 'magnificent mile': 8,
  'cabrini green': 8, 'old town triangle': 7, 'sheffield neighbors': 7, depaul: 7, 'ranch triangle': 7, 'wrightwood neighbors': 7,
  'wicker park': 24, 'ukrainian village': 24, 'east village': 24, 'noble square': 24, 'river west': 24,
  'west loop': 28, 'west loop gate': 28, greektown: 28, 'university village': 28, 'little italy': 28, 'tri taylor': 28,
  'illinois medical district': 28, 'fulton river district': 28, 'fulton market': 28,
  'the loop': 32, 'printers row': 32, 'new eastside': 32, 'lakeshore east': 32, 'south loop': 33, 'prairie district': 33,
  'dearborn park': 33, 'central station': 33,
  pilsen: 31, 'little village': 30, galewood: 25, lawndale: 29, 'k town': 29, 'ukrainian village east': 24,
  chinatown: 34, bronzeville: 38, 'grand crossing': 69, 'park manor': 69, 'back of the yards': 61, canaryville: 61,
  'marquette park': 66, scottsdale: 70, brainerd: 73, fernwood: 49, 'west chesterfield': 49, 'princeton park': 49,
  'golden gate': 54, 'altgeld gardens': 54, 'jeffery manor': 51, 'pill hill': 48, 'east hyde park': 41,
  'west woodlawn': 42, 'jackson park highlands': 43, 'south shore': 43,
}

export const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’'.]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const EXACT = new Map(Object.entries(COMMUNITY_AREAS).map(([n, a]) => [normalize(a.name), Number(n)]))

/** Parse one CSV line, respecting quoted fields that contain commas. */
export function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

interface Match {
  name: string
  exact: boolean
  series: Map<string, number> // YYYY-MM → value
}

/** Turn Zillow CSV text into price metrics per community area. */
export function pricesFromCsv(csv: string): { data: Record<number, PriceMetrics>; rows: number } {
  const lines = csv.split(/\r?\n/)
  const header = parseCsvLine(lines[0])
  const col = (name: string) => header.indexOf(name)
  const iName = col('RegionName')
  const iCity = col('City')
  const iState = col('State')
  if (iName < 0 || iCity < 0 || iState < 0) throw new Error(`Unexpected Zillow columns: ${header.slice(0, 10).join(', ')}`)
  const dateCols = header.map((h, i) => [h, i] as const).filter(([h]) => /^\d{4}-\d{2}-\d{2}$/.test(h))

  const matches = new Map<number, Match[]>()
  let rows = 0
  for (let li = 1; li < lines.length; li++) {
    const line = lines[li]
    if (!line.includes('Chicago')) continue // quick skip; most of the file is other cities
    const cells = parseCsvLine(line)
    if (cells[iCity] !== 'Chicago' || cells[iState] !== 'IL') continue
    rows++
    const key = normalize(cells[iName])
    const exactArea = EXACT.get(key)
    const area = exactArea ?? ALIASES[key]
    if (!area) continue
    const series = new Map<string, number>()
    for (const [h, i] of dateCols) {
      const v = Number(cells[i])
      if (cells[i] !== '' && isFinite(v) && v > 0) series.set(h.slice(0, 7), v)
    }
    const list = matches.get(area) ?? []
    list.push({ name: cells[iName], exact: exactArea !== undefined, series })
    matches.set(area, list)
  }

  const data: Record<number, PriceMetrics> = {}
  for (const [area, list] of matches) {
    const use = list.some((m) => m.exact) ? list.filter((m) => m.exact) : list
    const months = [...new Set(use.flatMap((m) => [...m.series.keys()]))].sort()
    const monthly: MonthlyPoint[] = []
    for (const month of months) {
      const vals = use.map((m) => m.series.get(month)).filter((v): v is number => v !== undefined)
      // only average months where every matched neighborhood has data, so the series doesn't jump
      if (vals.length === use.length) monthly.push({ month, value: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) })
    }
    if (monthly.length < 2) continue
    const last = monthly[monthly.length - 1]
    const ago = (n: number) => (monthly.length > n ? monthly[monthly.length - 1 - n].value : 0)
    data[area] = {
      typicalValue: last.value,
      change1m: pctChange(last.value, ago(1)),
      change1y: pctChange(last.value, ago(12)),
      change5y: pctChange(last.value, ago(60)),
      monthly: monthly.slice(-60),
      matchedNeighborhoods: use.map((m) => m.name),
      asOf: last.month,
    }
  }
  return { data, rows }
}

export async function collectPrices() {
  const res = await fetch(ZILLOW_URL, { signal: AbortSignal.timeout(120_000) })
  if (!res.ok) throw new Error(`Zillow HTTP ${res.status}`)
  return pricesFromCsv(await res.text())
}
