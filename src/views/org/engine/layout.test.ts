import { describe, expect, it } from 'vitest'
import { defaultExpanded, expandedForLevels } from './expand'
import { AS_OF, person, smallCompany } from './fixtures'
import {
  canExpand,
  type Layout,
  layoutTree,
  type ReqStub,
  SCREEN_SIZES,
  segmentsPath,
  visibleIds,
  visibleTree,
} from './layout'
import { buildOrgTree, entryPoints, subtreeOf } from './tree'

const tree = buildOrgTree(smallCompany(), AS_OF)
const all = new Set(subtreeOf(tree, tree.rootId))

function overlaps(l: Layout): [string, string] | null {
  for (let i = 0; i < l.cards.length; i++) {
    for (let j = i + 1; j < l.cards.length; j++) {
      const a = l.cards[i]
      const b = l.cards[j]
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) return [a.id, b.id]
    }
  }
  return null
}

describe('visibleTree', () => {
  it('shows only the children of expanded cards', () => {
    const v = visibleTree(tree, 'CEO', new Set(['CEO']))
    expect(visibleIds(v)).toEqual(['CEO', 'VP-A', 'VP-B'])
    const v2 = visibleTree(tree, 'CEO', new Set(['CEO', 'VP-A']))
    expect(visibleIds(v2)).toEqual(['CEO', 'VP-A', 'MGR-1', 'MGR-2', 'VP-B'])
  })

  it('stops at maxDepth and adds requisition placeholders under expanded managers', () => {
    const reqs = new Map<string, ReqStub[]>([
      [
        'MGR-2',
        [
          {
            reqId: 'R1',
            jobTitle: 'Engineer',
            level: 'L3',
            openings: 1,
            openedDate: '2026-08-01',
            location: 'Austin',
          },
        ],
      ],
    ])
    const v = visibleTree(tree, 'CEO', all, { reqs, maxDepth: 2 })
    const ids = visibleIds(v)
    expect(ids).not.toContain('IC-1')
    expect(ids).not.toContain('req:R1')
    const v2 = visibleTree(tree, 'VP-A', all, { reqs })
    expect(visibleIds(v2)).toContain('req:R1')
    expect(canExpand(tree, 'IC-1', reqs)).toBe(false)
    expect(canExpand(tree, 'MGR-2', reqs)).toBe(true)
  })
})

describe('layoutTree', () => {
  it('never overlaps cards, with everything expanded', () => {
    const l = layoutTree(visibleTree(tree, 'CEO', all))
    expect(l.cards).toHaveLength(18)
    expect(overlaps(l)).toBeNull()
    expect(l.width).toBeGreaterThan(0)
    for (const c of l.cards) {
      expect(c.x).toBeGreaterThanOrEqual(0)
      expect(c.y).toBeGreaterThanOrEqual(0)
      expect(c.x + c.w).toBeLessThanOrEqual(l.width)
    }
  })

  it('stacks four or more leaf reports in two columns either side of a spine', () => {
    const l = layoutTree(visibleTree(tree, 'MGR-1', new Set(['MGR-1'])))
    const ics = l.cards.filter((c) => c.id.startsWith('IC-'))
    const xs = new Set(ics.map((c) => c.x))
    expect(xs.size).toBe(2)
    const rows = new Set(ics.map((c) => c.y))
    expect(rows.size).toBe(3)
    const mgr = l.byId.get('MGR-1')!
    const spine = mgr.x + mgr.w / 2
    // The manager sits over the spine, which runs between the columns.
    expect(Math.min(...ics.map((c) => c.x + c.w))).toBeLessThan(spine)
    expect(Math.max(...ics.map((c) => c.x))).toBeGreaterThan(spine)
    // Every card's parent is recorded.
    expect(ics.every((c) => c.parentId === 'MGR-1')).toBe(true)
  })

  it('keeps small teams in a row with the manager centred over them', () => {
    const l = layoutTree(visibleTree(tree, 'CEO', new Set(['CEO'])))
    const ceo = l.byId.get('CEO')!
    const a = l.byId.get('VP-A')!
    const b = l.byId.get('VP-B')!
    expect(a.y).toBe(b.y)
    expect(ceo.x + ceo.w / 2).toBeCloseTo((a.x + a.w / 2 + b.x + b.w / 2) / 2, 5)
    expect(a.y).toBe(SCREEN_SIZES.cardH + SCREEN_SIZES.gapY)
  })

  it('lays out a grid inside a team box when asked', () => {
    const l = layoutTree(visibleTree(tree, 'MGR-1', new Set(['MGR-1'])), { ...SCREEN_SIZES, stack: 'grid' })
    expect(l.boxes).toHaveLength(1)
    expect(overlaps(l)).toBeNull()
    const box = l.boxes[0]
    for (const c of l.cards.filter((x) => x.id.startsWith('IC-'))) {
      expect(c.x).toBeGreaterThanOrEqual(box.x)
      expect(c.x + c.w).toBeLessThanOrEqual(box.x + box.w)
    }
  })

  it('draws connectors as crisp horizontal and vertical segments', () => {
    const l = layoutTree(visibleTree(tree, 'CEO', all))
    for (const [x1, y1, x2, y2] of l.segments) expect(x1 === x2 || y1 === y2).toBe(true)
    expect(segmentsPath([[0, 0, 0, 10]])).toBe('M0.5 0.5V10.5')
  })
})

describe('collapsed managers', () => {
  it('stay in a row on screen but stack on slides', () => {
    const rows = [person('TOP', null)]
    for (let i = 0; i < 5; i++) {
      rows.push(person(`M${i}`, 'TOP', { level: 'M1' }))
      rows.push(person(`M${i}-ic`, `M${i}`))
    }
    const t = buildOrgTree(rows, AS_OF)
    const v = visibleTree(t, 'TOP', new Set(['TOP']))
    expect(v.children.every((c) => c.collapsed)).toBe(true)
    const screen = layoutTree(v)
    expect(new Set(screen.cards.filter((c) => c.id !== 'TOP').map((c) => c.y)).size).toBe(1)
    const slide = layoutTree(v, { ...SCREEN_SIZES, stackCollapsed: true, stack: 'grid' })
    expect(slide.boxes).toHaveLength(1)
  })
})

describe('entryPoints', () => {
  it('finds where a filtered group enters the chart, largest first', () => {
    const matches = (id: string) => ['MGR-3', 'IC-7', 'IC-8', 'IC-2'].includes(id)
    expect(entryPoints(tree, 'CEO', matches)).toEqual(['MGR-3', 'IC-2'])
    expect(entryPoints(tree, 'MGR-3', matches)).toEqual(['MGR-3'])
  })
})

describe('default expansion', () => {
  it('opens the asked levels, plus the chain down to filtered groups', () => {
    expect([...expandedForLevels(tree, 'CEO', '2')]).toEqual(['CEO'])
    expect(new Set(expandedForLevels(tree, 'CEO', '3'))).toEqual(new Set(['CEO', 'VP-A', 'VP-B']))
    expect(expandedForLevels(tree, 'CEO', 'all').size).toBe(7)
    const ids = defaultExpanded(tree, 'CEO', '2', (id) => id === 'IC-9')
    expect(new Set(ids)).toEqual(new Set(['CEO', 'VP-B', 'DIR-1', 'MGR-3']))
  })
})
