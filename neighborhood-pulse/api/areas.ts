// What the map loads: the latest saved scores for every community area.
import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { AreasResponse, NeighborhoodScore } from '../shared/types.js'
import { db, lastRun, latestSnapshots } from './_lib/db.js'

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const client = db()
  if (!client) return res.status(200).json({ updatedAt: null, isSample: true, areas: {} } satisfies AreasResponse)
  try {
    const [rows, run] = await Promise.all([latestSnapshots(client), lastRun(client)])
    const areas: Record<number, NeighborhoodScore> = {}
    let updatedAt: string | null = null
    for (const r of rows) {
      areas[r.area_number] = {
        areaNumber: r.area_number,
        score: r.score,
        confidence: r.confidence as NeighborhoodScore['confidence'],
        summary: r.summary,
        headlines: r.headlines ?? [],
        metrics: r.metrics ?? {},
        components: r.components ?? [],
        opportunity: r.opportunity,
        lastUpdated: r.collected_on,
      }
      if (!updatedAt || r.collected_on > updatedAt) updatedAt = r.collected_on
    }
    // Cache at Vercel's edge for an hour; the data only changes weekly.
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
    return res.status(200).json({ updatedAt, isSample: rows.length === 0, areas, sources: run?.sources } satisfies AreasResponse)
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
}
