import { SIDES } from '../../shared/communityAreas'
import type { SideName } from '../../shared/types'
import { COLOR_MODES, COLORS, type ColorMode } from '../lib/colors'

interface Props {
  side: SideName | 'All'
  onSideChange: (side: SideName | 'All') => void
  colorMode: ColorMode
  onColorModeChange: (m: ColorMode) => void
  showLabels: boolean
  onShowLabelsChange: (v: boolean) => void
  status: string
  isSample: boolean
  shifted: boolean
  picksOpen: boolean
  onOpenPicks: () => void
}

const chip = 'rounded-lg bg-slate-950/85 px-3 py-2 text-sm text-white shadow-lg ring-1 ring-white/10 backdrop-blur'
const select = 'cursor-pointer bg-transparent font-medium outline-none [&>option]:bg-slate-900'

export default function Controls(p: Props) {
  const mode = COLOR_MODES.find((m) => m.id === p.colorMode)!
  const gradient =
    mode.kind === 'diverging'
      ? `linear-gradient(to right, ${COLORS.red}, ${COLORS.neutral}, ${COLORS.green})`
      : `linear-gradient(to right, ${COLORS.neutral}44, ${p.colorMode === 'price' ? COLORS.blue : COLORS.amber})`

  return (
    <>
      <div
        className={`absolute right-4 top-4 z-10 flex flex-wrap items-center gap-2 transition-[left] duration-300 sm:right-auto ${
          p.shifted
            ? `left-4 sm:left-[416px] ${p.picksOpen ? 'sm:max-w-[calc(100%-416px-22rem)]' : ''}`
            : `left-4 ${p.picksOpen ? 'sm:max-w-[calc(100%-23rem)]' : ''}`
        }`}
      >
        <div className="rounded-lg bg-slate-950/85 px-3 py-2 text-white shadow-lg ring-1 ring-white/10 backdrop-blur">
          <h1 className="text-base font-semibold leading-none">Neighborhood Pulse</h1>
          <p className={`mt-1 text-[11px] leading-none ${p.isSample ? 'text-amber-300' : 'text-slate-400'}`}>{p.status}</p>
        </div>
        <label className={`flex items-center gap-2 ${chip}`}>
          <span className="text-slate-400">Side</span>
          <select value={p.side} onChange={(e) => p.onSideChange(e.target.value as SideName | 'All')} className={select}>
            <option value="All">All of Chicago</option>
            {SIDES.map((s) => (
              <option key={s} value={s}>
                {s} Side
              </option>
            ))}
          </select>
        </label>
        <label className={`flex items-center gap-2 ${chip}`}>
          <span className="text-slate-400">Color by</span>
          <select value={p.colorMode} onChange={(e) => p.onColorModeChange(e.target.value as ColorMode)} className={select}>
            {COLOR_MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        {!p.picksOpen && (
          <button onClick={p.onOpenPicks} className={`${chip} font-medium hover:bg-slate-900`}>
            🔥 Top picks
          </button>
        )}
        <label className={`flex cursor-pointer items-center gap-2 ${chip}`}>
          <input type="checkbox" checked={p.showLabels} onChange={(e) => p.onShowLabelsChange(e.target.checked)} className="accent-green-500" />
          Labels
        </label>
      </div>

      <div
        className={`absolute bottom-14 z-10 rounded-lg bg-slate-950/85 px-3 py-2.5 text-xs text-slate-200 shadow-lg ring-1 ring-white/10 backdrop-blur transition-[left] duration-300 sm:bottom-6 ${
          p.shifted ? 'hidden sm:left-[416px] sm:block' : 'left-4'
        }`}
      >
        <p className="mb-1.5 font-medium text-slate-300">{mode.label}</p>
        <div className="mb-1.5 h-2.5 w-52 rounded-full" style={{ background: gradient }} />
        <div className="flex w-52 justify-between text-slate-400">
          {mode.legend.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-slate-500">Gray = neutral or not enough data</p>
      </div>
    </>
  )
}
