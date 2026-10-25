import { useEffect, useMemo, useState } from 'react'
import type { FeatureCollection, Geometry } from 'geojson'
import MapView from './components/MapView'
import Sidebar from './components/Sidebar'
import Controls from './components/Controls'
import TopPicks from './components/TopPicks'
import { COMMUNITY_AREAS } from '../shared/communityAreas'
import { addOpportunities } from '../shared/scoring'
import type { AreaProperties, AreasResponse, SideName } from '../shared/types'
import { sampleResponse } from './data/sampleData'
import { colorContext, colorFor, type ColorMode } from './lib/colors'

type RawAreas = FeatureCollection<Geometry, { area_numbe: string; community: string }>

/** Real data from our weekly job, or sample data if it isn't set up yet. */
async function loadScores(): Promise<AreasResponse> {
  try {
    const r = await fetch('/api/areas')
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) throw new Error(`HTTP ${r.status}`)
    const data = (await r.json()) as AreasResponse
    if (data.isSample || Object.keys(data.areas).length === 0) throw new Error('no data collected yet')
    addOpportunities(data.areas) // recompute so formula updates apply without re-running the weekly job
    return data
  } catch {
    return sampleResponse()
  }
}

export default function App() {
  const [raw, setRaw] = useState<RawAreas | null>(null)
  const [scores, setScores] = useState<AreasResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [side, setSide] = useState<SideName | 'All'>('All')
  const [selected, setSelected] = useState<number | null>(null)
  const [focus, setFocus] = useState<{ area: number; nonce: number } | null>(null)
  const [showLabels, setShowLabels] = useState(true)
  const [colorMode, setColorMode] = useState<ColorMode>('signal')
  const [picksOpen, setPicksOpen] = useState(() => window.innerWidth >= 640)

  useEffect(() => {
    fetch('/data/community-areas.geojson')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setRaw)
      .catch((e) => setError(String(e)))
    loadScores().then(setScores)
  }, [])

  const ctx = useMemo(() => (scores ? colorContext(scores.areas) : null), [scores])

  // Attach name, side and color to every boundary shape.
  const areas = useMemo(() => {
    if (!raw || !scores || !ctx) return null
    const features = raw.features.map((f) => {
      const areaNumber = Number(f.properties.area_numbe)
      const info = COMMUNITY_AREAS[areaNumber]
      const { color, opacity } = colorFor(colorMode, scores.areas[areaNumber], ctx)
      const properties: AreaProperties = { areaNumber, name: info.name, side: info.side, fillColor: color, fillOpacity: opacity }
      return { ...f, properties }
    })
    return { type: 'FeatureCollection', features } as FeatureCollection<Geometry, AreaProperties>
  }, [raw, scores, ctx, colorMode])

  // If a side filter hides the selected area, close the sidebar.
  useEffect(() => {
    if (selected !== null && side !== 'All' && COMMUNITY_AREAS[selected].side !== side) setSelected(null)
  }, [side, selected])

  if (error) {
    return <div className="grid h-full place-items-center text-red-400">Could not load map data: {error}</div>
  }

  const status = !scores ? 'Loading…' : scores.isSample ? 'Sample data · real data not collected yet' : `Chicago · updated ${scores.updatedAt}`

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-950">
      {areas ? (
        <MapView areas={areas} side={side} selected={selected} showLabels={showLabels} focus={focus} onSelect={setSelected} />
      ) : (
        <div className="grid h-full place-items-center text-slate-400">Loading map…</div>
      )}
      <Controls
        side={side}
        onSideChange={setSide}
        colorMode={colorMode}
        onColorModeChange={setColorMode}
        showLabels={showLabels}
        onShowLabelsChange={setShowLabels}
        status={status}
        isSample={!!scores?.isSample}
        shifted={selected !== null}
        picksOpen={picksOpen}
        onOpenPicks={() => setPicksOpen(true)}
      />
      {scores && picksOpen && (
        <TopPicks
          areas={scores.areas}
          side={side}
          onClose={() => setPicksOpen(false)}
          onPick={(n) => {
            setSelected(n)
            setFocus({ area: n, nonce: Date.now() })
            if (window.innerWidth < 640) setPicksOpen(false)
          }}
        />
      )}
      {selected !== null && (
        <Sidebar
          key={selected}
          name={COMMUNITY_AREAS[selected].name}
          side={COMMUNITY_AREAS[selected].side}
          data={scores?.areas[selected]}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
