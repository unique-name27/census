/**
 * Storage keys (docs/ROLES.md, 6.8 test 7): `STORAGE_KEYS` covers every `census:` key literal in
 * src/ (a source scan), and the Ask key's value is never shown, copied or listed.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  canCopyValue,
  describeKey,
  NOT_STORAGE_NAMES,
  STORAGE_KEYS,
  safeValue,
  storageRows,
  storageTotals,
} from './storageKeys'

/** Every .ts and .tsx file under src, except tests. */
function sources(dir = join(__dirname, '..'), out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (name === '__snapshots__' || name === 'zz-tmp') continue
      sources(p, out)
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

/**
 * The `census:` names written in the source as string literals: "census:mode", the fixed head of a
 * template ("census:dataset:" from `census:dataset:${k}`), and prefixes joined to a variable
 * ("census:org:" + k).
 */
function literalNames(): Set<string> {
  const out = new Set<string>()
  for (const p of sources()) {
    const text = readFileSync(p, 'utf8')
    for (const m of text.matchAll(/['"`](census:[A-Za-z0-9:_./-]*)(\$\{|['"`])/g)) out.add(m[1])
  }
  return out
}

const exactlyKnown = (name: string): boolean =>
  !!describeKey(name) ||
  NOT_STORAGE_NAMES.some((n) => n.name === name) ||
  STORAGE_KEYS.some((d) => d.key === name)

/**
 * A name is known when it, or the family it starts with, is listed: "census:dataset:" is the
 * IndexedDB prefix, "census:headline:hrbp" one of the "census:headline" measures.
 */
const known = (name: string): boolean => {
  const parts = name.split(':')
  for (let i = parts.length; i >= 2; i--) {
    const head = parts.slice(0, i).join(':')
    if (exactlyKnown(head) || exactlyKnown(`${head}:`)) return true
  }
  return false
}

describe('storage keys', () => {
  it('describes every census: key literal in the source', () => {
    const names = literalNames()
    // The scan finds the keys it should (it is not vacuous).
    for (const k of ['census:mode', 'census:settings', 'census:ask-key', 'census:dev', 'census:dataset:'])
      expect(names, k).toContain(k)
    const unknown = [...names].filter((n) => !known(n))
    expect(unknown).toEqual([])
  })

  it('lists every key once, each with where and what', () => {
    const keys = STORAGE_KEYS.map((d) => d.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const d of STORAGE_KEYS) {
      expect(d.key.startsWith('census:'), d.key).toBe(true)
      expect(d.holds.trim(), d.key).not.toBe('')
      expect(d.where.length, d.key).toBeGreaterThan(0)
      expect(d.holds.includes('—'), d.key).toBe(false)
    }
  })

  it('describes keys by exact name or the longest prefix', () => {
    expect(describeKey('census:mode')?.key).toBe('census:mode')
    expect(describeKey('census:org:jump')?.where).toEqual(['sessionStorage'])
    expect(describeKey('census:org:prefs')?.key).toBe('census:org:')
    expect(describeKey('census:dataset:employees')?.where).toEqual(['IndexedDB'])
    expect(describeKey('census:raw:employees:v1')?.key).toBe('census:raw:')
    expect(describeKey('census:nope')).toBeNull()
  })

  it('never shows or copies the Ask key, and cuts the workspace ID', () => {
    const secret = 'sk-ant-test-abcdefghijklmnop'
    expect(safeValue('census:ask-key', secret)).toBe('set')
    expect(safeValue('census:ask-key', null)).toBe('not set')
    expect(canCopyValue('census:ask-key')).toBe(false)
    expect(safeValue('census:ask-workspace', 'wrkspc_01abcdef')).toBe('wrkspc_…')
    expect(canCopyValue('census:views')).toBe(true)
    const rows = storageRows({
      local: [
        { key: 'census:ask-key', value: secret },
        { key: 'census:views', value: '{"v":1}' },
        { key: 'other:thing', value: 'x' },
      ],
      session: [{ key: 'census:ask-key', value: secret }],
      indexedDb: [{ key: 'census:dataset:employees', bytes: 1200 }],
    })
    expect(JSON.stringify(rows).includes(secret)).toBe(false)
    expect(rows.map((r) => r.key).sort()).toEqual([
      'census:ask-key',
      'census:ask-key',
      'census:dataset:employees',
      'census:views',
    ])
    expect(rows.find((r) => r.key === 'census:ask-key')?.secret).toBe(true)
    // Biggest first; web storage counts two bytes a character.
    expect(rows[0].key).toBe('census:dataset:employees')
    expect(rows.find((r) => r.key === 'census:views')?.bytes).toBe(('census:views'.length + 7) * 2)
    const totals = storageTotals(rows)
    expect(totals.IndexedDB).toBe(1200)
    expect(totals.localStorage).toBeGreaterThan(0)
  })

  it('marks keys Census does not describe', () => {
    const rows = storageRows({ local: [{ key: 'census:mystery', value: '1' }], session: [], indexedDb: [] })
    expect(rows[0]).toMatchObject({ unknown: true, holds: 'Not described' })
  })
})
