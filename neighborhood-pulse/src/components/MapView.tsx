import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, Map as MapLibreMap, StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// MapLibre does its heavy lifting in a background "worker" script; tell it where Vite put that file.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import type { FeatureCollection, Geometry } from 'geojson'
import type { AreaProperties, SideName } from '../types'

// Esri World Imagery: free, high-resolution satellite tiles, no API key needed.
// The optional labels layer adds street & place names on top of the imagery.
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services'
const STYLE: StyleSpecification = {
  version: 8,
  sources: {
    satellite: {
      type: 'raster',
      tiles: [`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    },
    labels: {
      type: 'raster',
      tiles: [
        `${ESRI}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}`,
      ],
      tileSize: 256,
      maxzoom: 19,
    },
    places: {
      type: 'raster',
      tiles: [`${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`],
      tileSize: 256,
      maxzoom: 19,
    },
  },
  layers: [
    { id: 'satellite', type: 'raster', source: 'satellite' },
    { id: 'labels', type: 'raster', source: 'labels', paint: { 'raster-opacity': 0.55 } },
    { id: 'places', type: 'raster', source: 'places', paint: { 'raster-opacity': 0.8 } },
  ],
}

maplibregl.setWorkerUrl(workerUrl)

const CHICAGO_BOUNDS: [number, number, number, number] = [-87.94, 41.644, -87.524, 42.023]

type Areas = FeatureCollection<Geometry, AreaProperties>

interface Props {
  areas: Areas
  side: SideName | 'All'
  selected: number | null
  showLabels: boolean
  onSelect: (areaNumber: number | null) => void
}

export default function MapView({ areas, side, selected, showLabels, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [hover, setHover] = useState<{ name: string; x: number; y: number } | null>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const hoveredIdRef = useRef<number | null>(null)

  const clearHover = () => {
    const map = mapRef.current
    if (map && hoveredIdRef.current !== null) {
      map.setFeatureState({ source: 'areas', id: hoveredIdRef.current }, { hover: false })
    }
    hoveredIdRef.current = null
    setHover(null)
  }

  // 1. Create the map once.
  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current!,
      style: STYLE,
      bounds: CHICAGO_BOUNDS,
      fitBoundsOptions: { padding: 40 },
      attributionControl: { compact: true },
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'bottom-right')

    map.on('load', () => {
      map.addSource('areas', { type: 'geojson', data: areas, promoteId: 'areaNumber' })

      // Semi-transparent colored zones
      map.addLayer({
        id: 'area-fill',
        type: 'fill',
        source: 'areas',
        paint: {
          'fill-color': ['get', 'fillColor'],
          'fill-opacity': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            ['min', 0.85, ['+', ['get', 'fillOpacity'], 0.2]],
            ['get', 'fillOpacity'],
          ],
        },
      })
      // Thin outlines
      map.addLayer({
        id: 'area-outline',
        type: 'line',
        source: 'areas',
        paint: { 'line-color': '#ffffff', 'line-opacity': 0.75, 'line-width': 1 },
      })
      // Thicker outline on hover / selection
      map.addLayer({
        id: 'area-highlight',
        type: 'line',
        source: 'areas',
        paint: {
          'line-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#facc15', '#ffffff'],
          'line-width': [
            'case',
            ['boolean', ['feature-state', 'selected'], false], 3,
            ['boolean', ['feature-state', 'hover'], false], 2.5,
            0,
          ],
        },
      })

      map.on('mousemove', 'area-fill', (e) => {
        const f = e.features?.[0]
        if (!f) return
        const id = f.properties.areaNumber as number
        if (id !== hoveredIdRef.current) {
          clearHover()
          hoveredIdRef.current = id
          map.setFeatureState({ source: 'areas', id }, { hover: true })
        }
        map.getCanvas().style.cursor = 'pointer'
        setHover({ name: f.properties.name as string, x: e.point.x, y: e.point.y })
      })
      map.on('mouseleave', 'area-fill', () => {
        clearHover()
        map.getCanvas().style.cursor = ''
      })
      map.on('click', (e) => {
        const f = map.queryRenderedFeatures(e.point, { layers: ['area-fill'] })[0]
        onSelectRef.current(f ? (f.properties.areaNumber as number) : null)
      })

      setLoaded(true)
    })

    return () => map.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 2. Keep data in sync (later phases will refresh scores).
  useEffect(() => {
    if (!loaded) return
    ;(mapRef.current!.getSource('areas') as GeoJSONSource).setData(areas)
  }, [areas, loaded])

  // 3. Sides filter: show only one side and zoom to it.
  useEffect(() => {
    const map = mapRef.current
    if (!loaded || !map) return
    const filter = side === 'All' ? null : (['==', ['get', 'side'], side] as maplibregl.FilterSpecification)
    for (const id of ['area-fill', 'area-outline', 'area-highlight']) map.setFilter(id, filter)
    clearHover() // the area under the mouse may have just been hidden

    const feats = side === 'All' ? areas.features : areas.features.filter((f) => f.properties.side === side)
    const bounds = new maplibregl.LngLatBounds()
    for (const f of feats) eachCoord(f.geometry, (c) => bounds.extend(c as [number, number]))
    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 60, duration: 800 })
  }, [side, loaded, areas])

  // 4. Highlight the selected area.
  useEffect(() => {
    const map = mapRef.current
    if (!loaded || !map || selected === null) return
    map.setFeatureState({ source: 'areas', id: selected }, { selected: true })
    return () => {
      map.setFeatureState({ source: 'areas', id: selected }, { selected: false })
    }
  }, [selected, loaded])

  // 5. Toggle street/place labels.
  useEffect(() => {
    const map = mapRef.current
    if (!loaded || !map) return
    for (const id of ['labels', 'places']) map.setLayoutProperty(id, 'visibility', showLabels ? 'visible' : 'none')
  }, [showLabels, loaded])

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full" />
      {hover && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md bg-black/80 px-2.5 py-1 text-sm font-medium text-white shadow-lg ring-1 ring-white/15 backdrop-blur"
          style={{ left: hover.x, top: hover.y - 12 }}
        >
          {hover.name}
        </div>
      )}
    </div>
  )
}

function eachCoord(g: Geometry, fn: (c: number[]) => void) {
  if (g.type === 'Polygon') g.coordinates.forEach((ring) => ring.forEach(fn))
  else if (g.type === 'MultiPolygon') g.coordinates.forEach((p) => p.forEach((ring) => ring.forEach(fn)))
}
