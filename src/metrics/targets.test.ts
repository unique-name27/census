/**
 * Targets: a target the engine calculates with (HR ops service levels) can change value but not
 * direction and can't be removed; "under" is kept for targets registered that way; a target
 * pointing against the metric's good direction gets a caution.
 */
import { describe, expect, it } from 'vitest'
import { defineMetrics } from './define'
import {
  applyEdit,
  checkTarget,
  comparatorText,
  defaultComparator,
  EMPTY_METRICS,
  targetDirectionWarning,
  targetText,
} from './overrides'
import { catalogOf, validateCatalog } from './registry'

const [sla, retro, plain] = defineMetrics('services', [
  {
    id: 'services.cases.resolutionSla',
    name: 'Resolution SLA met',
    definition: 'Share of cases resolved within their target.',
    unit: 'pct',
    goodDirection: 'up',
    target: { value: 0.9, comparator: '>=' },
    targetRequired: true,
    uses: ['cases.openedAt'],
  },
  {
    id: 'services.levels.retro',
    name: 'DS-01 retro share',
    definition: 'Retro changes as a share of changes.',
    unit: 'pct',
    goodDirection: 'down',
    target: { value: 0.02, comparator: '<' },
    targetRequired: true,
    uses: ['transactions.type'],
  },
  {
    id: 'services.cases.csat',
    name: 'Satisfaction',
    definition: 'Average score.',
    unit: 'pct',
    goodDirection: 'up',
    uses: ['cases.csat'],
  },
])
const CAT = catalogOf([sla, retro, plain])

describe('required targets', () => {
  it('change value, keep their direction and are never removed', () => {
    expect(checkTarget(sla, { value: 0.95, comparator: '>=' })).toEqual({
      ok: true,
      value: { value: 0.95, comparator: '>=' },
    })
    const removed = checkTarget(sla, null)
    expect(removed.ok).toBe(false)
    expect(!removed.ok && removed.error).toContain('needs a target')
    const flipped = checkTarget(sla, { value: 0.95, comparator: '<=' })
    expect(!flipped.ok && flipped.error).toBe(
      'The target of resolution SLA met is always "at least": the status marks are calculated that way. Change its value instead.',
    )
    const r = applyEdit(EMPTY_METRICS, CAT, { metricId: sla.id, field: 'target', value: null })
    expect(r.ok).toBe(false)
  })

  it('keep "under" where it is registered, and nowhere else', () => {
    expect(checkTarget(retro, { value: 0.03, comparator: '<' }).ok).toBe(true)
    expect(checkTarget(plain, { value: 0.8, comparator: '<' }).ok).toBe(false)
    expect(targetText(retro, retro.target)).toBe('Under 2.0%')
    expect(comparatorText('<=')).toBe('At most')
    expect(validateCatalog([retro])).toEqual([])
    expect(validateCatalog([{ ...sla, target: undefined }])).toEqual([
      'services.cases.resolutionSla: a required target needs a default.',
    ])
  })

  it('a removable target can still be removed', () => {
    expect(checkTarget(plain, null)).toEqual({ ok: true, value: null })
  })
})

describe('target direction', () => {
  it('starts a new target in the good direction', () => {
    expect(defaultComparator({ goodDirection: 'down' })).toBe('<=')
    expect(defaultComparator({ goodDirection: 'up' })).toBe('>=')
    expect(defaultComparator({ goodDirection: null })).toBe('>=')
  })

  it('cautions when a target points against the good direction', () => {
    expect(targetDirectionWarning(plain, { value: 0.9, comparator: '<=' })).toContain('Higher is better')
    expect(targetDirectionWarning(plain, { value: 0.9, comparator: '>=' })).toBeNull()
    expect(targetDirectionWarning(retro, { value: 0.02, comparator: '<' })).toBeNull()
    expect(targetDirectionWarning(retro, { value: 0.02, comparator: '>=' })).toContain('Lower is better')
    expect(targetDirectionWarning({ goodDirection: null }, { value: 1, comparator: '<=' })).toBeNull()
    expect(targetDirectionWarning(plain, null)).toBeNull()
  })
})
