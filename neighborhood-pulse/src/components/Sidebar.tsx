import type { NeighborhoodScore, SideName } from '../types'
import { COLORS, signalFor, signalLabel } from '../lib/colors'

interface Props {
  name: string
  side: SideName
  data: NeighborhoodScore
  onClose: () => void
}

export default function Sidebar({ name, side, data, onClose }: Props) {
  const signal = signalFor(data.score, data.confidence)
  const color = signal === 'improving' ? COLORS.green : signal === 'declining' ? COLORS.red : '#9ca3af'
  const { thisYear, lastYear, monthly } = data.permits
  const change = Math.round(((thisYear - lastYear) / lastYear) * 100)

  return (
    <aside className="absolute inset-y-0 left-0 z-20 flex w-full flex-col overflow-y-auto bg-slate-950/92 text-slate-100 shadow-2xl ring-1 ring-white/10 backdrop-blur-md sm:w-[400px]">
      <header className="sticky top-0 flex items-start justify-between gap-3 border-b border-white/10 bg-slate-950/95 px-5 py-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-400">{side} Side</p>
          <h2 className="text-2xl font-semibold leading-tight">{name}</h2>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
        >
          ✕
        </button>
      </header>

      <div className="space-y-6 px-5 py-5">
        {/* Score */}
        <section className="flex items-center gap-4">
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl text-xl font-bold tabular-nums"
            style={{ backgroundColor: `${color}33`, color, boxShadow: `inset 0 0 0 2px ${color}` }}
          >
            {data.score > 0 ? '+' : ''}
            {data.score}
          </div>
          <div>
            <p className="font-medium" style={{ color }}>
              {signalLabel(signal)}
            </p>
            <p className="text-sm text-slate-400">
              Score −100 to +100 · <span className="capitalize">{data.confidence}</span> confidence
            </p>
            {data.confidence === 'low' && (
              <p className="mt-1 text-xs text-slate-500">Low confidence is shown as neutral on the map.</p>
            )}
          </div>
        </section>

        {/* Summary */}
        <section>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Why</h3>
          <p className="text-[15px] leading-relaxed text-slate-200">{data.summary}</p>
        </section>

        {/* Permits */}
        <section>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Building permits (last 12 months)
          </h3>
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-semibold tabular-nums">{thisYear}</span>
            <span className={`text-sm font-medium ${change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {change >= 0 ? '▲' : '▼'} {Math.abs(change)}% vs prior year ({lastYear})
            </span>
          </div>
          <Sparkline values={monthly} color={change >= 0 ? COLORS.green : COLORS.red} />
        </section>

        {/* Headlines */}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Key headlines</h3>
          <ul className="space-y-2.5">
            {data.headlines.map((h, i) => (
              <li key={i}>
                <a
                  href={h.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-lg bg-white/5 px-3 py-2.5 ring-1 ring-white/5 hover:bg-white/10"
                >
                  <p className="text-sm font-medium leading-snug text-slate-100">{h.title}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {h.source} · {h.date}
                  </p>
                </a>
              </li>
            ))}
          </ul>
        </section>

        <p className="border-t border-white/10 pt-4 text-xs text-slate-500">Last updated {data.lastUpdated}</p>
      </div>
    </aside>
  )
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const w = 340
  const h = 48
  const max = Math.max(...values, 1)
  const step = w / (values.length - 1)
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * (h - 4) - 2).toFixed(1)}`)
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 h-12 w-full" preserveAspectRatio="none" aria-hidden>
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
