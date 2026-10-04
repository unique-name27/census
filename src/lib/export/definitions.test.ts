import { afterEach, describe, expect, it } from 'vitest'
import type { ExportMeta, RegisteredFigure } from '@/charts/types'
import { csvPreamble } from './csv'
import { definitionsChanged, definitionsLine, definitionsLineFor, setDefinitionsSource } from './definitions'
import { imageFooter, withoutDataContext } from './names'
import { buildViewWorkbook } from './view'
import { buildWorkbook } from './xlsx'

const meta: ExportMeta = {
  view: 'People stats',
  scope: 'Whole company',
  window: 'Last 12 months',
  asOf: '2026-09-30',
  isSample: true,
  company: 'Northgate Semiconductor',
  standard: 'bronze',
}

const table = {
  name: 'Attrition',
  title: 'Attrition by site',
  columns: [{ key: 'site', label: 'Site' }],
  rows: [{ site: 'Austin' }],
}

const STAMP = 'Definitions changed from defaults: 3 (see Metric definitions)'

function cellTexts(ws: { eachRow: (cb: (row: { values: unknown }) => void) => void }): string[] {
  const out: string[] = []
  ws.eachRow((row) => {
    for (const v of row.values as unknown[]) if (typeof v === 'string') out.push(v)
  })
  return out
}

afterEach(() => setDefinitionsSource(() => 0))

describe('the definitions stamp', () => {
  it('says how many metrics differ from their defaults, and nothing when none do', () => {
    expect(definitionsLine(3)).toBe(STAMP)
    expect(definitionsLine(1_204)).toBe('Definitions changed from defaults: 1,204 (see Metric definitions)')
    expect(definitionsLine(0)).toBeNull()
  })

  it('reads the count from the registered source, and 0 when there is none or it fails', () => {
    expect(definitionsChanged()).toBe(0)
    setDefinitionsSource(() => 3)
    expect(definitionsChanged()).toBe(3)
    expect(definitionsLine()).toBe(STAMP)
    setDefinitionsSource(() => {
      throw new Error('store not ready')
    })
    expect(definitionsChanged()).toBe(0)
    setDefinitionsSource(() => Number.NaN)
    expect(definitionsChanged()).toBe(0)
  })

  it('leaves out views that read no people data', () => {
    expect(definitionsLineFor(meta, 2)).toContain('2')
    expect(definitionsLineFor(withoutDataContext(meta), 2)).toBeNull()
  })
})

describe('exports carry the stamp when definitions changed', () => {
  it('in the CSV preamble', () => {
    expect(csvPreamble(table, meta)).not.toContain(STAMP)
    setDefinitionsSource(() => 3)
    const lines = csvPreamble(table, meta)
    expect(lines).toContain(STAMP)
    // After the data standard line, before the confidentiality stamp.
    expect(lines.indexOf(STAMP)).toBe(lines.length - 2)
  })

  it('on chart image footers', () => {
    setDefinitionsSource(() => 3)
    expect(imageFooter(meta)).toBe(
      'Whole company · As of 30 Sep 2026 · Everything standard · Definitions changed from defaults: 3 · Census · Sample data',
    )
    expect(imageFooter(withoutDataContext(meta))).toBe('Census')
  })

  it('in each sheet’s title block', async () => {
    const before = await buildWorkbook([table], meta, { showPay: false })
    expect(cellTexts(before.worksheets[0])).not.toContain(STAMP)
    setDefinitionsSource(() => 3)
    const after = await buildWorkbook([table], meta, { showPay: false })
    expect(cellTexts(after.worksheets[0])).toContain(STAMP)
  })

  it('on the view workbook’s summary sheet', async () => {
    const fig: RegisteredFigure = {
      id: 'hrbp-attrition',
      title: 'Attrition',
      columns: table.columns,
      rows: table.rows,
      getSvg: () => null,
      order: 0,
    }
    setDefinitionsSource(() => 3)
    const wb = await buildViewWorkbook([fig], meta, { showPay: false, images: false })
    expect(cellTexts(wb.getWorksheet('Summary')!)).toContain(
      'Changed from defaults: 3 (see Metric definitions)',
    )
  })
})
