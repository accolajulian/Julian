// The weekly research job. Vercel Cron calls this every Monday (see vercel.json).
//
// You can also run it by hand in your browser:
//   https://YOUR-SITE.vercel.app/api/collect?key=YOUR_CRON_SECRET&dry=1   → test only, saves nothing
//   https://YOUR-SITE.vercel.app/api/collect?key=YOUR_CRON_SECRET         → collect and save
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { COMMUNITY_AREAS } from '../shared/communityAreas.js'
import { buildScores } from '../shared/scoring.js'
import type { AreaMetrics } from '../shared/types.js'
import { db, latestSnapshots, saveRun } from './_lib/db.js'
import { collectAll } from './_lib/sources.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = process.env.CRON_SECRET
  const given = req.headers.authorization === `Bearer ${secret}` || req.query.key === secret
  if (!secret || !given) {
    return res.status(401).json({ error: 'Unauthorized. Set CRON_SECRET in Vercel and pass ?key=…' })
  }
  const dry = req.query.dry === '1'
  const client = db()
  if (!client && !dry) {
    return res.status(500).json({ error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set. Try ?dry=1 to test without saving.' })
  }

  const { metrics, status } = await collectAll()

  // If a source failed this week, keep last week's numbers for it instead of losing them.
  const carried: string[] = []
  if (client) {
    try {
      for (const prev of await latestSnapshots(client)) {
        const now = (metrics[prev.area_number] ??= {})
        for (const key of Object.keys(prev.metrics ?? {}) as (keyof AreaMetrics)[]) {
          if (!status[key]?.ok && now[key] === undefined) {
            ;(now as Record<string, unknown>)[key] = prev.metrics[key]
            if (!carried.includes(key)) carried.push(key)
          }
        }
      }
    } catch {
      // first run: nothing to carry over
    }
  }

  for (const n of Object.keys(COMMUNITY_AREAS)) metrics[Number(n)] ??= {}
  const today = new Date().toISOString().slice(0, 10)
  const scores = buildScores(metrics, today)

  if (!dry && client) await saveRun(client, scores, status)

  const preview = [8, 22, 24, 42, 68].map((n) => ({
    name: COMMUNITY_AREAS[n].name,
    score: scores[n].score,
    confidence: scores[n].confidence,
    summary: scores[n].summary,
    price: scores[n].metrics.prices?.typicalValue ?? null,
    permits12: scores[n].metrics.permits?.last12 ?? null,
    crime12: scores[n].metrics.crime?.last12 ?? null,
  }))
  const top = Object.values(scores)
    .filter((s) => s.opportunity)
    .sort((a, b) => b.opportunity!.score - a.opportunity!.score)
    .slice(0, 3)
    .map((s) => `${COMMUNITY_AREAS[s.areaNumber].name} (${s.opportunity!.score})`)

  return res.status(200).json({ saved: !dry, date: today, sources: status, carriedOverFromLastRun: carried, topOpportunities: top, preview })
}
