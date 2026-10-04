import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { datasetDef } from '../schema'
import { autoMap, withChoice } from './automap'
import {
  applyProfile,
  deleteProfile,
  forgetAllProfiles,
  forgetLearnedSynonyms,
  headerFingerprint,
  learnSynonym,
  loadLearnedSynonyms,
  loadProfile,
  makeProfile,
  saveProfile,
} from './profiles'

const idb = vi.hoisted(() => new Map<string, unknown>())
const blocked = vi.hoisted(() => ({ on: false }))
vi.mock('idb-keyval', () => ({
  get: async (k: string) => idb.get(k),
  set: async (k: string, v: unknown) => {
    idb.set(k, structuredClone(v))
  },
  del: async (k: string) => {
    idb.delete(k)
  },
  delMany: async (ks: string[]) => {
    for (const k of ks) idb.delete(k)
  },
  keys: async () => {
    if (blocked.on) throw new Error('Storage is blocked')
    return [...idb.keys()]
  },
}))

class MemoryStorage {
  private m = new Map<string, string>()
  getItem(k: string) {
    return this.m.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.m.set(k, v)
  }
  removeItem(k: string) {
    this.m.delete(k)
  }
}

beforeEach(() => {
  idb.clear()
  vi.stubGlobal('localStorage', new MemoryStorage())
})
afterEach(() => vi.unstubAllGlobals())

describe('headerFingerprint', () => {
  it('ignores order, case, spacing and punctuation but not the words', () => {
    const a = headerFingerprint(['Employee ID', 'Hire Date', 'Name'])
    expect(a).toMatch(/^[0-9a-f]{8}$/)
    expect(headerFingerprint(['name', 'hire_date', 'EMPLOYEE  ID'])).toBe(a)
    expect(headerFingerprint(['Employee ID', 'Hire Date'])).not.toBe(a)
  })
})

describe('mapping profiles', () => {
  const def = datasetDef('employees')
  const headers = ['Worker', 'Start', 'Boss', 'Joined']

  it('round-trips user choices and date orders through storage', async () => {
    let mapping = autoMap(headers, [], def)
    mapping = withChoice(mapping, 'employeeId', 'Worker')
    mapping = withChoice(mapping, 'hireDate', 'Joined')
    mapping = withChoice(mapping, 'managerId', 'Boss')
    const profile = makeProfile('employees', headers, mapping, { dateOrders: { Joined: 'DMY' } })
    await saveProfile(profile)
    expect([...idb.keys()]).toEqual([`census:profile:employees:${profile.fingerprint}`])

    // Same layout, different spelling and order: the saved choices come back.
    const again = ['joined', 'BOSS', 'worker', 'start']
    const loaded = await loadProfile('employees', again)
    expect(loaded).not.toBe(null)
    const { mapping: m, options } = applyProfile(loaded!, again, def)
    expect(m.employeeId).toEqual({
      header: 'worker',
      confidence: 'high',
      score: 1,
      reason: 'Saved from your last import of this layout',
    })
    expect(m.hireDate.header).toBe('joined')
    expect(m.managerId.header).toBe('BOSS')
    expect(options.dateOrders).toEqual({ joined: 'DMY' })

    expect(await loadProfile('requisitions', again)).toBe(null)
    await deleteProfile('employees', profile.fingerprint)
    expect(await loadProfile('employees', again)).toBe(null)
  })

  it('ignores corrupt stored values', async () => {
    idb.set(`census:profile:employees:${headerFingerprint(headers)}`, { version: 99 })
    expect(await loadProfile('employees', headers)).toBe(null)
  })
})

describe('learned synonyms', () => {
  it('remembers header picks per dataset', () => {
    expect(loadLearnedSynonyms('comp')).toEqual({})
    learnSynonym('comp', 'Annual Pay (Local)', 'baseSalary')
    learnSynonym('comp', 'Worker #', 'employeeId')
    expect(loadLearnedSynonyms('comp')).toEqual({
      'annual pay local': 'baseSalary',
      'worker number': 'employeeId',
    })
    expect(loadLearnedSynonyms('employees')).toEqual({})
    const m = autoMap(
      ['Worker #', 'Annual Pay (Local)', 'Range mid'],
      [],
      datasetDef('comp'),
      loadLearnedSynonyms('comp'),
    )
    expect(m.baseSalary.reason).toBe('You chose this column before')
    forgetLearnedSynonyms('comp')
    expect(loadLearnedSynonyms('comp')).toEqual({})
  })

  it('works without storage', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(() => learnSynonym('comp', 'x', 'baseSalary')).not.toThrow()
    expect(loadLearnedSynonyms('comp')).toEqual({})
  })
})

describe('forgetAllProfiles', () => {
  const save = (dataset: 'employees' | 'comp', headers: string[]) =>
    saveProfile(makeProfile(dataset, headers, autoMap(headers, [], datasetDef(dataset))))

  it('removes every saved layout and learned pick, and nothing else', async () => {
    await save('employees', ['Worker', 'Joined'])
    await save('employees', ['Employee ID', 'Hire date', 'Manager'])
    await save('comp', ['Employee ID', 'Base salary'])
    idb.set('census:dataset:employees', { rows: [] })
    learnSynonym('comp', 'Annual Pay', 'baseSalary')
    learnSynonym('employees', 'Worker', 'employeeId')
    localStorage.setItem('census:theme', '"dark"')

    expect(await forgetAllProfiles()).toBe(3)
    expect([...idb.keys()]).toEqual(['census:dataset:employees'])
    expect(await loadProfile('employees', ['Worker', 'Joined'])).toBe(null)
    expect(loadLearnedSynonyms('comp')).toEqual({})
    expect(loadLearnedSynonyms('employees')).toEqual({})
    expect(localStorage.getItem('census:theme')).toBe('"dark"')
    expect(await forgetAllProfiles()).toBe(0)
  })

  it('can keep learned picks', async () => {
    await save('comp', ['Employee ID', 'Base salary'])
    learnSynonym('comp', 'Annual Pay', 'baseSalary')
    expect(await forgetAllProfiles({ synonyms: false })).toBe(1)
    expect(loadLearnedSynonyms('comp')).toEqual({ 'annual pay': 'baseSalary' })
  })

  it('works without storage', async () => {
    vi.stubGlobal('localStorage', undefined)
    blocked.on = true
    try {
      expect(await forgetAllProfiles()).toBe(0)
    } finally {
      blocked.on = false
    }
  })
})
