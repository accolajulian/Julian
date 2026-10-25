import type { Confidence } from '../types'

// Turns a score (-100…+100) and a confidence level into a fill color + opacity.
//   GREEN = improving, RED = declining, light gray = neutral / not enough info.
//   Stronger signal (bigger |score|) = more opaque color.

export const NEUTRAL_THRESHOLD = 15

export const COLORS = {
  green: '#22c55e',
  red: '#ef4444',
  neutral: '#e5e7eb',
}

export type Signal = 'improving' | 'declining' | 'neutral'

export function signalFor(score: number, confidence: Confidence): Signal {
  if (confidence === 'low') return 'neutral'
  if (score >= NEUTRAL_THRESHOLD) return 'improving'
  if (score <= -NEUTRAL_THRESHOLD) return 'declining'
  return 'neutral'
}

export function fillFor(score: number, confidence: Confidence) {
  const signal = signalFor(score, confidence)
  if (signal === 'neutral') return { color: COLORS.neutral, opacity: 0.22 }
  const strength = Math.min(1, Math.abs(score) / 100)
  return {
    color: signal === 'improving' ? COLORS.green : COLORS.red,
    opacity: 0.2 + strength * 0.45, // 0.20 (weak) … 0.65 (strong)
  }
}

export function signalLabel(signal: Signal) {
  return signal === 'improving' ? 'Improving' : signal === 'declining' ? 'Declining' : 'Neutral / not enough info'
}
