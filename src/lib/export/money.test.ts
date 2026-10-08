/**
 * Money columns and the mode lines in every export (docs/ROLES-V2.md 3.1, 3.2, 4.11): `pay` columns
 * follow pay amounts, `cost` columns follow cost totals (pay amounts on, or Finance), and every
 * export outside HR and Developer says which mode made it, with Finance's cost line in place of
 * "Pay amounts".
 */
import { describe, expect, it } from 'vitest'
import { BANNED_MODE_WORDS, FINANCE_EXPORT_LINE } from '@/access/copy'
import { MODES } from '@/access/modes'
import { emptyUnitScope } from '@/access/scopes/unit'
import { sampleCtx } from '@/ask/engine/testkit'
import type { Column, ExportMeta, RegisteredFigure } from '@/charts/types'
import { toTsv } from './clipboard'
import { moneyDropped, moneyLeftOut, moneyOpts, moneyShown, readMoney, visibleColumns } from './columns'
import { csvPreamble, toCsv } from './csv'
import { EVERY_RECRUITER_SCOPE, modeMeta } from './modeMeta'
import { imageFooter, modeLines, withoutDataContext } from './names'
import { buildViewWorkbook, payFact } from './view'
import { buildWorkbook } from './xlsx'

const cols: Column[] = [
  { key: 'unit', label: 'Business unit' },
  { key: 'people', label: 'People', format: 'int' },
  { key: 'cash', label: 'Target cash (USD)', format: 'money', cost: true },
  { key: 'base', label: 'Base salary', format: 'moneyFull', pay: true },
  { key: 'cr', label: 'Compa-ratio', format: 'num2' },
]
const rows = [{ unit: 'Silicon Engineering', people: 412, cash: 98_000_000, base: 182_000, cr: 1.02 }]
const keys = (cs: readonly Column[]) => cs.map((c) => c.key)

const meta: ExportMeta = {
  view: 'Compensation',
  tab: 'Workforce cost',
  scope: 'Whole company',
  window: 'Last 12 months',
  asOf: '2026-09-30',
  isSample: true,
  company: 'Northgate Semiconductor',
}

describe('money columns', () => {
  it('keeps pay columns with pay amounts on, cost columns with cost totals on', () => {
    expect(keys(visibleColumns(cols, { pay: false, cost: false }))).toEqual(['unit', 'people', 'cr'])
    // Finance: totals over groups, never one person's amount.
    expect(keys(visibleColumns(cols, { pay: false, cost: true }))).toEqual(['unit', 'people', 'cash', 'cr'])
    expect(keys(visibleColumns(cols, { pay: true, cost: true }))).toEqual(keys(cols))
    // Pay amounts on always allows totals; a plain boolean means pay amounts.
    expect(keys(visibleColumns(cols, { pay: true, cost: false }))).toEqual(keys(cols))
    expect(keys(visibleColumns(cols, true))).toEqual(keys(cols))
    expect(keys(visibleColumns(cols, false))).toEqual(['unit', 'people', 'cr'])
  })

  it('reads the context flags, cost following pay when not given', () => {
    expect(moneyShown({ showPay: false })).toEqual({ pay: false, cost: false })
    expect(moneyShown({ showPay: true })).toEqual({ pay: true, cost: true })
    expect(moneyShown({ showPay: false, showCost: true })).toEqual({ pay: false, cost: true })
    expect(moneyOpts({ showPay: false, showCost: true })).toEqual({ showPay: false, showCost: true })
    expect(readMoney({ pay: true, cost: false })).toEqual({ pay: true, cost: true })
    expect(moneyDropped({ cost: true }, { pay: false, cost: true })).toBe(false)
    expect(moneyDropped({ pay: true }, { pay: false, cost: true })).toBe(true)
  })

  it('says when money was left out of an export', () => {
    const tables = [{ columns: cols }]
    expect(moneyLeftOut(tables, { pay: true, cost: true })).toBe(false)
    expect(moneyLeftOut(tables, { pay: false, cost: true })).toBe(true)
    expect(moneyLeftOut([{ columns: [cols[0], cols[2]] }], { pay: false, cost: true })).toBe(false)
  })

  it('writes the same columns to CSV and the clipboard', () => {
    const csv = toCsv({ columns: cols, rows }, { showPay: false, showCost: true, bom: false })
    expect(csv.split('\r\n')[0]).toBe('Business unit,People,Target cash (USD),Compa-ratio')
    expect(toTsv({ columns: cols, rows }, { showPay: false }).split('\n')[0]).toBe(
      'Business unit\tPeople\tCompa-ratio',
    )
  })

  it('writes the cost column to Excel in Finance and drops the pay column', async () => {
    const wb = await buildWorkbook([{ name: 'Cost', columns: cols, rows }], meta, {
      showPay: false,
      showCost: true,
    })
    const ws = wb.getWorksheet('Cost')!
    const heads: string[] = []
    ws.eachRow((row) => {
      if (row.getCell(1).value === 'Business unit')
        row.eachCell((c) => {
          heads.push(String(c.value))
        })
    })
    expect(heads).toEqual(['Business unit', 'People', 'Target cash (USD)', 'Compa-ratio'])
  })
})

describe('mode lines', () => {
  const hr = sampleCtx()
  const scoped = (mode: (typeof MODES)[number]) => modeMeta({ mode, scope: null, unset: false })

  it('stamps every mode but HR and Developer', () => {
    expect(scoped('hr')).toEqual({})
    expect(scoped('developer')).toEqual({})
    expect(scoped('chro').modeLine).toBe('Made in CHRO mode.')
    expect(scoped('compensation').modeLine).toBe('Made in Compensation mode.')
    expect(scoped('talent-management').modeLine).toBe('Made in Talent management mode.')
    expect(scoped('hr-ops').modeLine).toBe('Made in HR ops mode.')
    expect(scoped('finance')).toEqual({ modeLine: 'Made in Finance mode.', costLine: FINANCE_EXPORT_LINE })
    expect(scoped('recruiter').modeLine).toBe(`Made in Recruiter mode for ${EVERY_RECRUITER_SCOPE}.`)
    for (const m of MODES) {
      const lines = modeLines(scoped(m)).join(' ')
      expect(lines, m).not.toMatch(/—/)
      for (const w of BANNED_MODE_WORDS) expect(lines.toLowerCase(), m).not.toContain(w)
    }
  })

  it('names the scope, and none while the pick is missing', () => {
    const unit = sampleCtx({ access: { mode: 'hrbp-unit', picks: { unit: 'Silicon Engineering' } } })
    expect(modeMeta(unit.access).modeLine).toBe('Made in HRBP mode for Silicon Engineering.')
    const region = sampleCtx({ access: { mode: 'hrbp-region', picks: { region: 'APAC' } } })
    expect(modeMeta(region.access).modeLine).toBe('Made in HRBP mode for APAC.')
    const boss = [...hr.org.children.entries()].sort((a, b) => b[1].length - a[1].length)[0][0]
    const mgr = sampleCtx({ access: { mode: 'manager', picks: { managerId: boss } } })
    expect(modeMeta(mgr.access).modeLine).toBe(
      `Made in Manager mode for ${hr.org.byId.get(boss)?.name}'s org.`,
    )
    expect(modeMeta({ mode: 'hrbp-unit', scope: emptyUnitScope(null), unset: true }).modeLine).toBe(
      'Made in HRBP mode.',
    )
  })

  it('puts the lines on CSV preambles, sheet title blocks, image footers and the Summary', async () => {
    const fin = { ...meta, ...scoped('finance') }
    const pre = csvPreamble({ name: 'Cost', columns: cols, rows }, fin)
    expect(pre).toContain('Made in Finance mode.')
    expect(pre).toContain(FINANCE_EXPORT_LINE)
    expect(csvPreamble({ name: 'Cost', columns: cols, rows }, meta).join(' ')).not.toContain('Made in')
    expect(imageFooter({ ...meta, ...scoped('chro') })).toContain('Made in CHRO mode ·')
    // A view that reads no people data carries no mode lines.
    expect(modeLines(withoutDataContext(fin))).toEqual([])

    const book = await buildWorkbook([{ name: 'Cost', columns: cols, rows }], fin, {
      showPay: false,
      showCost: true,
    })
    const block: string[] = []
    book.getWorksheet('Cost')!.eachRow((row) => {
      block.push(String(row.getCell(1).value ?? ''))
    })
    expect(block).toContain('Made in Finance mode.')
    expect(block).toContain(FINANCE_EXPORT_LINE)

    const figure: RegisteredFigure = {
      id: 'c',
      title: 'Cost',
      columns: cols,
      rows,
      getSvg: () => null,
      order: 0,
    }
    const wb = await buildViewWorkbook([figure], fin, { showPay: false, showCost: true, images: false })
    const facts = new Map<string, string>()
    wb.getWorksheet('Summary')!.eachRow((row) => {
      facts.set(String(row.getCell(1).value ?? ''), String(row.getCell(2).value ?? ''))
    })
    expect(facts.get('Mode')).toBe('Made in Finance mode.')
    expect(facts.get('Pay')).toBe(FINANCE_EXPORT_LINE)
    expect(facts.has('Pay amounts')).toBe(false)
  })

  it('says "Pay amounts" outside Finance only when a figure has money columns', () => {
    expect(payFact({}, { pay: false, cost: false }, false, false)).toEqual([])
    expect(payFact({}, { pay: true, cost: true }, true, true)).toEqual([['Pay amounts', 'Included']])
    expect(payFact({}, { pay: false, cost: false }, false, true)).toEqual([['Pay amounts', 'Left out']])
    expect(payFact({ costLine: FINANCE_EXPORT_LINE }, { pay: false, cost: true }, true, true)).toEqual([
      ['Pay', FINANCE_EXPORT_LINE],
    ])
  })
})
