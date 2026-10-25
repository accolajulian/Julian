import { useState } from 'react'
import { COMMUNITY_AREAS } from '../../shared/communityAreas'
import type { NeighborhoodScore, SideName } from '../../shared/types'

const BUDGETS = [
  { label: 'Any price', max: Infinity },
  { label: 'Under $200k', max: 200_000 },
  { label: 'Under $300k', max: 300_000 },
  { label: 'Under $400k', max: 400_000 },
  { label: 'Under $500k', max: 500_000 },
  { label: 'Under $750k', max: 750_000 },
]

interface Props {
  areas: Record<number, NeighborhoodScore>
  side: SideName | 'All'
  onPick: (areaNumber: number) => void
  onClose: () => void
}

export default function TopPicks({ areas, side, onPick, onClose }: Props) {
  const [budget, setBudget] = useState(0)

  const picks = Object.values(areas)
    .filter((s) => s.opportunity && s.metrics.prices)
    .filter((s) => side === 'All' || COMMUNITY_AREAS[s.areaNumber].side === side)
    .filter((s) => s.metrics.prices!.typicalValue <= BUDGETS[budget].max)
    .sort((a, b) => b.opportunity!.score - a.opportunity!.score)
    .slice(0, 3)

  return (
    <div className="absolute bottom-4 right-4 z-10 w-[calc(100%-2rem)] rounded-xl sm:bottom-auto sm:top-4 bg-slate-950/90 p-3 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur sm:w-80">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">🔥 Top 3 opportunities</h2>
        <button onClick={onClose} aria-label="Hide top picks" className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white">
          ✕
        </button>
      </div>
      <p className="mt-0.5 text-[11px] text-slate-400">
        Affordable areas that are improving (green) and building{side !== 'All' ? ` · ${side} Side` : ''}
      </p>
      <select
        value={budget}
        onChange={(e) => setBudget(Number(e.target.value))}
        className="mt-2 w-full rounded-md bg-white/5 px-2 py-1.5 text-sm outline-none ring-1 ring-white/10 [&>option]:bg-slate-900"
      >
        {BUDGETS.map((b, i) => (
          <option key={b.label} value={i}>
            Typical home: {b.label}
          </option>
        ))}
      </select>

      <ol className="mt-2 space-y-2">
        {picks.length === 0 && <li className="py-2 text-sm text-slate-400">No improving areas match. Try a higher budget or another side.</li>}
        {picks.map((s, i) => (
          <li key={s.areaNumber}>
            <button
              onClick={() => onPick(s.areaNumber)}
              className="w-full rounded-lg bg-white/5 px-3 py-2 text-left ring-1 ring-white/5 transition hover:bg-white/10"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">
                  <span className="mr-1.5 text-slate-500">{i + 1}.</span>
                  {COMMUNITY_AREAS[s.areaNumber].name}
                </span>
                <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-amber-300">
                  {s.opportunity!.score}
                </span>
              </div>
              <ul className="mt-1 space-y-0.5 text-xs text-slate-400">
                {s.opportunity!.reasons.slice(0, 2).map((r) => (
                  <li key={r}>• {r}</li>
                ))}
              </ul>
            </button>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[10px] leading-snug text-slate-500">
        Score = 40% momentum + 35% affordability + 25% construction pipeline. A starting point for research, not a forecast.
      </p>
    </div>
  )
}
