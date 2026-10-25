import { pctChange } from '../../shared/format'
import type { Confidence, NeighborhoodScore } from '../../shared/types'

// Turns data into a fill color + opacity for each zone.
//   GREEN = improving, RED = declining, light gray = neutral / not enough info.
//   Stronger signal = more opaque color.

export const NEUTRAL_THRESHOLD = 15

export const COLORS = {
  green: '#22c55e',
  red: '#ef4444',
  neutral: '#e5e7eb',
  blue: '#38bdf8',
  amber: '#f59e0b',
}

export type Signal = 'improving' | 'declining' | 'neutral'

export function signalFor(score: number, confidence: Confidence): Signal {
  if (confidence === 'low') return 'neutral'
  if (score >= NEUTRAL_THRESHOLD) return 'improving'
  if (score <= -NEUTRAL_THRESHOLD) return 'declining'
  return 'neutral'
}

export function signalLabel(signal: Signal) {
  return signal === 'improving' ? 'Improving' : signal === 'declining' ? 'Declining' : 'Neutral / not enough info'
}

export type ColorMode = 'signal' | 'opportunity' | 'priceGrowth' | 'price' | 'permits' | 'crime'

export const COLOR_MODES: { id: ColorMode; label: string; legend: [string, string, string]; kind: 'diverging' | 'sequential' }[] = [
  { id: 'signal', label: 'Overall signal', legend: ['Declining', 'Neutral', 'Improving'], kind: 'diverging' },
  { id: 'opportunity', label: 'Opportunity score', legend: ['Low', '', 'High'], kind: 'sequential' },
  { id: 'priceGrowth', label: 'Home value growth (1 yr)', legend: ['Slower than city', 'City avg', 'Faster'], kind: 'diverging' },
  { id: 'price', label: 'Typical home value', legend: ['Cheaper', '', 'Pricier'], kind: 'sequential' },
  { id: 'permits', label: 'Building permit growth', legend: ['Falling', 'City avg', 'Rising'], kind: 'diverging' },
  { id: 'crime', label: 'Crime trend', legend: ['Rising', 'City avg', 'Falling'], kind: 'diverging' },
]

const NEUTRAL = { color: COLORS.neutral, opacity: 0.22 }

function diverging(value: number | null, scale: number) {
  if (value === null || !isFinite(value)) return NEUTRAL
  const strength = Math.min(1, Math.abs(value) / scale)
  if (strength < 0.15) return NEUTRAL
  return { color: value > 0 ? COLORS.green : COLORS.red, opacity: 0.2 + strength * 0.45 }
}

function sequential(rank: number | null, color: string) {
  if (rank === null) return NEUTRAL
  return { color, opacity: 0.12 + rank * 0.6 }
}

/** Citywide reference values, computed once per data load. */
export interface ColorContext {
  medianPriceGrowth: number | null
  cityPermitChange: number | null
  cityCrimeChange: number | null
  priceRank: Map<number, number>
}

export function colorContext(areas: Record<number, NeighborhoodScore>): ColorContext {
  const list = Object.values(areas)
  const growth = list.map((s) => s.metrics.prices?.change1y).filter((v): v is number => v != null).sort((a, b) => a - b)
  const sum = (pick: (s: NeighborhoodScore) => [number, number] | null) => {
    let a = 0
    let b = 0
    for (const s of list) {
      const t = pick(s)
      if (t) {
        a += t[0]
        b += t[1]
      }
    }
    return pctChange(a, b)
  }
  const priced = list.filter((s) => s.metrics.prices).sort((a, b) => a.metrics.prices!.typicalValue - b.metrics.prices!.typicalValue)
  return {
    medianPriceGrowth: growth.length ? growth[Math.floor(growth.length / 2)] : null,
    cityPermitChange: sum((s) => (s.metrics.permits ? [s.metrics.permits.last12, s.metrics.permits.prev12] : null)),
    cityCrimeChange: sum((s) => (s.metrics.crime ? [s.metrics.crime.last12, s.metrics.crime.prev12] : null)),
    priceRank: new Map(priced.map((s, i) => [s.areaNumber, priced.length > 1 ? i / (priced.length - 1) : 0.5])),
  }
}

export function colorFor(mode: ColorMode, s: NeighborhoodScore | undefined, ctx: ColorContext) {
  if (!s) return NEUTRAL
  const m = s.metrics
  switch (mode) {
    case 'signal':
      return s.confidence === 'low' ? NEUTRAL : diverging(s.score, 100)
    case 'opportunity':
      return sequential(s.opportunity ? s.opportunity.score / 100 : null, COLORS.amber)
    case 'priceGrowth':
      return diverging(m.prices?.change1y != null && ctx.medianPriceGrowth != null ? m.prices.change1y - ctx.medianPriceGrowth : null, 6)
    case 'price':
      return sequential(ctx.priceRank.get(s.areaNumber) ?? null, COLORS.blue)
    case 'permits': {
      const ch = m.permits && m.permits.prev12 >= 10 ? pctChange(m.permits.last12, m.permits.prev12) : null
      return diverging(ch != null && ctx.cityPermitChange != null ? ch - ctx.cityPermitChange : null, 40)
    }
    case 'crime': {
      const ch = m.crime && m.crime.prev12 >= 20 ? pctChange(m.crime.last12, m.crime.prev12) : null
      return diverging(ch != null && ctx.cityCrimeChange != null ? ctx.cityCrimeChange - ch : null, 25)
    }
  }
}
