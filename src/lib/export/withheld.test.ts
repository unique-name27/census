import { describe, expect, it } from 'vitest'
import type { Column } from '@/charts/types'
import { exportNote, figureExport, WITHHELD_COLUMNS } from './withheld'

const columns: Column[] = [
  { key: 'level', label: 'Level' },
  { key: 'days', label: 'Median days', format: 'days' },
]
const rows = [{ level: 'L4', days: 52 }]

describe('figureExport', () => {
  it('exports the figure as it is when the standard shows it', () => {
    const out = figureExport({ columns, rows, note: 'company median 52 d' }, null)
    expect(out.withheld).toBe(false)
    expect(out.rows).toBe(rows)
    expect(out.columns).toBe(columns)
    expect(out.note).toBe('company median 52 d')
  })

  it('exports only the reason, and no note, when the standard holds the figure back', () => {
    const out = figureExport(
      { columns, rows, note: 'company median 52 d' },
      {
        title: 'Not yet confirmed for production',
        body: 'Held back by Requisitions, which is Silver.',
        raise: 'To raise it, have the data owner certify this Requisitions version in the Data room.',
      },
    )
    expect(out.withheld).toBe(true)
    expect(out.columns).toBe(WITHHELD_COLUMNS)
    expect(out.note).toBeUndefined()
    expect(out.rows).toEqual([
      {
        status: 'Not yet confirmed for production',
        reason:
          'Held back by Requisitions, which is Silver. To raise it, have the data owner certify this Requisitions version in the Data room.',
      },
    ])
    // Nothing the figure computed leaks into the export.
    expect(JSON.stringify(out)).not.toContain('52')
  })
})

describe('exportNote', () => {
  it('drops the note of a withheld table whatever the caller passed', () => {
    expect(exportNote({ note: '15 reqs on hold, median 114 d open', withheld: true })).toBeUndefined()
    expect(exportNote({ note: 'n = 40' })).toBe('n = 40')
    expect(exportNote({ note: '' })).toBeUndefined()
  })
})
