// Shared types used across the app.

export type SideName =
  | 'Far North'
  | 'Northwest'
  | 'North'
  | 'Central'
  | 'West'
  | 'Southwest'
  | 'South'
  | 'Far Southwest'
  | 'Far Southeast'

export type Confidence = 'low' | 'medium' | 'high'

export interface Headline {
  title: string
  url: string
  source: string
  date: string // ISO date
}

export interface PermitTrend {
  /** Permits issued in the last 12 months */
  thisYear: number
  /** Permits issued in the 12 months before that */
  lastYear: number
  /** Monthly counts for the last 12 months, oldest first (for the mini chart) */
  monthly: number[]
}

/** Everything we know about one neighborhood. In Phase 1 this is fake sample data. */
export interface NeighborhoodScore {
  areaNumber: number
  score: number // -100 (declining) … +100 (improving)
  confidence: Confidence
  summary: string
  headlines: Headline[]
  permits: PermitTrend
  lastUpdated: string // ISO date
}

/** Properties we attach to each map feature. */
export interface AreaProperties {
  areaNumber: number
  name: string
  side: SideName
  score: number
  confidence: Confidence
  fillColor: string
  fillOpacity: number
}
