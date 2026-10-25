// Test the data collection from your own computer (nothing is saved):
//   npm run collect
import { COMMUNITY_AREAS } from '../shared/communityAreas.js'
import { fmtMoney } from '../shared/format.js'
import { buildScores } from '../shared/scoring.js'
import { collectAll } from '../api/_lib/sources.js'

const t0 = Date.now()
const { metrics, status } = await collectAll()
console.log('\nData sources:')
for (const [name, s] of Object.entries(status)) {
  console.log(`  ${s.ok ? '✅' : '❌'} ${name.padEnd(11)} ${s.ok ? `${s.rows} rows · ${s.method}` : s.error}  (${((s.ms ?? 0) / 1000).toFixed(1)}s)`)
}
for (const n of Object.keys(COMMUNITY_AREAS)) metrics[Number(n)] ??= {}
const scores = buildScores(metrics, new Date().toISOString().slice(0, 10))
const priced = Object.values(scores).filter((s) => s.metrics.prices).length
console.log(`\nHome values found for ${priced} of 77 areas.`)
console.log('\nTop opportunities:')
Object.values(scores)
  .filter((s) => s.opportunity)
  .sort((a, b) => b.opportunity!.score - a.opportunity!.score)
  .slice(0, 5)
  .forEach((s, i) =>
    console.log(`  ${i + 1}. ${COMMUNITY_AREAS[s.areaNumber].name} (${s.opportunity!.score}) — ${fmtMoney(s.metrics.prices?.typicalValue)}, score ${s.score}`),
  )
console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(0)}s`)
