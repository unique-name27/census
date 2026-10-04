import { describe, expect, it } from 'vitest'
import type { Column } from '@/charts/types'
import { toTsv } from './clipboard'
import { csvField, csvPreamble, guardFormula, toCsv } from './csv'

const columns: Column[] = [
  { key: 'name', label: 'Name' },
  { key: 'rate', label: 'Attrition', format: 'pct' },
  { key: 'salary', label: 'Salary', format: 'moneyFull', pay: true },
  { key: 'n', label: 'People', format: 'int' },
]

describe('guardFormula', () => {
  it('prefixes values a spreadsheet would execute', () => {
    for (const s of ['=SUM(A1)', '+1', '-2+3', '@cmd', '\tx', '\rx']) expect(guardFormula(s)).toBe(`'${s}`)
  })
  it('leaves ordinary text alone', () => {
    for (const s of ['Bengaluru', 'a=b', '', ' =x']) expect(guardFormula(s)).toBe(s)
  })
})

describe('csvField', () => {
  it('quotes commas, quotes and line breaks and doubles quotes', () => {
    expect(csvField('a,b')).toBe('"a,b"')
    expect(csvField('say "hi"')).toBe('"say ""hi"""')
    expect(csvField('line1\nline2')).toBe('"line1\nline2"')
    expect(csvField('plain')).toBe('plain')
  })
  it('guards before quoting', () => {
    expect(csvField('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
  })
})

describe('toCsv', () => {
  const rows = [
    { name: 'Austin, TX', rate: 0.124, salary: 150000, n: 42 },
    { name: '=cmd()', rate: null, salary: 90000, n: -3 },
  ]

  it('writes a BOM, CRLF rows and drops pay columns by default', () => {
    const csv = toCsv({ columns, rows }, { showPay: false })
    expect(csv.startsWith('﻿')).toBe(true)
    const lines = csv.slice(1).split('\r\n')
    expect(lines[0]).toBe('Name,Attrition,People')
    expect(lines[1]).toBe('"Austin, TX",12.4%,42')
    // missing stays empty, negative numbers are not treated as formulas
    expect(lines[2]).toBe(`'=cmd(),,-3`)
    expect(lines[3]).toBe('')
  })

  it('includes pay columns when pay amounts are on', () => {
    const csv = toCsv({ columns, rows }, { showPay: true, bom: false })
    expect(csv.split('\r\n')[0]).toBe('Name,Attrition,Salary,People')
    expect(csv.split('\r\n')[1]).toBe('"Austin, TX",12.4%,150000,42')
  })

  it('writes an optional preamble above the header', () => {
    const csv = toCsv(
      { columns, rows: [] },
      { showPay: false, bom: false, preamble: ['Title', 'Whole company'] },
    )
    expect(csv.split('\r\n').slice(0, 4)).toEqual(['Title', 'Whole company', '', 'Name,Attrition,People'])
  })
})

describe('toTsv', () => {
  it('flattens tabs and newlines and guards formulas', () => {
    const tsv = toTsv(
      {
        columns: [
          { key: 'a', label: 'A' },
          { key: 'b', label: 'B', format: 'pct0' },
        ],
        rows: [
          { a: 'x\ty\nz', b: 0.5 },
          { a: '+1', b: null },
        ],
      },
      { showPay: false },
    )
    expect(tsv).toBe("A\tB\nx y z\t50%\n'+1\t")
  })
})

describe('csvPreamble', () => {
  it('states the data standard and the tier between the context and the stamp', () => {
    const lines = csvPreamble(
      { name: 'ttf', title: 'Time to fill', columns, rows: [], tier: 'gold' },
      {
        view: 'Recruiting',
        scope: 'Whole company',
        window: 'Last 12 months',
        asOf: '2026-09-30',
        isSample: false,
        company: 'Company data',
        standard: 'silver',
      },
    )
    expect(lines).toEqual([
      'Time to fill',
      'Whole company · Last 12 months · As of 30 Sep 2026',
      'Data standard: Validated (silver and up) · Tier: Gold',
      'Company confidential',
    ])
  })
})
