export function pctChange(now: number, before: number): number | null {
  if (!before || before <= 0) return null
  return ((now - before) / before) * 100
}

export function fmtPct(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || !isFinite(v)) return '—'
  const s = Math.abs(v).toFixed(digits)
  return `${v >= 0 ? '+' : '−'}${s}%`
}

export function fmtMoney(v: number | null | undefined): string {
  if (v === null || v === undefined || !isFinite(v)) return '—'
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)}M`
  if (v >= 1_000) return `$${Math.round(v / 1_000)}k`
  return `$${Math.round(v)}`
}

export function fmtNum(v: number | null | undefined): string {
  if (v === null || v === undefined || !isFinite(v)) return '—'
  return Math.round(v).toLocaleString('en-US')
}
