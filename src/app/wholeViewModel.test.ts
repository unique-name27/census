import { describe, expect, it } from 'vitest'
import type { Column, RegisteredFigure } from '@/charts/types'
import type { FigureGroup } from '@/lib/export/view'
import {
  layoutProgress,
  payDropped,
  renderSignature,
  tabFigureGroup,
  tabFigureId,
  wholeViewDone,
  writeProgress,
} from './wholeViewModel'

const svgWith = (marks: number) =>
  ({ getElementsByTagName: () => ({ length: marks }) }) as unknown as SVGSVGElement

const fig = (id: string, extra: Partial<RegisteredFigure> = {}): RegisteredFigure => ({
  id,
  title: id,
  columns: [{ key: 'n', label: 'N' }],
  rows: [{ n: 1 }],
  getSvg: () => null,
  order: 0,
  ...extra,
})

const overview = { key: 'overview', label: 'Overview' }
const pipeline = { key: 'pipeline', label: 'Pipeline' }

describe('tab groups', () => {
  it('prefixes figure ids with the tab key so tabs never collide', () => {
    const a = tabFigureGroup(overview, [fig('key-figures'), fig('readout')])
    const b = tabFigureGroup(pipeline, [fig('key-figures'), fig('rec-flow')])
    expect(a).toMatchObject({ key: 'overview', label: 'Overview' })
    expect(a.figures.map((f) => f.id)).toEqual(['overview:key-figures', 'overview:readout'])
    const ids = [...a.figures, ...b.figures].map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(tabFigureId('sources', 'x')).toBe('sources:x')
  })

  it('keeps everything else about the figure, including its live SVG getter', () => {
    const svg = svgWith(3)
    const original = fig('rec-flow', { title: 'Flow', getSvg: () => svg, order: 7 })
    const [copy] = tabFigureGroup(pipeline, [original]).figures
    expect(copy).toMatchObject({ title: 'Flow', order: 7, rows: original.rows, columns: original.columns })
    expect(copy.getSvg()).toBe(svg)
    expect(original.id).toBe('rec-flow')
  })
})

describe('renderSignature', () => {
  it('changes while charts draw and holds once they are done', () => {
    let marks = 0
    let svg: SVGSVGElement | null = null
    const figures = [fig('a', { getSvg: () => svg }), fig('readout')]
    const s0 = renderSignature(figures)
    svg = svgWith(marks)
    const s1 = renderSignature(figures)
    marks = 40
    svg = svgWith(marks)
    const s2 = renderSignature(figures)
    expect(new Set([s0, s1, s2]).size).toBe(3)
    expect(renderSignature(figures)).toBe(s2)
    expect(renderSignature([...figures, fig('late')])).not.toBe(s2)
    expect(renderSignature([])).toBe('')
  })
})

describe('toast copy', () => {
  it('reports progress per tab and per step', () => {
    expect(layoutProgress('Recruiting', pipeline, 1, 4)).toEqual({
      title: 'Exporting every tab of Recruiting',
      description: 'Laying out Pipeline (2 of 4).',
    })
    expect(writeProgress('workbook', 'images', 31).title).toBe('Drawing the charts')
    expect(writeProgress('deck', 'file', 31)).toEqual({
      title: 'Writing the slides',
      description: '31 figures so far.',
    })
  })

  it('sums up what went in and what was left out', () => {
    const groups: FigureGroup[] = [
      tabFigureGroup(overview, [fig('a'), fig('b')]),
      tabFigureGroup(pipeline, [fig('c')]),
      tabFigureGroup({ key: 'empty', label: 'Empty' }, []),
    ]
    expect(
      wholeViewDone({ kind: 'workbook', viewLabel: 'Recruiting', groups, failed: [], payDropped: false }),
    ).toEqual({ title: 'Workbook downloaded', description: '3 figures from 2 tabs of Recruiting.' })
    expect(
      wholeViewDone({
        kind: 'deck',
        viewLabel: 'Compensation',
        groups: [groups[1]],
        failed: [{ key: 'market', label: 'Market' }],
        payDropped: true,
      }),
    ).toEqual({
      title: 'Slides downloaded',
      description:
        '1 figure from 1 tab of Compensation. Market could not be drawn and was left out. Pay amounts were left out.',
    })
  })

  it('knows when pay columns were dropped', () => {
    const pay: Column[] = [{ key: 'salary', label: 'Salary', pay: true }]
    const groups = [tabFigureGroup(overview, [fig('a'), fig('pay', { columns: pay })])]
    expect(payDropped(groups, false)).toBe(true)
    expect(payDropped(groups, true)).toBe(false)
    expect(payDropped([tabFigureGroup(overview, [fig('a')])], false)).toBe(false)
  })
})
