import { describe, expect, it } from 'vitest'
import type { Column } from '@/charts/types'
import { toTsv } from './clipboard'
import { cellFormat, columnAlign, columnFormat, plainText, rowFormat, sampleRow } from './columns'
import { toCsv } from './csv'

type MetricRow = {
  metric: string
  unit: 'rate' | 'days' | 'multiple'
  value: number | null
}

const rows: MetricRow[] = [
  { metric: 'Offer acceptance', unit: 'rate', value: 0.8543 },
  { metric: 'Time to fill', unit: 'days', value: 41.5 },
  { metric: 'Pipeline coverage', unit: 'multiple', value: 1.58 },
  { metric: 'Hidden', unit: 'rate', value: null },
]

const valueFormat = (r: MetricRow) => (r.unit === 'rate' ? 'pct' : r.unit === 'days' ? 'days' : 'times')
const columns: Column<MetricRow>[] = [
  { key: 'metric', label: 'Metric' },
  { key: 'value', label: 'Value', format: valueFormat },
]

describe('per-row column formats', () => {
  it('resolves a fixed or per-row format for a row', () => {
    expect(rowFormat({ format: 'int' }, rows[0])).toBe('int')
    expect(rowFormat(columns[1], rows[0])).toBe('pct')
    expect(rowFormat(columns[1], rows[1])).toBe('days')
    expect(rowFormat(columns[1])).toBeUndefined()
    expect(rowFormat({}, rows[0])).toBeUndefined()
  })

  it('samples the column format on the first row with a value', () => {
    const records = [{ metric: 'x', unit: 'days', value: null }, ...rows] as MetricRow[]
    expect(sampleRow(records, 'value')).toBe(rows[0])
    expect(sampleRow([] as MetricRow[], 'value')).toBeUndefined()
    expect(columnFormat(columns[1], 0.8543, rows[0])).toBe('pct')
    // Without a row to apply it to, a per-row format falls back to inference.
    expect(columnFormat(columns[1], 41.5)).toBe('num2')
    expect(columnFormat({ format: 'int' }, 'x')).toBe('int')
  })

  it('formats each cell with its own row', () => {
    expect(cellFormat(columns[1], rows[1], 'pct')).toBe('days')
    expect(cellFormat({ format: 'int' }, rows[1], 'int')).toBe('int')
    expect(columnAlign(columns[1], 0.8543, rows[0])).toBe('right')
    expect(columnAlign(columns[1], 0.8543)).toBe('right')
    expect(columnAlign(columns[0], 'Offer acceptance')).toBe('left')
  })

  it('writes plain text per row in CSV and TSV', () => {
    expect(plainText(0.8543, valueFormat, rows[0])).toBe('85.43%')
    expect(plainText(41.5, valueFormat, rows[1])).toBe('41.5')
    expect(plainText(0.0354, 'pct2')).toBe('3.54%')
    const csv = toCsv({ columns, rows }, { showPay: false, bom: false })
    expect(csv.split('\r\n').slice(0, 5)).toEqual([
      'Metric,Value',
      'Offer acceptance,85.43%',
      'Time to fill,41.5',
      'Pipeline coverage,1.58',
      'Hidden,',
    ])
    expect(toTsv({ columns, rows }, { showPay: false }).split('\n')[1]).toBe('Offer acceptance\t85.43%')
  })
})
