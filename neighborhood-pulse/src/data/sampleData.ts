import { COMMUNITY_AREAS } from '../../shared/communityAreas'
import { buildScores } from '../../shared/scoring'
import type { AreaMetrics, AreasResponse, MonthlyPoint } from '../../shared/types'

// FAKE sample data, used only when real data isn't available yet
// (e.g. `npm run dev` on your computer, or before the first weekly run).

function seeded(seed: number) {
  let s = seed * 9301 + 49297
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

function months(count: number): string[] {
  const out: string[] = []
  const d = new Date()
  d.setUTCDate(1)
  for (let i = count; i >= 1; i--) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1))
    out.push(m.toISOString().slice(0, 7))
  }
  return out
}

function series(rand: () => number, base: number, growth: number, count: number): MonthlyPoint[] {
  return months(count).map((month, i) => ({
    month,
    value: Math.max(0, Math.round(base * (1 + (growth * i) / count) * (0.75 + rand() * 0.5))),
  }))
}

const sum = (pts: MonthlyPoint[]) => pts.reduce((s, p) => s + p.value, 0)

function trend(rand: () => number, base: number, growth: number) {
  const monthly = series(rand, base, growth, 24)
  return { last12: sum(monthly.slice(12)), prev12: sum(monthly.slice(0, 12)), monthly }
}

function sampleMetrics(n: number): AreaMetrics {
  const rand = seeded(n)
  const mood = rand() * 2 - 1 // -1 declining … +1 improving
  const permits = trend(rand, 10 + rand() * 60, mood * 0.6)
  const crime = trend(rand, 40 + rand() * 300, -mood * 0.3 - 0.05)
  const value = Math.round(120_000 + rand() * 650_000)
  const priceSeries = months(60).map((month, i) => ({
    month,
    value: Math.round(value * (1 + (0.02 + mood * 0.05) * ((i - 59) / 12))),
  }))
  const last = priceSeries[59].value
  return {
    permits: {
      ...permits,
      newConstruction12: Math.round(permits.last12 * (0.05 + rand() * 0.15)),
      renovation12: Math.round(permits.last12 * 0.6),
      demolition12: Math.round(permits.last12 * 0.05),
      value12: permits.last12 * (40_000 + rand() * 200_000),
      valuePrev12: permits.prev12 * (40_000 + rand() * 200_000),
    },
    crime: { ...crime, violent12: Math.round(crime.last12 * 0.3), violentPrev12: Math.round(crime.prev12 * 0.3) },
    vacancy: trend(rand, 1 + rand() * 6, -mood * 0.5),
    businesses: trend(rand, 2 + rand() * 15, mood * 0.5),
    prices:
      rand() < 0.9
        ? {
            typicalValue: last,
            change1m: (last / priceSeries[58].value - 1) * 100,
            change1y: (last / priceSeries[47].value - 1) * 100,
            change5y: (last / priceSeries[0].value - 1) * 100,
            monthly: priceSeries,
            matchedNeighborhoods: [COMMUNITY_AREAS[n].name],
            asOf: priceSeries[59].month,
          }
        : undefined,
  }
}

export function sampleResponse(): AreasResponse {
  const all: Record<number, AreaMetrics> = {}
  for (const n of Object.keys(COMMUNITY_AREAS)) all[Number(n)] = sampleMetrics(Number(n))
  const today = new Date().toISOString().slice(0, 10)
  const areas = buildScores(all, today)
  for (const s of Object.values(areas)) s.summary = `SAMPLE DATA: ${s.summary}`
  return { updatedAt: today, isSample: true, areas }
}
