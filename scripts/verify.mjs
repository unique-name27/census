#!/usr/bin/env node
// Census quality gate: type-check, lint, unit tests, app build and the one-file build.
//   npm run verify
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const steps = [
  ['Type-check', 'npx tsc --noEmit -p .'],
  ['Lint', 'npx biome check src'],
  ['Unit tests', 'npx vitest run'],
  ['App build', 'npm run build'],
  ['One-file build', 'node --max-semi-space-size=64 node_modules/vite/bin/vite.js build --mode single'],
]

const results = steps.map(([name, cmd]) => {
  const t = Date.now()
  process.stdout.write(`\n▶ ${name}\n`)
  const r = spawnSync(cmd, { cwd: root, shell: true, stdio: 'inherit' })
  return { name, ok: r.status === 0, secs: ((Date.now() - t) / 1000).toFixed(1) }
})

console.log('\nCensus verification')
for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name} (${r.secs}s)`)
process.exit(results.every((r) => r.ok) ? 0 : 1)
