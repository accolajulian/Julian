// Types shared by the website (src/) and the data collector (api/).

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

/** One month of data. month is "YYYY-MM". */
export interface MonthlyPoint {
  month: string
  value: number
}

/** A count for the last 12 months vs the 12 months before, plus a monthly series. */
export interface CountTrend {
  last12: number
  prev12: number
  monthly: MonthlyPoint[]
}

export interface PermitMetrics extends CountTrend {
  newConstruction12: number
  renovation12: number
  demolition12: number
  /** Total reported construction cost, last 12 months (USD) */
  value12: number
  valuePrev12: number
}

export interface CrimeMetrics extends CountTrend {
  violent12: number
  violentPrev12: number
}

export interface PriceMetrics {
  /** Zillow Home Value Index: the "typical" home value (USD) */
  typicalValue: number
  /** % changes */
  change1m: number | null
  change1y: number | null
  change5y: number | null
  monthly: MonthlyPoint[]
  /** Which Zillow neighborhoods were used for this community area */
  matchedNeighborhoods: string[]
  asOf: string
}

/** Raw numbers collected for one community area. Any section can be missing if a source failed. */
export interface AreaMetrics {
  permits?: PermitMetrics
  crime?: CrimeMetrics
  vacancy?: CountTrend
  businesses?: CountTrend
  prices?: PriceMetrics
}

export interface Headline {
  title: string
  url: string
  source: string
  date: string // ISO date
}

/** One ingredient of the overall score, compared against the citywide trend. */
export interface ScoreComponent {
  key: string
  label: string
  /** % change in this area */
  areaChange: number
  /** % change across all of Chicago */
  cityChange: number
  /** -1 (bad) … +1 (good) */
  contribution: number
  weight: number
}

export interface Opportunity {
  /** 0–100 */
  score: number
  momentum: number // 0–1
  affordability: number // 0–1
  pipeline: number // 0–1
  reasons: string[]
}

/** Everything we know about one neighborhood. */
export interface NeighborhoodScore {
  areaNumber: number
  score: number // -100 (declining) … +100 (improving)
  confidence: Confidence
  summary: string
  headlines: Headline[]
  metrics: AreaMetrics
  components: ScoreComponent[]
  opportunity: Opportunity | null
  lastUpdated: string // ISO date
}

/** What /api/areas returns. */
export interface AreasResponse {
  updatedAt: string | null
  isSample: boolean
  areas: Record<number, NeighborhoodScore>
  sources?: Record<string, SourceStatus>
}

export interface SourceStatus {
  ok: boolean
  rows?: number
  method?: string
  error?: string
  ms?: number
}

/** Properties we attach to each map feature. */
export interface AreaProperties {
  areaNumber: number
  name: string
  side: SideName
  fillColor: string
  fillOpacity: number
}
