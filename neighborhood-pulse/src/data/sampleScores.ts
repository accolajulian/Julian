import type { Confidence, NeighborhoodScore } from '../types'
import { COMMUNITY_AREAS } from './communityAreas'

// ⚠️ PHASE 1 ONLY: FAKE sample data so we can build and test the map.
// Phase 2/3 replace this with real scores loaded from Supabase.

// Tiny seeded random generator so every area always gets the same fake values.
function seeded(seed: number) {
  let s = seed * 9301 + 49297
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

const POSITIVE = [
  'New mixed-use development approved near transit',
  'Permit filings for residential rehabs climb',
  'New restaurants and retail open along main corridor',
  'City announces streetscape and infrastructure upgrades',
  'TIF funding approved for commercial redevelopment',
]
const NEGATIVE = [
  'Commercial vacancies rise along main corridor',
  'Planned development stalls after financing falls through',
  'Residents raise concerns over closures of local businesses',
  'Permit activity slows compared to last year',
]
const NEUTRAL = ['Community meeting held on zoning proposal', 'Local alderperson hosts budget town hall']

function pick<T>(arr: T[], rand: () => number) {
  return arr[Math.floor(rand() * arr.length)]
}

function makeSample(areaNumber: number): NeighborhoodScore {
  const rand = seeded(areaNumber)
  const { name } = COMMUNITY_AREAS[areaNumber]
  const score = Math.round(rand() * 200 - 100)
  const r = rand()
  const confidence: Confidence = r < 0.2 ? 'low' : r < 0.6 ? 'medium' : 'high'

  const lastYear = 40 + Math.floor(rand() * 260)
  const thisYear = Math.max(5, Math.round(lastYear * (1 + score / 200 + (rand() - 0.5) * 0.2)))
  const monthly = Array.from({ length: 12 }, (_, i) =>
    Math.max(0, Math.round((thisYear / 12) * (0.7 + rand() * 0.6) * (1 + (score / 400) * (i / 11)))),
  )

  const pool = score > 15 ? POSITIVE : score < -15 ? NEGATIVE : NEUTRAL
  const headlines = Array.from({ length: 3 }, (_, i) => {
    const title = `${name}: ${pick(pool, rand)}`
    const day = new Date(Date.now() - (i * 7 + Math.floor(rand() * 6) + 1) * 86400000)
    return {
      title,
      // Real Google News search link so the link actually works — the headline itself is fake.
      url: `https://news.google.com/search?q=${encodeURIComponent(`"${name}" Chicago`)}`,
      source: pick(['Sample Tribune', 'Sample Sun-Times', 'Sample Block Club'], rand),
      date: day.toISOString().slice(0, 10),
    }
  })

  const direction =
    score > 15 ? 'improving' : score < -15 ? 'showing signs of decline' : 'holding steady'
  const permitWord = thisYear >= lastYear ? 'up' : 'down'
  const pct = Math.abs(Math.round(((thisYear - lastYear) / lastYear) * 100))
  const summary =
    `SAMPLE DATA: ${name} appears to be ${direction}. ` +
    `Building permits are ${permitWord} ${pct}% versus the same period last year, ` +
    `and recent coverage ${score > 15 ? 'highlights new investment' : score < -15 ? 'points to closures and stalled projects' : 'is mixed'}.`

  return {
    areaNumber,
    score,
    confidence,
    summary,
    headlines,
    permits: { thisYear, lastYear, monthly },
    lastUpdated: new Date(Date.now() - Math.floor(rand() * 6) * 86400000).toISOString().slice(0, 10),
  }
}

export const SAMPLE_SCORES: Record<number, NeighborhoodScore> = Object.fromEntries(
  Object.keys(COMMUNITY_AREAS).map((n) => [Number(n), makeSample(Number(n))]),
)
