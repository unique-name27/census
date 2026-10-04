import { describe, expect, it } from 'vitest'
import type { RuleResult } from '@/data/quality'
import { certifyOutcomeText, draftsOff, newControlDraft, readiness, revokeText } from './certify'

const rule = (id: RuleResult['id'], gate: RuleResult['gate'], pass: boolean): RuleResult => ({
  id,
  label: id === 'fresh' ? 'Fresh' : id,
  gate,
  pass,
  detail: '',
  count: 0,
  rows: [],
})

const SILVER: RuleResult[] = [
  rule('mapping-confirmed', 'silver', true),
  rule('no-blocking', 'silver', true),
  rule('certified', 'gold', false),
  rule('control-totals', 'gold', true),
  rule('fresh', 'gold', true),
]

describe('what certifying would do', () => {
  it('says gold only when every check passes and every typed total reconciles', () => {
    const ready = readiness(SILVER)
    expect(certifyOutcomeText('Job changes', ready, 0)).toBe(
      'Every check passes. Certifying makes Job changes gold.',
    )
    expect(certifyOutcomeText('Job changes', ready, 1)).toBe(
      '1 control total does not reconcile, so certifying keeps Job changes silver.',
    )
    expect(certifyOutcomeText('Job changes', ready, 2)).toBe(
      '2 control totals do not reconcile, so certifying keeps Job changes silver.',
    )
  })

  it('names the other gold checks, and says nothing while silver checks fail', () => {
    const stale = readiness(SILVER.map((r) => (r.id === 'fresh' ? { ...r, pass: false } : r)))
    expect(certifyOutcomeText('Job changes', stale, 0)).toBe('You can certify now; gold also needs fresh.')
    expect(certifyOutcomeText('Job changes', stale, 1)).toBe(
      '1 control total does not reconcile, so certifying keeps Job changes silver; gold also needs fresh.',
    )
    const blocked = readiness(SILVER.map((r) => (r.id === 'mapping-confirmed' ? { ...r, pass: false } : r)))
    expect(certifyOutcomeText('Job changes', blocked, 0)).toBeNull()
  })

  it('counts the typed totals that parse and miss the data', () => {
    const rows = { ...newControlDraft('rows', 'a'), expected: '1,700' }
    const close = { ...newControlDraft('rows', 'b'), expected: '1,797' }
    const unparsed = { ...newControlDraft('rows', 'c'), expected: 'lots' }
    expect(draftsOff([rows, close, unparsed], () => 1797)).toBe(1)
    expect(draftsOff([], () => 1797)).toBe(0)
  })
})

describe('revoking', () => {
  it('is worded from the tier the dataset has now', () => {
    expect(revokeText('Employees', 'gold')).toBe(
      'Revoke the certification? Employees drops to silver until it is certified again.',
    )
    expect(revokeText('Job changes', 'silver')).toBe(
      'Revoke the certification? Job changes stays silver, and needs a new certification to reach gold.',
    )
  })
})
