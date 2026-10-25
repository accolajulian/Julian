import { useState, type ReactNode } from 'react'
import { fmtMoney, fmtNum, fmtPct, pctChange } from '../../shared/format'
import type { CountTrend, NeighborhoodScore, SideName } from '../../shared/types'
import { COLORS, signalFor, signalLabel } from '../lib/colors'
import { BarChart, LineChart } from './Charts'

interface Props {
  name: string
  side: SideName
  data: NeighborhoodScore | undefined
  onClose: () => void
}

const TABS = ['Overview', 'Prices', 'Activity', 'Safety', 'News'] as const
type Tab = (typeof TABS)[number]

export default function Sidebar({ name, side, data, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('Overview')

  return (
    <aside className="absolute inset-y-0 left-0 z-20 flex w-full flex-col bg-slate-950/95 text-slate-100 shadow-2xl ring-1 ring-white/10 backdrop-blur-md sm:w-[400px]">
      <header className="border-b border-white/10 px-5 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-400">{side} Side</p>
            <h2 className="text-2xl font-semibold leading-tight">{name}</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white">
            ✕
          </button>
        </div>
        <nav className="-mb-px mt-3 flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`whitespace-nowrap border-b-2 px-2.5 pb-2 text-sm font-medium transition-colors ${
                tab === t ? 'border-green-400 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
        {!data ? (
          <p className="text-sm text-slate-400">No data for this area yet.</p>
        ) : tab === 'Overview' ? (
          <Overview data={data} />
        ) : tab === 'Prices' ? (
          <Prices data={data} />
        ) : tab === 'Activity' ? (
          <Activity data={data} />
        ) : tab === 'Safety' ? (
          <Safety data={data} />
        ) : (
          <News data={data} name={name} />
        )}
        {data && <p className="border-t border-white/10 pt-4 text-xs text-slate-500">Last updated {data.lastUpdated}</p>}
      </div>
    </aside>
  )
}

// ---------------------------------------------------------------- building blocks

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</h3>
      {children}
    </section>
  )
}

function Change({ value, invert = false, digits = 0 }: { value: number | null; invert?: boolean; digits?: number }) {
  if (value === null) return <span className="text-slate-500">—</span>
  const good = invert ? value < 0 : value > 0
  return (
    <span className={`font-medium ${Math.abs(value) < 0.5 ? 'text-slate-400' : good ? 'text-green-400' : 'text-red-400'}`}>
      {value >= 0 ? '▲' : '▼'} {fmtPct(value, digits).replace(/^[+−]/, '')}
    </span>
  )
}

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-lg bg-white/5 px-3 py-2.5 ring-1 ring-white/5">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  )
}

function TrendBlock({ title, t, color, invert = false }: { title: string; t: CountTrend; color: string; invert?: boolean }) {
  return (
    <Section title={title}>
      <div className="flex items-baseline gap-3">
        <span className="text-2xl font-semibold tabular-nums">{fmtNum(t.last12)}</span>
        <span className="text-sm">
          <Change value={pctChange(t.last12, t.prev12)} invert={invert} /> <span className="text-slate-400">vs prior year ({fmtNum(t.prev12)})</span>
        </span>
      </div>
      <BarChart points={t.monthly} color={color} />
    </Section>
  )
}

const Missing = ({ what }: { what: string }) => <p className="text-sm text-slate-500">{what} isn’t available for this area yet.</p>

// ---------------------------------------------------------------- tabs

function Overview({ data }: { data: NeighborhoodScore }) {
  const signal = signalFor(data.score, data.confidence)
  const color = signal === 'improving' ? COLORS.green : signal === 'declining' ? COLORS.red : '#9ca3af'
  return (
    <>
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
          {data.confidence === 'low' && <p className="mt-1 text-xs text-slate-500">Low confidence is shown as neutral on the map.</p>}
        </div>
      </section>

      <Section title="Why">
        <p className="text-[15px] leading-relaxed text-slate-200">{data.summary}</p>
      </Section>

      {data.components.length > 0 && (
        <Section title="What’s driving the score (vs. all of Chicago)">
          <ul className="space-y-2.5">
            {data.components.map((c) => (
              <li key={c.key}>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-200">{c.label}</span>
                  <span className="tabular-nums text-slate-400">
                    {fmtPct(c.areaChange)} <span className="text-slate-500">· city {fmtPct(c.cityChange)}</span>
                  </span>
                </div>
                <div className="relative mt-1 h-1.5 rounded-full bg-white/10">
                  <div className="absolute inset-y-0 left-1/2 w-px bg-white/30" />
                  <div
                    className="absolute inset-y-0 rounded-full"
                    style={{
                      left: c.contribution >= 0 ? '50%' : `${50 + c.contribution * 50}%`,
                      width: `${Math.abs(c.contribution) * 50}%`,
                      backgroundColor: c.contribution >= 0 ? COLORS.green : COLORS.red,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {data.opportunity && (
        <Section title="Opportunity score">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums text-amber-400">{data.opportunity.score}</span>
            <span className="text-sm text-slate-400">/ 100</span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
            {(
              [
                ['Momentum', data.opportunity.momentum],
                ['Affordability', data.opportunity.affordability],
                ['Pipeline', data.opportunity.pipeline],
              ] as const
            ).map(([label, v]) => (
              <div key={label} className="rounded-md bg-white/5 py-2">
                <p className="text-base font-semibold tabular-nums">{Math.round(v * 100)}</p>
                <p className="text-slate-400">{label}</p>
              </div>
            ))}
          </div>
        </Section>
      )}
    </>
  )
}

function Prices({ data }: { data: NeighborhoodScore }) {
  const p = data.metrics.prices
  if (!p) return <Missing what="Home value data" />
  return (
    <>
      <Section title="Typical home value">
        <p className="text-3xl font-semibold tabular-nums">{fmtMoney(p.typicalValue)}</p>
        <p className="text-xs text-slate-500">Zillow Home Value Index, {p.asOf}</p>
      </Section>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="1 month" value={<Change value={p.change1m} digits={1} />} />
        <Stat label="1 year" value={<Change value={p.change1y} digits={1} />} />
        <Stat label="5 years" value={<Change value={p.change5y} />} />
      </div>
      <Section title="Last 5 years">
        <LineChart points={p.monthly} color={COLORS.blue} format={fmtMoney} />
      </Section>
      <p className="text-xs text-slate-500">
        Based on Zillow neighborhood{p.matchedNeighborhoods.length > 1 ? 's' : ''}: {p.matchedNeighborhoods.join(', ')}. Data: Zillow.
      </p>
    </>
  )
}

function Activity({ data }: { data: NeighborhoodScore }) {
  const { permits, businesses } = data.metrics
  return (
    <>
      {permits ? (
        <>
          <TrendBlock title="Building permits (last 12 months)" t={permits} color={COLORS.green} />
          <div className="grid grid-cols-3 gap-2">
            <Stat label="New builds" value={fmtNum(permits.newConstruction12)} />
            <Stat label="Renovations" value={fmtNum(permits.renovation12)} />
            <Stat label="Demolitions" value={fmtNum(permits.demolition12)} />
          </div>
          <Stat
            label="Reported construction value"
            value={fmtMoney(permits.value12)}
            sub={
              <>
                <Change value={pctChange(permits.value12, permits.valuePrev12)} /> vs prior year ({fmtMoney(permits.valuePrev12)})
              </>
            }
          />
        </>
      ) : (
        <Missing what="Permit data" />
      )}
      {businesses ? (
        <TrendBlock title="New business licenses (last 12 months)" t={businesses} color={COLORS.amber} />
      ) : (
        <Missing what="Business license data" />
      )}
    </>
  )
}

function Safety({ data }: { data: NeighborhoodScore }) {
  const { crime, vacancy } = data.metrics
  return (
    <>
      {crime ? (
        <>
          <TrendBlock title="Reported crimes (last 12 months)" t={crime} color={COLORS.red} invert />
          <Stat
            label="Violent crimes"
            value={fmtNum(crime.violent12)}
            sub={
              <>
                <Change value={pctChange(crime.violent12, crime.violentPrev12)} invert /> vs prior year ({fmtNum(crime.violentPrev12)})
              </>
            }
          />
        </>
      ) : (
        <Missing what="Crime data" />
      )}
      {vacancy ? (
        <TrendBlock title="Vacant / abandoned building complaints (311)" t={vacancy} color="#a78bfa" invert />
      ) : (
        <Missing what="Vacant-building data" />
      )}
    </>
  )
}

function News({ data, name }: { data: NeighborhoodScore; name: string }) {
  const search = `https://news.google.com/search?q=${encodeURIComponent(`"${name}" Chicago`)}`
  return (
    <>
      {data.headlines.length > 0 ? (
        <ul className="space-y-2.5">
          {data.headlines.map((h, i) => (
            <li key={i}>
              <a href={h.url} target="_blank" rel="noreferrer" className="block rounded-lg bg-white/5 px-3 py-2.5 ring-1 ring-white/5 hover:bg-white/10">
                <p className="text-sm font-medium leading-snug text-slate-100">{h.title}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {h.source} · {h.date}
                </p>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-400">Automatic news tracking and AI summaries arrive in Phase 3.</p>
      )}
      <a href={search} target="_blank" rel="noreferrer" className="inline-block text-sm text-sky-400 hover:underline">
        Search Google News for {name} →
      </a>
    </>
  )
}
