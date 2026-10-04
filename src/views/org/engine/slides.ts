/**
 * Org slides (the old tool's slide builder): one 16:9 slide per chosen leader showing their
 * direct org. The same layout engine as the chart, scaled into the slide's content area, so the
 * slide matches the screen. Pure: positions in inches and text; the PowerPoint writer only draws.
 *
 * "Two levels" adds each direct report's team when it still reads at slide size; when it would
 * shrink the smallest text (title, department and counts lines) below 7 pt the slide falls back
 * to direct reports and says so.
 */
import type { ISODate } from '@/data/schema'
import { formatDate } from '@/lib/dates'
import { plural } from '@/lib/format'
import type { ColorScheme, Swatch } from './colorBy'
import {
  type Box,
  type CardKind,
  type LayoutSizes,
  layoutTree,
  type ReqStub,
  type Segment,
  visibleTree,
} from './layout'
import { COMPANY_ROOT, type OrgTree } from './tree'

export const SLIDE = { w: 13.333, h: 7.5, margin: 0.6, top: 1.55, bottom: 0.85 } as const

export const SLIDE_SIZES: LayoutSizes = {
  cardW: 212,
  cardH: 84,
  gapX: 16,
  gapY: 40,
  stackGap: 10,
  stackIndent: 12,
  stackMin: 4,
  stackCollapsed: true,
  stack: 'grid',
  boxPad: 10,
}
const TWO_LEVEL_SIZES: LayoutSizes = { ...SLIDE_SIZES, stack: 2 }

/** Name size on the card, in layout pixels; the slide font is this times the scale. */
export const NAME_PX = 14
/** The smallest text on a card (title, meta and counts lines), in layout pixels. */
export const SMALL_PX = 11.5
/** The smallest point size a slide may use before two levels fall back to one. */
export const MIN_SLIDE_PT = 7

export interface SlideCard {
  id: string
  kind: CardKind
  /** Inches from the slide's top-left. */
  x: number
  y: number
  w: number
  h: number
  name: string
  title: string
  meta: string
  counts: string
  swatch: Swatch | null
  leader: boolean
}

export interface SlidePlan {
  leaderId: string
  title: string
  subtitle: string
  cards: SlideCard[]
  /** Connector segments in inches. */
  lines: Segment[]
  boxes: Box[]
  /** Points per layout pixel, for font sizes. */
  ptPerPx: number
  levels: 1 | 2
  note: string
}

export interface SlideOptions {
  levels: 1 | 2
  scheme: ColorScheme
  reqs?: ReadonlyMap<string, readonly ReqStub[]>
  /** Requisition stubs keyed by card id (`req:<reqId>`). */
  reqByCardId?: ReadonlyMap<string, ReqStub>
  asOf: ISODate
}

/** "6 direct · 1,557 org" (empty for people without reports); the same text as the screen cards. */
export function countsText(directs: number, total: number): string {
  return directs ? `${directs.toLocaleString('en-US')} direct · ${total.toLocaleString('en-US')} org` : ''
}

function expandedFor(tree: OrgTree, leaderId: string): Set<string> {
  const out = new Set([leaderId])
  for (const c of tree.children.get(leaderId) ?? []) out.add(c)
  return out
}

/** One slide per leader (leaders not in the tree are skipped). */
export function planSlides(tree: OrgTree, leaderIds: readonly string[], opts: SlideOptions): SlidePlan[] {
  const out: SlidePlan[] = []
  const area = {
    x: SLIDE.margin,
    y: SLIDE.top,
    w: SLIDE.w - 2 * SLIDE.margin,
    h: SLIDE.h - SLIDE.top - SLIDE.bottom,
  }
  for (const leaderId of leaderIds) {
    if (leaderId !== COMPANY_ROOT && !tree.people.has(leaderId)) continue
    const expanded = expandedFor(tree, leaderId)
    const make = (levels: 1 | 2) => {
      const v = visibleTree(tree, leaderId, expanded, { reqs: opts.reqs, maxDepth: levels })
      const lay = layoutTree(v, levels === 2 ? TWO_LEVEL_SIZES : SLIDE_SIZES)
      const k = Math.min(area.w / lay.width, area.h / lay.height, 1 / 64)
      return { lay, k }
    }
    let levels: 1 | 2 = opts.levels
    let note = ''
    let { lay, k } = make(levels)
    if (levels === 2 && SMALL_PX * k * 72 < MIN_SLIDE_PT) {
      levels = 1
      ;({ lay, k } = make(1))
      note = 'Two levels would not fit at a readable size, so this slide shows direct reports.'
    }
    const ox = area.x + (area.w - lay.width * k) / 2
    const oy = area.y
    const X = (px: number) => ox + px * k
    const Y = (px: number) => oy + px * k

    // The leader's department goes in the subtitle; cards only name a different one.
    const leaderDept = tree.people.get(leaderId)?.department
    const cards: SlideCard[] = lay.cards.map((c) => {
      const base = {
        id: c.id,
        kind: c.kind,
        x: X(c.x),
        y: Y(c.y),
        w: c.w * k,
        h: c.h * k,
        leader: c.id === leaderId,
      }
      if (c.kind === 'req') {
        const r = opts.reqByCardId?.get(c.id)
        return {
          ...base,
          name: 'Open role',
          title: r?.jobTitle ?? '',
          meta: [r?.level, r?.location].filter(Boolean).join(' · '),
          counts: r && r.openings > 1 ? `${r.openings} openings` : '',
          swatch: null,
        }
      }
      if (c.kind === 'company') {
        return {
          ...base,
          name: 'Whole company',
          title: '',
          meta: '',
          counts: plural(tree.people.size, 'person', 'people'),
          swatch: null,
        }
      }
      const e = tree.people.get(c.id)!
      return {
        ...base,
        name: e.name,
        title: e.jobTitle,
        meta: [e.level, e.department === leaderDept ? null : e.department, e.location]
          .filter(Boolean)
          .join(' · '),
        counts: countsText(tree.directs.get(c.id) ?? 0, tree.total.get(c.id) ?? 0),
        swatch: opts.scheme.swatchOf(e),
      }
    })

    const leader = tree.people.get(leaderId)
    const directs = tree.directs.get(leaderId) ?? 0
    const total = tree.total.get(leaderId) ?? 0
    out.push({
      leaderId,
      title: leader ? `${leader.name}'s organization` : 'Whole company',
      subtitle: [
        leader?.jobTitle,
        leader?.department,
        plural(directs, 'direct report'),
        plural(total, 'person in the org', 'people in the org'),
        `As of ${formatDate(opts.asOf)}`,
      ]
        .filter(Boolean)
        .join(' · '),
      cards,
      lines: lay.segments.map(([x1, y1, x2, y2]) => [X(x1), Y(y1), X(x2), Y(y2)] as Segment),
      boxes: lay.boxes.map((b) => ({ x: X(b.x), y: Y(b.y), w: b.w * k, h: b.h * k })),
      ptPerPx: k * 72,
      levels,
      note,
    })
  }
  return out
}

/** Default leaders for the slides: the chart's root and the people leaders directly under it. */
export function defaultSlideLeaders(tree: OrgTree, rootId: string, max = 12): string[] {
  const out = rootId === COMPANY_ROOT ? [] : [rootId]
  for (const c of tree.children.get(rootId) ?? []) {
    if ((tree.directs.get(c) ?? 0) > 0) out.push(c)
    if (out.length >= max) break
  }
  return out.length ? out : [rootId]
}
