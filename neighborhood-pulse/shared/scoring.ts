// Turns raw numbers into:
//   1. a "momentum" score from -100 (declining) to +100 (improving)
//   2. a confidence level
//   3. a plain-English summary
//   4. an "opportunity" score for the Top Picks panel
//
// Key idea: we compare each area to the WHOLE CITY. If crime fell 10% everywhere,
// an area where it fell 10% is just average. Investors care about areas that are
// doing better than the rest of Chicago.

import { COMMUNITY_AREAS } from './communityAreas'
import { fmtMoney, fmtPct, pctChange } from './format'
import type { AreaMetrics, Confidence, NeighborhoodScore, Opportunity, ScoreComponent } from './types'

interface ComponentDef {
  key: string
  label: string
  weight: number
  /** A difference vs the city of this many % points counts as a "full strength" signal */
  scale: number
  /** true = going up is bad (crime, vacant buildings) */
  invert: boolean
  /** Area value: % change, or null if not enough data */
  change: (m: AreaMetrics) => number | null
  /** City totals used to compute the citywide % change */
  totals?: (m: AreaMetrics) => [number, number] | null
}

const countChange =
  (pick: (m: AreaMetrics) => { last12: number; prev12: number } | undefined, minPrev: number) =>
  (m: AreaMetrics) => {
    const t = pick(m)
    return t && t.prev12 >= minPrev ? pctChange(t.last12, t.prev12) : null
  }
const countTotals = (pick: (m: AreaMetrics) => { last12: number; prev12: number } | undefined) => (m: AreaMetrics) => {
  const t = pick(m)
  return t ? ([t.last12, t.prev12] as [number, number]) : null
}

export const COMPONENTS: ComponentDef[] = [
  {
    key: 'prices',
    label: 'Home values (1 yr)',
    weight: 0.3,
    scale: 8,
    invert: false,
    change: (m) => m.prices?.change1y ?? null,
  },
  {
    key: 'permits',
    label: 'Building permits',
    weight: 0.25,
    scale: 40,
    invert: false,
    change: countChange((m) => m.permits, 10),
    totals: countTotals((m) => m.permits),
  },
  {
    key: 'businesses',
    label: 'New business licenses',
    weight: 0.15,
    scale: 40,
    invert: false,
    change: countChange((m) => m.businesses, 5),
    totals: countTotals((m) => m.businesses),
  },
  {
    key: 'crime',
    label: 'Reported crime',
    weight: 0.15,
    scale: 25,
    invert: true,
    change: countChange((m) => m.crime, 20),
    totals: countTotals((m) => m.crime),
  },
  {
    key: 'vacancy',
    label: 'Vacant-building complaints',
    weight: 0.15,
    scale: 50,
    invert: true,
    change: countChange((m) => m.vacancy, 5),
    totals: countTotals((m) => m.vacancy),
  },
]

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

function median(values: number[]): number | null {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Citywide % change for each component. */
export function cityChanges(all: Record<number, AreaMetrics>): Record<string, number | null> {
  const out: Record<string, number | null> = {}
  const list = Object.values(all)
  for (const c of COMPONENTS) {
    if (c.totals) {
      let now = 0
      let before = 0
      for (const m of list) {
        const t = c.totals(m)
        if (t) {
          now += t[0]
          before += t[1]
        }
      }
      out[c.key] = pctChange(now, before)
    } else {
      out[c.key] = median(list.map(c.change).filter((v): v is number => v !== null))
    }
  }
  return out
}

function describe(c: ScoreComponent): string {
  const diff = c.areaChange - c.cityChange
  const word = c.areaChange >= 0 ? 'up' : 'down'
  const vsCity = Math.abs(diff) < 1 ? 'about the same as the city' : `city ${fmtPct(c.cityChange)}`
  const subject: Record<string, string> = {
    prices: 'Home values are',
    permits: 'Building permits are',
    businesses: 'New business licenses are',
    crime: 'Reported crime is',
    vacancy: 'Vacant-building complaints are',
  }
  const change = Math.abs(c.areaChange) < 0.5 ? 'flat' : `${word} ${Math.abs(c.areaChange).toFixed(0)}%`
  return `${subject[c.key] ?? c.label} ${change} vs. last year (${vsCity}).`
}

export function scoreArea(
  areaNumber: number,
  metrics: AreaMetrics,
  city: Record<string, number | null>,
  lastUpdated: string,
): NeighborhoodScore {
  const components: ScoreComponent[] = []
  for (const c of COMPONENTS) {
    const areaChange = c.change(metrics)
    const cityChange = city[c.key]
    if (areaChange === null || cityChange === null || cityChange === undefined) continue
    const raw = clamp((areaChange - cityChange) / c.scale, -1, 1)
    components.push({
      key: c.key,
      label: c.label,
      areaChange,
      cityChange,
      contribution: c.invert ? -raw : raw,
      weight: c.weight,
    })
  }

  const totalWeight = components.reduce((s, c) => s + c.weight, 0)
  const score = totalWeight
    ? Math.round((100 * components.reduce((s, c) => s + c.weight * c.contribution, 0)) / totalWeight)
    : 0

  const permitVolume = metrics.permits?.last12 ?? 0
  const confidence: Confidence =
    components.length <= 2 ? 'low' : components.length >= 4 && permitVolume >= 30 ? 'high' : 'medium'

  const name = COMMUNITY_AREAS[areaNumber]?.name ?? `Area ${areaNumber}`
  const direction =
    score >= 15
      ? 'is outperforming most of Chicago'
      : score <= -15
        ? 'is lagging behind most of Chicago'
        : 'is tracking close to the citywide average'
  const strongest = [...components].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).slice(0, 2)
  const summary =
    components.length === 0
      ? `Not enough data yet to judge ${name}.`
      : `${name} ${direction}. ${strongest.map(describe).join(' ')}`

  return {
    areaNumber,
    score,
    confidence,
    summary,
    headlines: [],
    metrics,
    components,
    opportunity: null,
    lastUpdated,
  }
}

/** Percentile rank (0 = lowest, 1 = highest) of each value. */
function percentiles(values: Map<number, number>): Map<number, number> {
  const sorted = [...values.entries()].sort((a, b) => a[1] - b[1])
  const out = new Map<number, number>()
  sorted.forEach(([k], i) => out.set(k, sorted.length > 1 ? i / (sorted.length - 1) : 0.5))
  return out
}

/**
 * Opportunity = 40% momentum + 35% affordability + 25% pipeline.
 *   momentum      = the score above
 *   affordability = cheaper than other areas (by typical home value)
 *   pipeline      = new construction activity + growth in permit dollars
 * Only areas with price data and at least medium confidence qualify.
 */
export function addOpportunities(scores: Record<number, NeighborhoodScore>) {
  const eligible = Object.values(scores).filter((s) => s.metrics.prices && s.confidence !== 'low')
  if (eligible.length < 3) return

  const price = percentiles(new Map(eligible.map((s) => [s.areaNumber, s.metrics.prices!.typicalValue])))
  const newBuild = percentiles(new Map(eligible.map((s) => [s.areaNumber, s.metrics.permits?.newConstruction12 ?? 0])))
  const dollars = percentiles(
    new Map(
      eligible.map((s) => {
        const p = s.metrics.permits
        return [s.areaNumber, p ? (pctChange(p.value12, p.valuePrev12) ?? 0) : 0]
      }),
    ),
  )

  for (const s of eligible) {
    const momentum = (s.score + 100) / 200
    const affordability = 1 - price.get(s.areaNumber)!
    const pipeline = (newBuild.get(s.areaNumber)! + dollars.get(s.areaNumber)!) / 2
    const reasons: string[] = []
    const p = s.metrics.prices!
    reasons.push(`Typical home ${fmtMoney(p.typicalValue)}${p.change1y !== null ? ` (${fmtPct(p.change1y, 1)} in a year)` : ''}`)
    const permits = s.metrics.permits
    if (permits) {
      const ch = pctChange(permits.last12, permits.prev12)
      reasons.push(`${permits.newConstruction12} new-construction permits; all permits ${fmtPct(ch)}`)
    }
    const best = [...s.components].sort((a, b) => b.contribution - a.contribution)[0]
    if (best && best.contribution > 0.2 && best.key !== 'prices' && best.key !== 'permits') reasons.push(describe(best))

    const opp: Opportunity = {
      score: Math.round(100 * (0.4 * momentum + 0.35 * affordability + 0.25 * pipeline)),
      momentum,
      affordability,
      pipeline,
      reasons,
    }
    s.opportunity = opp
  }
}

/** Score every area from raw metrics. */
export function buildScores(all: Record<number, AreaMetrics>, lastUpdated: string): Record<number, NeighborhoodScore> {
  const city = cityChanges(all)
  const out: Record<number, NeighborhoodScore> = {}
  for (const [n, m] of Object.entries(all)) out[Number(n)] = scoreArea(Number(n), m, city, lastUpdated)
  addOpportunities(out)
  return out
}
