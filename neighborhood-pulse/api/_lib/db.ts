import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { AreaMetrics, NeighborhoodScore, SourceStatus } from '../../shared/types.js'

/**
 * Accepts the Supabase project URL in whatever form it was pasted and returns
 * the bare "https://<project>.supabase.co" that the client library needs:
 *   https://abc.supabase.co/rest/v1/        → https://abc.supabase.co
 *   supabase.com/dashboard/project/abc/...  → https://abc.supabase.co
 *   abc (just the project id)               → https://abc.supabase.co
 */
export function normalizeSupabaseUrl(raw: string): string {
  const u = raw.trim().replace(/^["']|["']$/g, '')
  const dashboard = u.match(/supabase\.com\/dashboard\/project\/([a-z0-9]+)/i)
  if (dashboard) return `https://${dashboard[1]}.supabase.co`
  if (/^[a-z0-9]{15,30}$/i.test(u)) return `https://${u}.supabase.co`
  try {
    return new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).origin
  } catch {
    return u
  }
}

export function db(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) return null
  return createClient(normalizeSupabaseUrl(url), key, { auth: { persistSession: false } })
}

export interface SnapshotRow {
  area_number: number
  collected_on: string
  score: number
  confidence: string
  summary: string
  metrics: AreaMetrics
  components: NeighborhoodScore['components']
  opportunity: NeighborhoodScore['opportunity']
  headlines: NeighborhoodScore['headlines']
}

export async function latestSnapshots(client: SupabaseClient): Promise<SnapshotRow[]> {
  const { data, error } = await client.from('latest_area_snapshots').select('*')
  if (error) throw new Error(`Supabase read failed: ${error.message}`)
  return (data ?? []) as SnapshotRow[]
}

export async function lastRun(client: SupabaseClient) {
  const { data } = await client
    .from('collection_runs')
    .select('ran_at, sources')
    .order('ran_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data as { ran_at: string; sources: Record<string, SourceStatus> } | null
}

export async function saveRun(client: SupabaseClient, scores: Record<number, NeighborhoodScore>, sources: Record<string, SourceStatus>) {
  const rows: SnapshotRow[] = Object.values(scores).map((s) => ({
    area_number: s.areaNumber,
    collected_on: s.lastUpdated,
    score: s.score,
    confidence: s.confidence,
    summary: s.summary,
    metrics: s.metrics,
    components: s.components,
    opportunity: s.opportunity,
    headlines: s.headlines,
  }))
  const { error } = await client.from('area_snapshots').upsert(rows, { onConflict: 'area_number,collected_on' })
  if (error) throw new Error(`Supabase write failed: ${error.message}`)
  const ok = Object.values(sources).every((s) => s.ok)
  await client.from('collection_runs').insert({ ok, sources })
}
