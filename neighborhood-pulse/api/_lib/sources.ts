// Each "source" pulls one kind of data and returns metrics per community area.
import type { AreaMetrics, CountTrend, MonthlyPoint, SourceStatus } from '../../shared/types.js'
import { monthlyByArea, type MonthlyRow } from './socrata.js'
import { collectPrices } from './zillow.js'

/** 24 full months ending with last month. */
export function periods(now = new Date()) {
  const months: string[] = []
  for (let i = 24; i >= 1; i--) {
    months.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)).toISOString().slice(0, 7))
  }
  return {
    months,
    start: `${months[0]}-01`,
    end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10),
  }
}

type Partial77 = Record<number, Partial<AreaMetrics>>

/** Turn monthly rows into last-12 vs prev-12 trends for every area. */
function toTrends(rows: MonthlyRow[], months: string[], filter: (r: MonthlyRow) => boolean = () => true) {
  const byArea = new Map<number, Map<string, number>>()
  for (const r of rows) {
    if (!filter(r)) continue
    const m = byArea.get(r.area) ?? new Map<string, number>()
    m.set(r.month, (m.get(r.month) ?? 0) + r.count)
    byArea.set(r.area, m)
  }
  const out = new Map<number, CountTrend>()
  for (let area = 1; area <= 77; area++) {
    const m = byArea.get(area) ?? new Map()
    const monthly: MonthlyPoint[] = months.map((month) => ({ month, value: m.get(month) ?? 0 }))
    out.set(area, {
      monthly,
      prev12: monthly.slice(0, 12).reduce((s, p) => s + p.value, 0),
      last12: monthly.slice(12).reduce((s, p) => s + p.value, 0),
    })
  }
  return out
}

const sumWhere = (rows: MonthlyRow[], area: number, months: string[], pick: (r: MonthlyRow) => number, test: (r: MonthlyRow) => boolean) =>
  rows.filter((r) => r.area === area && months.includes(r.month) && test(r)).reduce((s, r) => s + pick(r), 0)

// ---------------------------------------------------------------- sources

async function permits(p: ReturnType<typeof periods>): Promise<{ data: Partial77; rows: number; method: string }> {
  // Building Permits: https://data.cityofchicago.org/d/ydr8-5enu
  const { rows, method } = await monthlyByArea({
    dataset: 'ydr8-5enu',
    dateField: 'issue_date',
    sumField: 'reported_cost',
    categoryField: 'permit_type',
    start: p.start,
    end: p.end,
  })
  const last = p.months.slice(12)
  const prev = p.months.slice(0, 12)
  const trends = toTrends(rows, p.months)
  const type = (r: MonthlyRow, word: RegExp) => word.test(r.category.toUpperCase())
  const data: Partial77 = {}
  for (const [area, t] of trends) {
    data[area] = {
      permits: {
        ...t,
        newConstruction12: sumWhere(rows, area, last, (r) => r.count, (r) => type(r, /NEW CONSTRUCTION/)),
        renovation12: sumWhere(rows, area, last, (r) => r.count, (r) => type(r, /RENOVATION|ALTERATION/)),
        demolition12: sumWhere(rows, area, last, (r) => r.count, (r) => type(r, /WRECKING|DEMOLITION/)),
        value12: sumWhere(rows, area, last, (r) => r.sum, () => true),
        valuePrev12: sumWhere(rows, area, prev, (r) => r.sum, () => true),
      },
    }
  }
  return { data, rows: rows.length, method }
}

const VIOLENT = ['HOMICIDE', 'CRIMINAL SEXUAL ASSAULT', 'ROBBERY', 'ASSAULT', 'BATTERY']

async function crime(p: ReturnType<typeof periods>) {
  // Crimes - 2001 to Present: https://data.cityofchicago.org/d/ijzp-q8t2
  const base = { dataset: 'ijzp-q8t2', dateField: 'date', start: p.start, end: p.end }
  const [all, violent] = await Promise.all([
    monthlyByArea(base),
    monthlyByArea({ ...base, where: `primary_type in (${VIOLENT.map((t) => `'${t}'`).join(', ')})` }),
  ])
  const allT = toTrends(all.rows, p.months)
  const vioT = toTrends(violent.rows, p.months)
  const data: Partial77 = {}
  for (const [area, t] of allT) {
    const v = vioT.get(area)!
    data[area] = { crime: { ...t, violent12: v.last12, violentPrev12: v.prev12 } }
  }
  return { data, rows: all.rows.length + violent.rows.length, method: all.method }
}

async function vacancy(p: ReturnType<typeof periods>) {
  // 311 Service Requests: https://data.cityofchicago.org/d/v6vf-nfxy
  const { rows, method } = await monthlyByArea({
    dataset: 'v6vf-nfxy',
    dateField: 'created_date',
    where: "upper(sr_type) like '%VACANT%'",
    start: p.start,
    end: p.end,
  })
  const data: Partial77 = {}
  for (const [area, t] of toTrends(rows, p.months)) data[area] = { vacancy: t }
  return { data, rows: rows.length, method }
}

async function businesses(p: ReturnType<typeof periods>) {
  // Business Licenses: https://data.cityofchicago.org/d/r5kz-chrr  (ISSUE = a brand-new license, not a renewal)
  const { rows, method } = await monthlyByArea({
    dataset: 'r5kz-chrr',
    dateField: 'license_start_date',
    where: "application_type = 'ISSUE'",
    start: p.start,
    end: p.end,
  })
  const data: Partial77 = {}
  for (const [area, t] of toTrends(rows, p.months)) data[area] = { businesses: t }
  return { data, rows: rows.length, method }
}

async function prices() {
  const { data, rows } = await collectPrices()
  const out: Partial77 = {}
  for (const [area, pm] of Object.entries(data)) out[Number(area)] = { prices: pm }
  return { data: out, rows, method: 'Zillow Home Value Index (neighborhoods)' }
}

export const SOURCES = {
  permits,
  crime,
  vacancy,
  businesses,
  prices: () => prices(),
}

/** Run every source; a failure in one doesn't stop the others. */
export async function collectAll(now = new Date()) {
  const p = periods(now)
  const metrics: Record<number, AreaMetrics> = {}
  const status: Record<string, SourceStatus> = {}
  await Promise.all(
    Object.entries(SOURCES).map(async ([name, fn]) => {
      const t0 = Date.now()
      try {
        const { data, rows, method } = await fn(p)
        for (const [area, part] of Object.entries(data)) metrics[Number(area)] = { ...metrics[Number(area)], ...part }
        status[name] = { ok: true, rows, method, ms: Date.now() - t0 }
      } catch (e) {
        const cause = e instanceof Error && e.cause instanceof Error ? ` (${e.cause.message})` : ''
        status[name] = { ok: false, error: e instanceof Error ? e.message + cause : String(e), ms: Date.now() - t0 }
      }
    }),
  )
  return { metrics, status }
}
