import type { MonthlyPoint } from '../../shared/types'

const monthLabel = (m: string) => {
  const [y, mo] = m.split('-')
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(mo) - 1]} ’${y.slice(2)}`
}

/** Simple line chart with start/end labels. */
export function LineChart({
  points,
  color,
  format = (v) => String(Math.round(v)),
}: {
  points: MonthlyPoint[]
  color: string
  format?: (v: number) => string
}) {
  if (points.length < 2) return <p className="text-xs text-slate-500">Not enough history yet.</p>
  const w = 340
  const h = 90
  const vals = points.map((p) => p.value)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = max - min || 1
  const x = (i: number) => (i / (points.length - 1)) * w
  const y = (v: number) => h - 6 - ((v - min) / span) * (h - 12)
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')
  return (
    <figure className="mt-2">
      <div className="relative">
        <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full" preserveAspectRatio="none" aria-hidden>
          <polygon points={`0,${h} ${line} ${w},${h}`} fill={color} opacity="0.12" />
          <polyline points={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
        <span className="absolute right-0 top-0 text-[10px] text-slate-500">{format(max)}</span>
        <span className="absolute bottom-0 right-0 text-[10px] text-slate-500">{format(min)}</span>
      </div>
      <figcaption className="mt-0.5 flex justify-between text-[10px] text-slate-500">
        <span>{monthLabel(points[0].month)}</span>
        <span>{monthLabel(points[points.length - 1].month)}</span>
      </figcaption>
    </figure>
  )
}

/** Monthly bars; the last 12 months are drawn brighter than the 12 before. */
export function BarChart({ points, color }: { points: MonthlyPoint[]; color: string }) {
  if (!points.length) return null
  const max = Math.max(...points.map((p) => p.value), 1)
  return (
    <figure className="mt-2">
      <div className="flex h-16 items-end gap-[2px]">
        {points.map((p, i) => (
          <div
            key={p.month}
            title={`${monthLabel(p.month)}: ${p.value}`}
            className="flex-1 rounded-t-sm"
            style={{
              height: `${Math.max(2, (p.value / max) * 100)}%`,
              backgroundColor: color,
              opacity: i >= points.length - 12 ? 0.9 : 0.35,
            }}
          />
        ))}
      </div>
      <figcaption className="mt-0.5 flex justify-between text-[10px] text-slate-500">
        <span>{monthLabel(points[0].month)}</span>
        <span>previous 12 mo · last 12 mo</span>
        <span>{monthLabel(points[points.length - 1].month)}</span>
      </figcaption>
    </figure>
  )
}
