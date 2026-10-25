import { useEffect, useMemo, useState } from 'react'
import type { FeatureCollection, Geometry } from 'geojson'
import MapView from './components/MapView'
import Sidebar from './components/Sidebar'
import Controls from './components/Controls'
import { COMMUNITY_AREAS } from './data/communityAreas'
import { SAMPLE_SCORES } from './data/sampleScores'
import { fillFor } from './lib/colors'
import type { AreaProperties, SideName } from './types'

type RawAreas = FeatureCollection<Geometry, { area_numbe: string; community: string }>

export default function App() {
  const [raw, setRaw] = useState<RawAreas | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [side, setSide] = useState<SideName | 'All'>('All')
  const [selected, setSelected] = useState<number | null>(null)
  const [showLabels, setShowLabels] = useState(true)

  // Load the community area boundaries (saved from the Chicago Data Portal).
  useEffect(() => {
    fetch('/data/community-areas.geojson')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setRaw)
      .catch((e) => setError(String(e)))
  }, [])

  // Attach name, side, score and color to every boundary.
  const areas = useMemo(() => {
    if (!raw) return null
    const features = raw.features.map((f) => {
      const areaNumber = Number(f.properties.area_numbe)
      const info = COMMUNITY_AREAS[areaNumber]
      const s = SAMPLE_SCORES[areaNumber]
      const { color, opacity } = fillFor(s.score, s.confidence)
      const properties: AreaProperties = {
        areaNumber,
        name: info.name,
        side: info.side,
        score: s.score,
        confidence: s.confidence,
        fillColor: color,
        fillOpacity: opacity,
      }
      return { ...f, properties }
    })
    return { type: 'FeatureCollection', features } as FeatureCollection<Geometry, AreaProperties>
  }, [raw])

  // If a side filter hides the selected area, close the sidebar.
  useEffect(() => {
    if (selected !== null && side !== 'All' && COMMUNITY_AREAS[selected].side !== side) setSelected(null)
  }, [side, selected])

  if (error) {
    return <div className="grid h-full place-items-center text-red-400">Could not load map data: {error}</div>
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-950">
      {areas ? (
        <MapView areas={areas} side={side} selected={selected} showLabels={showLabels} onSelect={setSelected} />
      ) : (
        <div className="grid h-full place-items-center text-slate-400">Loading map…</div>
      )}
      <Controls
        side={side}
        onSideChange={setSide}
        showLabels={showLabels}
        onShowLabelsChange={setShowLabels}
        shifted={selected !== null}
      />
      {selected !== null && (
        <Sidebar
          name={COMMUNITY_AREAS[selected].name}
          side={COMMUNITY_AREAS[selected].side}
          data={SAMPLE_SCORES[selected]}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
