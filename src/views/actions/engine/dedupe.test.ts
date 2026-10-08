/**
 * One item per matter (docs/ACTION-CENTER-AUDIT.md 3.4, 4.2 and part 6): an export license and an
 * I-9 raised by Onboarding and by Compliance fold into the Compliance item, which keeps the legal
 * exposure and the most severe rating and says where else it was raised. On the sample, no two
 * listed items share a matter in any mode.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { collectUncached, foldMatters } from './collect'
import { everyMode } from './roleKit'
import { ctxOf, item, source } from './testkit'

describe('items about the same matter', () => {
  const screening = item({
    id: 'onboarding:task:APP-1:Export-control screening',
    view: 'onboarding',
    tab: 'upcoming',
    ownerRole: 'trade-compliance',
    ownerId: null,
    ownerName: 'Trade compliance',
    severity: 'warning',
    due: '2026-10-02',
    matter: 'license:E3',
  })
  const license = item({
    id: 'compliance:license:E3',
    view: 'compliance',
    tab: 'export',
    ownerRole: 'trade-compliance',
    ownerId: null,
    ownerName: 'Trade compliance',
    severity: 'critical',
    exposure: true,
    due: '2026-08-03',
    matter: 'license:E3',
  })
  const lateI9 = item({
    id: 'onboarding:i9:APP-1',
    view: 'onboarding',
    tab: 'upcoming',
    ownerRole: 'hr-ops',
    ownerId: null,
    ownerName: 'People operations',
    severity: 'critical',
    exposure: true,
    due: '2026-09-25',
    matter: 'i9:E3',
  })
  const i9 = item({
    id: 'compliance:i9:E3',
    view: 'compliance',
    tab: 'work',
    ownerRole: 'hr-ops',
    ownerId: null,
    ownerName: 'People operations',
    severity: 'warning',
    due: null,
    matter: 'i9:E3',
  })
  const other = item({ id: 'talent:x:1' })

  it('keeps the Compliance item, with the exposure, the worst severity and the earliest due when it has none', () => {
    const f = foldMatters([screening, license, lateI9, i9, other])
    expect(f.folded).toBe(2)
    expect(f.items.map((i) => i.id)).toEqual(['compliance:license:E3', 'compliance:i9:E3', 'talent:x:1'])
    const keptI9 = f.items.find((i) => i.id === 'compliance:i9:E3')
    expect(keptI9).toMatchObject({ severity: 'critical', exposure: true, due: '2026-09-25' })
    expect(
      [...f.also.values()]
        .flat()
        .map((i) => i.id)
        .sort(),
    ).toEqual(['onboarding:i9:APP-1', 'onboarding:task:APP-1:Export-control screening'])
  })

  it('lists the survivor once in the Action center and says where else it was raised', () => {
    const views = [
      source('onboarding', 'Onboarding', [screening, lateI9]),
      source('compliance', 'Compliance', [license, i9]),
    ]
    const c = collectUncached(ctxOf(), views)
    expect(c.items.map((a) => a.id).sort()).toEqual(['compliance:i9:E3', 'compliance:license:E3'])
    expect(c.folded).toBe(2)
    for (const a of c.items) expect(a.alsoFrom, a.id).toEqual(['Onboarding'])
    // Whichever view runs first, the Compliance item survives.
    const reversed = collectUncached(ctxOf(), [...views].reverse())
    expect(reversed.items.map((a) => a.id).sort()).toEqual(['compliance:i9:E3', 'compliance:license:E3'])
  })

  it('without the owning view, keeps the most severe of the others', () => {
    const a = item({ id: 'onboarding:x:1', severity: 'info', matter: 'm:1' })
    const b = item({ id: 'talent:y:1', severity: 'critical', matter: 'm:1' })
    expect(foldMatters([a, b]).items.map((i) => i.id)).toEqual(['talent:y:1'])
  })
})

describe('on the sample, in every mode', () => {
  let modes: ReturnType<typeof everyMode>
  beforeAll(() => {
    modes = everyMode()
  }, 300_000)

  it('no two listed items share a matter, and the export licenses fold into Compliance', () => {
    for (const { mode, collected } of modes) {
      const matters = collected.items.map((a) => a.item.matter).filter(Boolean)
      expect(new Set(matters).size, mode).toBe(matters.length)
      for (const a of collected.items)
        if (a.item.matter?.startsWith('license:') || a.item.matter?.startsWith('i9:'))
          expect(a.item.view, `${mode} ${a.id}`).toBe('compliance')
    }
    // The sample's export screening tasks for starts with a license pending fold in HR mode.
    const hr = modes.find((m) => m.mode === 'hr')!
    expect(hr.collected.folded).toBeGreaterThan(0)
    expect(hr.collected.items.some((a) => a.alsoFrom.length > 0)).toBe(true)
  })
})
