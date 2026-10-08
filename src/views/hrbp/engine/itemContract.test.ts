/**
 * The audit's item contract across the views that hand the Action center their items
 * (docs/ACTION-CENTER-AUDIT.md 4.1, 4.2 and part 6; docs/ROLES-V2.md 5.14), on the sample: no
 * closing full stop, a date from another year keeps its year, no money in the words, a place on
 * every item, a fingerprint on every roll-up, team items about a group, and legal exposure on
 * every breach. Also in the HRBP scopes: regions named by the one region index ("APAC").
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { Mode } from '@/access/modes'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { generateSample } from '@/data/sample'
import { DATASET_KEYS, type DatasetKey, type Datasets, type ViewKey } from '@/data/schema'
import { DEFAULT_FILTERS } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { formatDate } from '@/lib/dates'
import { VIEWS } from '@/views/registry'
import type { ActionItem } from '../../types'

/** The views this contract covers (Compensation's items are its own). */
const OWNED: readonly ViewKey[] = [
  'recruiting',
  'talent',
  'onboarding',
  'services',
  'listening',
  'org',
  'hrbp',
  'compliance',
]

/** Roll-ups: one item for a group whose content changes, so a handled mark must reopen. */
const ROLL_UPS = [
  'talent:training-overdue:',
  'talent:course-below-target:',
  'talent:review-missing:',
  'talent:promotion-overdue:',
  'hrbp:stay-conversations:',
  'onboarding:plan-behind:',
]
/** Items about a team or a group: About opens the records, never the manager. */
const GROUP_ITEMS = [
  'talent:training-overdue:',
  'talent:review-missing:',
  'talent:promotion-overdue:',
  'talent:course-below-target:',
  'hrbp:stay-conversations:',
  'onboarding:plan-behind:',
  'onboarding:plan-no-req:',
]

const MONEY = /[$€£¥₹]\s?\d|\b\d[\d,.]*\s?(USD|EUR|GBP|INR|JPY|CNY|TWD|KRW|SGD)\b/

let data: Datasets
let sources: Record<DatasetKey, SourceMeta>
const ctxIn = (mode: Mode, picks: Record<string, string> = {}): AnalyticsContext =>
  buildContext({
    data,
    sources,
    filters: DEFAULT_FILTERS,
    asOfOverride: null,
    showPay: false,
    access: { mode, picks },
  })
const itemsOf = (ctx: AnalyticsContext): ActionItem[] =>
  VIEWS.filter((v) => OWNED.includes(v.key)).flatMap((v) => v.actions?.(ctx) ?? [])

beforeAll(() => {
  data = generateSample()
  sources = Object.fromEntries(
    DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: data[k].length } satisfies SourceMeta]),
  ) as Record<DatasetKey, SourceMeta>
})

describe('the item contract on the sample', () => {
  let ctx: AnalyticsContext
  let items: ActionItem[]
  beforeAll(() => {
    ctx = ctxIn('hr')
    items = itemsOf(ctx)
  })

  it('has items from every view it covers, each id once', () => {
    expect(new Set(items.map((i) => i.view))).toEqual(new Set(OWNED))
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length)
  })

  it('writes `what` with no closing full stop and no money amount, in `what` or `note`', () => {
    for (const i of items) {
      expect(i.what.trim().endsWith('.'), i.id).toBe(false)
      expect(`${i.what} ${i.note ?? ''}`, i.id).not.toMatch(MONEY)
    }
  })

  it('keeps the year of a due date from another year wherever `what` names the day', () => {
    const year = ctx.asOf.slice(0, 4)
    let checked = 0
    for (const i of items) {
      if (!i.due || i.due.slice(0, 4) === year) continue
      const day = formatDate(i.due).replace(/ \d{4}$/, '')
      const at = i.what.indexOf(`${day} `)
      if (at < 0 && !i.what.endsWith(day)) continue
      checked++
      expect(i.what, i.id).toContain(formatDate(i.due))
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('places every item, gives every roll-up a fingerprint and every group item no person', () => {
    for (const i of items) {
      expect(i.place, i.id).toBeDefined()
      if (ROLL_UPS.some((p) => i.id.startsWith(p))) expect(i.fingerprint, i.id).toBeTruthy()
      if (GROUP_ITEMS.some((p) => i.id.startsWith(p))) expect(i.subject.kind, i.id).toBe('none')
      // Every item has a due date or says what would close it.
      expect(!!i.due || !!i.closesWhen, i.id).toBe(true)
    }
  })

  it('marks every legal breach as exposure and folds Onboarding into Compliance by matter', () => {
    for (const i of items) {
      if (i.id.startsWith('compliance:i9:') || i.id.startsWith('compliance:license:'))
        expect(i.exposure, i.id).toBe(true)
      if (i.id.startsWith('services:tx:') && i.what.startsWith('Termination'))
        expect(i.exposure, i.id).toBe(true)
      if (i.id.startsWith('compliance:')) expect(i.matter, i.id).toBeTruthy()
    }
    const screening = items.filter((i) => i.id.endsWith(':Export-control screening'))
    for (const i of screening) expect(i.matter, i.id).toMatch(/^license:/)
  })

  it('never writes "Asia Pacific": a region has one name everywhere', () => {
    for (const i of items) {
      expect(JSON.stringify({ what: i.what, note: i.note, place: i.place }), i.id).not.toContain(
        'Asia Pacific',
      )
      if (i.place?.region) expect(['Americas', 'EMEA', 'APAC'], i.id).toContain(i.place.region)
    }
  })
})

describe('in the HRBP scopes', () => {
  it('names the region of every item in APAC by the region index', () => {
    const ctx = ctxIn('hrbp-region', { region: 'APAC' })
    expect(ctx.access.scope?.kind).toBe('region')
    const items = itemsOf(ctx)
    expect(items.length).toBeGreaterThan(0)
    const regions = new Set(items.map((i) => i.place?.region).filter(Boolean))
    expect([...regions]).toContain('APAC')
    for (const r of regions) expect(['Americas', 'EMEA', 'APAC']).toContain(r)
  })

  it('places items in a business unit scope inside that unit, by person or by place', () => {
    const ctx = ctxIn('hrbp-unit', { unit: 'Silicon Engineering' })
    const items = itemsOf(ctx)
    const placed = items.filter((i) => i.place?.businessUnit)
    expect(placed.length).toBeGreaterThan(0)
    // Every item about a person or req in the scoped data sits in the unit (owners may sit outside).
    const inUnit = placed.filter((i) => i.subject.kind !== 'none' && i.view !== 'listening')
    for (const i of inUnit) expect(i.place?.businessUnit, i.id).toBe('Silicon Engineering')
  })
})
