// Helpers for the Chicago Data Portal (a "Socrata" open-data API).
// Docs: https://dev.socrata.com/docs/queries/
import { areaForPoint } from './geo.js'

const BASE = 'https://data.cityofchicago.org/resource'

export async function soql(dataset: string, params: Record<string, string>): Promise<Record<string, string>[]> {
  const url = new URL(`${BASE}/${dataset}.json`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (process.env.CHICAGO_APP_TOKEN) headers['X-App-Token'] = process.env.CHICAGO_APP_TOKEN
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(90_000) })
  if (!res.ok) throw new Error(`${dataset} HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return (await res.json()) as Record<string, string>[]
}

/** One row of results: count (and optional sum) for one area, month, and optional category. */
export interface MonthlyRow {
  area: number
  month: string // YYYY-MM
  count: number
  sum: number
  category: string
}

export interface MonthlyQuery {
  dataset: string
  dateField: string
  /** Extra SoQL filter, e.g. "primary_type in ('ROBBERY')" */
  where?: string
  /** Numeric field to add up, e.g. reported_cost */
  sumField?: string
  /** Text field to split results by, e.g. permit_type */
  categoryField?: string
  start: string // YYYY-MM-DD (inclusive)
  end: string // YYYY-MM-DD (exclusive)
}

/**
 * Monthly counts per community area.
 * Plan A: ask the portal to do the counting, grouped by its community_area column (fast).
 * Plan B: if that fails (e.g. the dataset has no community_area column), download each
 *         record's latitude/longitude and work out the community area ourselves.
 */
export async function monthlyByArea(q: MonthlyQuery): Promise<{ rows: MonthlyRow[]; method: string }> {
  const range = `${q.dateField} >= '${q.start}T00:00:00' AND ${q.dateField} < '${q.end}T00:00:00'`
  const where = q.where ? `${range} AND (${q.where})` : range
  try {
    const select = [
      'community_area',
      `date_trunc_ym(${q.dateField}) AS m`,
      'count(*) AS n',
      q.sumField ? `sum(${q.sumField}) AS s` : null,
      q.categoryField ?? null,
    ]
      .filter(Boolean)
      .join(', ')
    const group = ['community_area', `date_trunc_ym(${q.dateField})`, q.categoryField].filter(Boolean).join(', ')
    const rows = await soql(q.dataset, { $select: select, $where: where, $group: group, $limit: '50000' })
    const out: MonthlyRow[] = []
    for (const r of rows) {
      const area = Math.round(Number(r.community_area))
      if (!(area >= 1 && area <= 77)) continue
      out.push({
        area,
        month: String(r.m).slice(0, 7),
        count: Number(r.n) || 0,
        sum: Number(r.s) || 0,
        category: q.categoryField ? String(r[q.categoryField] ?? '') : '',
      })
    }
    if (out.length === 0) throw new Error('grouped query returned no usable rows')
    return { rows: out, method: 'grouped by community_area' }
  } catch (groupError) {
    const fields = ['latitude', 'longitude', q.dateField, q.sumField, q.categoryField].filter(Boolean).join(', ')
    const counts = new Map<string, MonthlyRow>()
    const pageSize = 50_000
    for (let page = 0; page < 12; page++) {
      const rows = await soql(q.dataset, {
        $select: fields,
        $where: `${where} AND latitude IS NOT NULL`,
        $order: ':id',
        $limit: String(pageSize),
        $offset: String(page * pageSize),
      })
      for (const r of rows) {
        const area = areaForPoint(Number(r.longitude), Number(r.latitude))
        if (area === null) continue
        const month = String(r[q.dateField]).slice(0, 7)
        const category = q.categoryField ? String(r[q.categoryField] ?? '') : ''
        const key = `${area}|${month}|${category}`
        const row = counts.get(key) ?? { area, month, count: 0, sum: 0, category }
        row.count++
        if (q.sumField) row.sum += Number(r[q.sumField]) || 0
        counts.set(key, row)
      }
      if (rows.length < pageSize) break
    }
    if (counts.size === 0) throw groupError
    return { rows: [...counts.values()], method: 'located by latitude/longitude' }
  }
}
