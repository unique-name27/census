import { describe, expect, it } from 'vitest'
import type { ExportMeta, RegisteredFigure } from '@/charts/types'
import {
  buildViewWorkbook,
  entrySheetName,
  type FigureGroup,
  isFigureGroups,
  slideFootnote,
  viewEntries,
} from './view'
import { WITHHELD_COLUMNS, withheldRows } from './withheld'

const meta: ExportMeta = {
  view: 'Recruiting',
  tab: 'All tabs',
  scope: 'Whole company',
  window: 'Last 12 months',
  asOf: '2026-09-30',
  isSample: true,
  company: 'Northgate Semiconductor',
}

const fig = (id: string, title: string, rows = 2): RegisteredFigure => ({
  id,
  title,
  subtitle: `${title} subtitle`,
  columns: [
    { key: 'name', label: 'Name' },
    { key: 'rate', label: 'Rate', format: 'pct' },
  ],
  rows: Array.from({ length: rows }, (_, i) => ({ name: `Row ${i}`, rate: 0.123456 })),
  getSvg: () => null,
  order: 0,
})

const groups: FigureGroup[] = [
  {
    key: 'overview',
    label: 'Overview',
    figures: [fig('overview:readout', 'Readout'), fig('overview:ttf', 'Time to fill')],
  },
  { key: 'empty', label: 'Empty tab', figures: [] },
  { key: 'pipeline', label: 'Pipeline', figures: [fig('pipeline:readout', 'Readout')] },
]

describe('view entries', () => {
  it('flattens groups in tab order and skips empty tabs', () => {
    expect(isFigureGroups(groups)).toBe(true)
    expect(isFigureGroups([fig('a', 'A')])).toBe(false)
    expect(isFigureGroups([])).toBe(false)
    const entries = viewEntries(groups)
    expect(entries.map((e) => [e.group?.key, e.figure.id])).toEqual([
      ['overview', 'overview:readout'],
      ['overview', 'overview:ttf'],
      ['pipeline', 'pipeline:readout'],
    ])
    expect(viewEntries([fig('a', 'A')])).toEqual([
      { figure: expect.objectContaining({ id: 'a' }), group: null },
    ])
  })

  it('prefixes sheet names with the tab label', () => {
    const [first, , third] = viewEntries(groups)
    expect(entrySheetName(first)).toBe('Overview · Readout')
    expect(entrySheetName(third)).toBe('Pipeline · Readout')
    expect(entrySheetName({ figure: fig('a', 'Time to fill'), group: null })).toBe('Time to fill')
  })
})

describe('buildViewWorkbook', () => {
  it('writes one sheet per figure, named by tab, with the tab in each title block', async () => {
    const wb = await buildViewWorkbook(groups, meta, { showPay: false, images: false })
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Summary',
      'Overview · Readout',
      'Overview · Time to fill',
      'Pipeline · Readout',
    ])
    const sheet = wb.getWorksheet('Pipeline · Readout')!
    expect(String(sheet.getCell(3, 1).value)).toContain('Recruiting · Pipeline')
    // Rates are stored rounded to 4 places of the fraction.
    expect(sheet.getRow(7).getCell(2).value).toBe(0.1235)
  })

  it('lists figures under tab headings on the Summary sheet', async () => {
    const wb = await buildViewWorkbook(groups, meta, { showPay: false, images: false })
    const ws = wb.getWorksheet('Summary')!
    const cells: { text: string; link?: string }[] = []
    ws.eachRow((row) => {
      const v = row.getCell(2).value
      cells.push(
        typeof v === 'object' && v && 'hyperlink' in v
          ? { text: String(v.text), link: v.hyperlink }
          : { text: String(v ?? '') },
      )
    })
    // Tabs with figures are named in the facts; the empty tab is left out.
    expect(cells.map((c) => c.text)).toContain('Overview, Pipeline')
    const i = cells.findIndex((c) => c.text === 'Overview')
    expect(cells.slice(i, i + 5)).toEqual([
      { text: 'Overview' },
      { text: 'Readout', link: "#'Overview · Readout'!A1" },
      { text: 'Time to fill', link: "#'Overview · Time to fill'!A1" },
      { text: 'Pipeline' },
      { text: 'Readout', link: "#'Pipeline · Readout'!A1" },
    ])
  })

  it('keeps a single tab export as before', async () => {
    const wb = await buildViewWorkbook(
      [fig('ttf', 'Time to fill')],
      { ...meta, tab: 'Pipeline' },
      {
        showPay: false,
        images: false,
      },
    )
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Summary', 'Time to fill'])
  })
})

describe('data standard and tiers', () => {
  const tiered = [
    { ...fig('ttf', 'Time to fill'), tier: 'gold' as const },
    {
      ...fig('stage', 'Stage conversion'),
      tier: 'bronze' as const,
      withheld: true,
      columns: WITHHELD_COLUMNS,
      rows: withheldRows('Not yet confirmed for production', 'Held back by Candidates current stage.'),
      // A stale note from the figure must never reach the export.
      note: 'overall 4.6%',
    },
  ]

  it('states the standard on the Summary and lists each figure with its tier', async () => {
    const wb = await buildViewWorkbook(
      tiered,
      { ...meta, tab: 'Pipeline', standard: 'gold' },
      {
        showPay: false,
        images: false,
      },
    )
    const ws = wb.getWorksheet('Summary')!
    const rows: unknown[][] = []
    ws.eachRow((row) => {
      rows.push([1, 2, 3, 4, 5, 6].map((c) => row.getCell(c).value))
    })
    expect(rows).toContainEqual(['Data standard', 'Production (gold only)', null, null, null, null])
    const head = rows.find((r) => r[0] === '#')!
    expect(head).toEqual(['#', 'Figure', 'Tier', 'What it shows', 'Rows', 'Note'])
    const withheld = rows.find((r) => (r[1] as { text?: string })?.text === 'Stage conversion')!
    expect(withheld[2]).toBe('Bronze, not shown')
    // The reason is exported, not the data, so no row count is claimed, and no note.
    expect(withheld[4]).toBeNull()
    expect(withheld[5]).toBe('')
    const sheet = wb.getWorksheet('Stage conversion')!
    // Title, subtitle, view line, then the data line.
    expect(String(sheet.getCell(4, 1).value)).toBe(
      'Data standard: Production (gold only) · Tier: Bronze, not shown under this standard',
    )
    const titleBlock: string[] = []
    for (let r = 1; r < 10; r++) titleBlock.push(String(sheet.getCell(r, 1).value ?? ''))
    expect(titleBlock.join(' ')).not.toContain('4.6%')
  })

  it('keeps the Summary columns as before when no figure has a tier', async () => {
    const wb = await buildViewWorkbook([fig('ttf', 'Time to fill')], meta, { showPay: false, images: false })
    const ws = wb.getWorksheet('Summary')!
    let head: unknown[] = []
    ws.eachRow((row) => {
      if (row.getCell(1).value === '#') head = [1, 2, 3, 4, 5].map((c) => row.getCell(c).value)
    })
    expect(head).toEqual(['#', 'Figure', 'What it shows', 'Rows', 'Note'])
  })

  it('puts the tier before the note in slide footers', () => {
    expect(slideFootnote({ tier: 'silver', note: '62 reqs filled' })).toBe('Tier: Silver  ·  62 reqs filled')
    expect(slideFootnote({ tier: 'bronze', withheld: true })).toBe(
      'Tier: Bronze, not shown under this standard',
    )
    expect(slideFootnote({ tier: 'bronze', withheld: true, note: 'company 68.2%' }, 'gold')).toBe(
      'Production standard  ·  Tier: Bronze, not shown under this standard',
    )
    expect(slideFootnote({ note: 'n = 40' })).toBe('n = 40')
    expect(slideFootnote({ tier: 'gold', note: 'n = 40' }, 'gold')).toBe(
      'Production standard  ·  Tier: Gold  ·  n = 40',
    )
  })
})
