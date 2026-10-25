import type { SideName } from '../types'
import { SIDES } from '../data/communityAreas'
import { COLORS } from '../lib/colors'

interface Props {
  side: SideName | 'All'
  onSideChange: (side: SideName | 'All') => void
  showLabels: boolean
  onShowLabelsChange: (v: boolean) => void
  shifted: boolean
}

export default function Controls({ side, onSideChange, showLabels, onShowLabelsChange, shifted }: Props) {
  return (
    <>
      {/* Title + sides filter (top) */}
      <div
        className={`absolute top-4 z-10 flex flex-wrap items-center gap-2 transition-[left] duration-300 ${
          shifted ? 'left-4 sm:left-[416px]' : 'left-4'
        } right-4 sm:right-auto`}
      >
        <div className="rounded-lg bg-slate-950/85 px-3 py-2 text-white shadow-lg ring-1 ring-white/10 backdrop-blur">
          <h1 className="text-base font-semibold leading-none">Neighborhood Pulse</h1>
          <p className="mt-1 text-[11px] leading-none text-slate-400">Chicago · sample data</p>
        </div>
        <label className="flex items-center gap-2 rounded-lg bg-slate-950/85 px-3 py-2 text-sm text-white shadow-lg ring-1 ring-white/10 backdrop-blur">
          <span className="text-slate-400">Side</span>
          <select
            value={side}
            onChange={(e) => onSideChange(e.target.value as SideName | 'All')}
            className="cursor-pointer bg-transparent font-medium outline-none [&>option]:bg-slate-900"
          >
            <option value="All">All of Chicago</option>
            {SIDES.map((s) => (
              <option key={s} value={s}>
                {s} Side
              </option>
            ))}
          </select>
        </label>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-slate-950/85 px-3 py-2 text-sm text-white shadow-lg ring-1 ring-white/10 backdrop-blur">
          <input
            type="checkbox"
            checked={showLabels}
            onChange={(e) => onShowLabelsChange(e.target.checked)}
            className="accent-green-500"
          />
          Street labels
        </label>
      </div>

      {/* Legend (bottom-left) */}
      <div
        className={`absolute bottom-14 sm:bottom-6 z-10 rounded-lg bg-slate-950/85 px-3 py-2.5 text-xs text-slate-200 shadow-lg ring-1 ring-white/10 backdrop-blur transition-[left] duration-300 ${
          shifted ? 'hidden sm:block sm:left-[416px]' : 'left-4'
        }`}
      >
        <div
          className="mb-1.5 h-2.5 w-48 rounded-full"
          style={{ background: `linear-gradient(to right, ${COLORS.red}, ${COLORS.neutral}, ${COLORS.green})` }}
        />
        <div className="flex w-48 justify-between text-slate-400">
          <span>Declining</span>
          <span>Neutral</span>
          <span>Improving</span>
        </div>
        <p className="mt-1.5 text-[11px] text-slate-500">Stronger color = stronger signal</p>
      </div>
    </>
  )
}
